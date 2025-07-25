import type { CancellationToken, Progress } from 'vscode';

import { Config } from '@/types/Config';
import { ModelError } from '@/types/ModelError';
import { ReviewComment } from '@/types/ReviewComment';
import { ReviewRequest } from '@/types/ReviewRequest';
import { ReviewResult } from '@/types/ReviewResult';
import { correctFilename } from '@/utils/filenames';
import { DiffFile } from '@/utils/git';
import { isPathNotExcluded } from '@/utils/glob';
import type { PromptType } from '../types/PromptType';
import { parseResponse, sortFileCommentsBySeverity } from './comment';
import { ModelRequest } from './ModelRequest';
import { defaultPromptType, toPromptTypes } from './prompt';

export async function reviewDiff(
    config: Config,
    request: ReviewRequest,
    progress?: Progress<{ message?: string; increment?: number }>,
    cancellationToken?: CancellationToken
): Promise<ReviewResult> {
    const diffFiles = await config.git.getChangedFiles(request.scope);
    const options = config.getOptions();
    const files = diffFiles.filter(
        (file) =>
            isPathNotExcluded(file.file, options.excludeGlobs) &&
            file.status !== 'D' // ignore deleted files
    );

    //TODO reorder to get relevant input files together, e.g.
    // order by distance: file move < main+test < same dir (levenshtein) < parent dir (levenshtein) < ...

    const modelRequests = await aggregateFileDiffs(
        config,
        request,
        files,
        progress,
        cancellationToken
    );
    config.logger.debug(
        `Assigned ${files.length} files to ${modelRequests.length} model requests.`
    );

    const { commentsPerFile, errors } = await generateReviewComments(
        config,
        modelRequests,
        progress,
        cancellationToken
    );

    const fileComments = Array.from(commentsPerFile, ([target, comments]) => ({
        target,
        comments,
    }));

    return {
        request,
        fileComments: sortFileCommentsBySeverity(fileComments),
        errors,
    };
}

async function aggregateFileDiffs(
    config: Config,
    request: ReviewRequest,
    files: DiffFile[],
    progress?: Progress<{ message?: string; increment?: number }>,
    cancellationToken?: CancellationToken
) {
    const options = config.getOptions();
    const modelRequests: ModelRequest[] = [];
    for (const file of files) {
        if (cancellationToken?.isCancellationRequested) {
            break;
        }

        progress?.report({
            message: `Gathering changes for ${files.length} files...`,
            increment: 100 / files.length,
        });

        const diff = await config.git.getFileDiff(request.scope, file);
        if (diff.length === 0) {
            config.logger.debug('No changes in file:', file);
            continue;
        }
        config.logger.debug(`Diff for ${file.file}:`, diff);

        // if merging is off, create a new request for each file
        if (modelRequests.length === 0 || !options.mergeFileReviewRequests) {
            const modelRequest = new ModelRequest(
                config,
                request.scope.changeDescription
            );
            modelRequests.push(modelRequest);
        }

        // try adding this diff to the last model request
        try {
            await modelRequests[modelRequests.length - 1].addDiff(
                file.file,
                diff
            );
        } catch {
            // if the diff cannot be added to the last request, create a new one
            const modelRequest = new ModelRequest(
                config,
                request.scope.changeDescription
            );
            await modelRequest.addDiff(file.file, diff); // adding the first diff will never throw
            modelRequests.push(modelRequest);
        }
    }
    return modelRequests;
}

async function generateReviewComments(
    config: Config,
    modelRequests: ModelRequest[],
    progress?: Progress<{ message?: string; increment?: number }>,
    cancellationToken?: CancellationToken
) {
    const promptTypes = toPromptTypes(config.getOptions().comparePromptTypes);

    const totalRequests = modelRequests.length * promptTypes.length;
    let requestCounter = 0;
    const updateProgress = () => {
        requestCounter++;
        const isSingle = totalRequests <= 1;
        const increment = isSingle ? -100 : 100 / totalRequests;
        const message = isSingle
            ? 'Reviewing...'
            : `Reviewing (${requestCounter}/${totalRequests})...`;
        progress?.report({ message, increment });
    };

    const errors = [];
    const commentsPerFile = new Map<string, ReviewComment[]>();
    for (const modelRequest of modelRequests) {
        for (const promptType of promptTypes) {
            if (cancellationToken?.isCancellationRequested) {
                return { commentsPerFile, errors };
            }

            updateProgress();
            try {
                await processRequest(
                    config,
                    modelRequest,
                    commentsPerFile,
                    promptType,
                    cancellationToken
                );
            } catch (error) {
                // it's entirely possible that something bad happened for a request, let's store the error and continue if possible
                if (error instanceof ModelError) {
                    errors.push(error);
                    // would also fail for the remaining files
                    return { commentsPerFile, errors };
                } else if (error instanceof Error) {
                    errors.push(error);
                    continue;
                }
                continue;
            }
        }
    }

    return { commentsPerFile, errors };
}

async function processRequest(
    config: Config,
    modelRequest: ModelRequest,
    commentsPerFile: Map<string, ReviewComment[]>,
    promptType?: PromptType,
    cancellationToken?: CancellationToken
) {
    const reviewStart = Date.now();
    const { response, promptTokens, responseTokens } =
        await modelRequest.sendRequest(cancellationToken, promptType);
    const reviewDuration = Date.now() - reviewStart;
    config.logger.debug(
        `Received review response. Took=${reviewDuration}ms, Files=${modelRequest.files.length}, prompt type=${promptType ?? defaultPromptType}, request tokens=${promptTokens}, response tokens=${responseTokens}, Response=${response}`
    );

    const comments = parseResponse(response);
    for (const comment of comments) {
        //check file name
        if (!modelRequest.files.includes(comment.file)) {
            const closestFile = correctFilename(
                comment.file,
                modelRequest.files
            );
            config.logger.info(
                `File name mismatch, correcting "${comment.file}" to "${closestFile}"!`
            );
            comment.file = closestFile;
        }

        comment.promptType = promptType;
        const commentsForFile = commentsPerFile.get(comment.file) || [];
        commentsForFile.push(comment);
        commentsPerFile.set(comment.file, commentsForFile);
    }
}
