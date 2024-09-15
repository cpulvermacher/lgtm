import type { CancellationToken, ChatResponseStream } from 'vscode';

import { Config } from '../types/Config';
import { FileComments } from '../types/FileComments';
import { Model } from '../types/Model';
import { ReviewRequest } from '../types/ReviewRequest';
import { getChangedFiles, getFileDiff, getReviewScope } from '../utils/git';
import {
    parseComment,
    parseResponse,
    sortFileCommentsBySeverity,
} from './comment';

export async function reviewDiff(
    config: Config,
    stream: ChatResponseStream,
    request: ReviewRequest,
    cancellationToken: CancellationToken
): Promise<FileComments[]> {
    const scope = await getReviewScope(config.git, request);
    const files = await getChangedFiles(config.git, scope.revisionRangeDiff);

    stream.markdown(`Found ${files.length} files.\n\n`);

    const fileComments = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (cancellationToken.isCancellationRequested) {
            return [];
        }

        stream.progress(`Reviewing file ${file} (${i + 1}/${files.length})`);

        const diff = await getFileDiff(
            config.git,
            scope.revisionRangeDiff,
            file
        );
        if (diff.length === 0) {
            console.debug('No changes in file:', file);
            continue;
        }

        const { response, promptTokens, responseTokens } =
            await getReviewResponse(
                config.model,
                scope.changeDescription,
                diff,
                cancellationToken
            );
        console.debug('Response:', response);

        fileComments.push({
            target: file,
            comments: parseResponse(response).map(parseComment),
            debug: {
                promptTokens,
                responseTokens,
            },
        });
    }

    return sortFileCommentsBySeverity(fileComments);
}

export async function getReviewResponse(
    model: Model,
    changeDescription: string,
    diff: string,
    cancellationToken: CancellationToken
) {
    const originalSize = diff.length;
    diff = await model.limitTokens(diff);
    if (diff.length < originalSize) {
        console.debug(`Diff truncated from ${originalSize} to ${diff.length}`);
    }

    const prompt = createReviewPrompt(changeDescription, diff);
    const response = await model.sendRequest(prompt, cancellationToken);

    return {
        response,
        promptTokens: await model.countTokens(prompt),
        responseTokens: await model.countTokens(response),
    };
}

function createReviewPrompt(changeDescription: string, diff: string): string {
    return `
You are a senior software engineer reviewing a change with the following description:
\`\`\`
${changeDescription}
\`\`\`
Analyze the following git diff for one of the changed files. Lines beginning with \`-\` are deletions, and lines beginning with \`+\` are additions. Lines beginning with \` \` are unchanged lines provided for context.
Provide insightful comments on how the code could be improved, bugs, and potential issues.
For each comment, respond with a new line starting with \` - \` and ending in \` 1/5\` to \` 5/5\` to indicate the severity of the issue.
For example:
 - Using \`eval()\` with a possibly user-supplied string is likely to result in code injection. 5/5
 - This code is not formatted correctly. 2/5
 - The <script> tag is missspelled as <scirpt>. 4/5

\`\`\`diff
${diff}
\`\`\`
`;
}
