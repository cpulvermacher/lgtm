import type { CancellationToken, ChatResponseStream } from 'vscode';

import { ReviewRequest } from '../types/ReviewRequest';
import { Config } from '../utils/config';
import { getChangedFiles, getFileDiff, getReviewScope } from '../utils/git';
import { Model } from '../utils/model';
import { parseComment, splitResponseIntoComments } from './comment';

export type FileComments = {
    target: string; // target file
    comments: ReviewComment[];
    maxSeverity: number; // max comment severity in 0..5
};

export type ReviewComment = {
    target: string; // target file
    comment: string; // review comment
    severity: number; // in 0..5
};

export async function reviewDiff(
    config: Config,
    stream: ChatResponseStream,
    request: ReviewRequest,
    cancellationToken: CancellationToken
): Promise<ReviewComment[] | undefined> {
    const scope = await getReviewScope(config.git, request);

    stream.markdown(`Reviewing ${scope.revisionRange}.\n`);

    const files = await getChangedFiles(config.git, scope.revisionRange);

    stream.markdown(`Found ${files.length} files.\n\n`);

    const reviewComments: ReviewComment[] = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (cancellationToken.isCancellationRequested) {
            return;
        }

        stream.progress(`Reviewing file ${file} (${i + 1}/${files.length})`);

        const diff = await getFileDiff(config.git, scope.revisionRange, file);
        if (diff.length === 0) {
            console.debug('No changes in file:', file);
            continue;
        }

        const response = await getReviewComments(
            config.model,
            scope.changeDescription,
            diff,
            cancellationToken
        );
        console.debug('Response:', response);
        splitResponseIntoComments(response)
            .map(parseComment)
            .forEach((comment) => {
                reviewComments.push({
                    target: file,
                    comment: comment.comment,
                    severity: comment.severity,
                });
            });
    }

    return reviewComments;
}

export async function getReviewComments(
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
    return await model.sendRequest(prompt, cancellationToken);
}

function createReviewPrompt(changeDescription: string, diff: string): string {
    return `
You are a senior software engineer reviewing a change with the following description:
\`\`\`
${changeDescription}
\`\`\`
Please review the following diff for any problems, bearing in mind that it will not show the full context of the code.
For each issue you find, put the comment on a new line starting with \` - \` and ending in \` 1/5\` to \` 5/5\` to indicate the severity of the issue.
For example:
 - Using \`eval()\` with a possibly user-supplied string is likely to result in code injection. 5/5
 - This code is not formatted correctly. 2/5
 - The <script> tag is missspelled as <scirpt>. 4/5

\`\`\`diff
${diff}
\`\`\`
`;
}
