import type { CancellationToken, Progress } from 'vscode';

import { Config } from '../types/Config';
import { ModelError } from '../types/ModelError';
import { ReviewComment } from '../types/ReviewComment';
import { ReviewRequest } from '../types/ReviewRequest';
import { ReviewResult } from '../types/ReviewResult';
import { correctFilename } from '../utils/filenames';
import { filterExcludedFiles } from '../utils/glob';
import { parseResponse, sortFileCommentsBySeverity } from './comment';
import { ModelRequest } from './ModelRequest';

export async function reviewDiff(
    config: Config,
    request: ReviewRequest,
    progress: Progress<{ message?: string; increment?: number }>,
    cancellationToken: CancellationToken
): Promise<ReviewResult> {
    const diffFiles = await config.git.getChangedFiles(
        request.scope.revisionRangeDiff
    );
    const options = config.getOptions();
    const files = filterExcludedFiles(diffFiles, options.excludeGlobs);

    //TODO reorder to get relevant input files together, e.g.
    // order by distance: file move < main+test < same dir (levenshtein) < parent dir (levenshtein) < ...

    const modelRequests: ModelRequest[] = [];
    for (const file of files) {
        if (cancellationToken.isCancellationRequested) {
            break;
        }

        progress.report({
            message: 'Gathering changes...',
            increment: 100 / files.length,
        });

        const diff = await config.git.getFileDiff(
            request.scope.revisionRangeDiff,
            file
        );
        if (diff.length === 0) {
            config.logger.debug('No changes in file:', file);
            continue;
        }
        config.logger.debug(`Diff for ${file}:`, diff);

        // if merging is off, create a new request for each file
        if (modelRequests.length === 0 || !options.mergeFileReviewRequests) {
            const modelRequest = new ModelRequest(
                config,
                request.scope.changeDescription,
                request.userPrompt
            );
            modelRequests.push(modelRequest);
        }

        // try adding this diff to the last model request
        try {
            await modelRequests[modelRequests.length - 1].addDiff(file, diff);
        } catch {
            // if the diff cannot be added to the last request, create a new one
            const modelRequest = new ModelRequest(
                config,
                request.scope.changeDescription,
                request.userPrompt
            );
            await modelRequest.addDiff(file, diff); // adding the first diff will never throw
            modelRequests.push(modelRequest);
        }
    }
    config.logger.debug(
        `Assigned ${files.length} files to ${modelRequests.length} model requests.`
    );

    // reset to  an indeterminate progress bar for the review
    progress.report({ message: 'Reviewing...', increment: -100 });
    const errors = [];
    const commentsPerFile = new Map<string, ReviewComment[]>();
    for (const modelRequest of modelRequests) {
        if (cancellationToken.isCancellationRequested) {
            break;
        }

        if (modelRequests.length > 1) {
            progress.report({
                message: 'Reviewing...',
                increment: 100 / modelRequests.length,
            });
        }
        try {
            const { response, promptTokens, responseTokens } =
                await modelRequest.getReviewResponse(cancellationToken);
            config.logger.debug(
                `Request with ${modelRequest.files.length} files used ${promptTokens} tokens, response used ${responseTokens} tokens. Response: ${response}`
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

                const commentsForFile = commentsPerFile.get(comment.file) || [];
                commentsForFile.push(comment);
                commentsPerFile.set(comment.file, commentsForFile);
            }
        } catch (error) {
            // it's entirely possible that something bad happened for a request, let's store the error and continue if possible
            if (error instanceof ModelError) {
                errors.push(error);
                break; // would also fail for the remaining files
            } else if (error instanceof Error) {
                errors.push(error);
                continue;
            }
            continue;
        }
    }
    const fileComments = [];
    for (const [file, comments] of commentsPerFile) {
        fileComments.push({
            target: file,
            comments: comments,
        });
    }

    return {
        request,
        fileComments: sortFileCommentsBySeverity(fileComments),
        errors,
    };
}
