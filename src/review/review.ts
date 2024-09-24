import type { CancellationToken, ChatResponseStream } from 'vscode';

import { Config } from '../types/Config';
import { FileComments } from '../types/FileComments';
import { Model } from '../types/Model';
import { ReviewRequest } from '../types/ReviewRequest';
import { getChangedFiles, getFileDiff, getReviewScope } from '../utils/git';
import { parseResponse, sortFileCommentsBySeverity } from './comment';

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
        console.debug(`Response for ${file}:`, response);

        fileComments.push({
            target: file,
            comments: parseResponse(response),
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
You are a senior software engineer reviewing a pull request.
Analyze the following git diff for one of the changed files. Each line consists of the line number of the target file, a tab character, and the actual diff line.
Lines starting with \`-\` after the line number are removed, lines starting with \`+\` are added and lines starting with \` \` are unchanged lines provided for context.
Provide comments on bugs, security vulnerabilities, code smells, and typos. There is no need to provide comments for removed lines.

Respond with a JSON list of comments objects, which contain the fields \`comment\`, \`line\`, and \`severity\`.
\`comment\` is a string describing the issue.
\`line\` is the first affected line number.
\`severity\` is the severity of the issue as an integer from 1 (likely irrelevant) to 5 (critical).
Respond with only JSON, do NOT include other text or markdown.

Example response:
\`\`\`json
${JSON.stringify(responseExample, undefined, 2)}
\`\`\`

The change has the following description:
\`\`\`
${changeDescription}
\`\`\`

And the diff for one of the changed files is:
\`\`\`
${diff}
\`\`\`
`;
}

export const responseExample = [
    {
        comment: 'The <script> tag is missspelled as <scirpt>.',
        line: 23,
        severity: 4,
    },
    {
        comment:
            'Using `eval()` with a possibly user-supplied string may result in code injection.',
        line: 55,
        severity: 5,
    },
    { comment: 'This code is not formatted correctly.', line: 93, severity: 2 },
];
