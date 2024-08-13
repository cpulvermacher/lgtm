import * as vscode from 'vscode';

import { Config } from './config';
import { getChangedFiles, getCommitRange, getFileDiff } from './git';
import { limitTokens } from './utils';

export type ReviewComment = {
    target: string; // target file
    comment: string; // review comment
    severity: number; // in 0..5
};

export async function reviewDiff(
    config: Config,
    stream: vscode.ChatResponseStream,
    oldRev: string,
    newRev: string,
    cancellationToken: vscode.CancellationToken
): Promise<ReviewComment[] | undefined> {
    const diffRevisionRange = await getCommitRange(config.git, oldRev, newRev);
    stream.markdown(`Reviewing ${diffRevisionRange}.\n`);

    const files = await getChangedFiles(config.git, diffRevisionRange);

    stream.markdown(`Found ${files.length} files.\n\n`);

    const reviewComments: ReviewComment[] = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (cancellationToken.isCancellationRequested) {
            return;
        }

        stream.progress(`Reviewing file ${file} (${i + 1}/${files.length})`);

        const diff = await getFileDiff(config.git, diffRevisionRange, file);
        if (diff.length === 0) {
            console.debug('No changes in file:', file);
            continue;
        }

        const response = await getReviewComments(
            config.model,
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

    console.debug('Final review comments:', reviewComments);
    return reviewComments;
}

export async function getReviewComments(
    model: vscode.LanguageModelChat,
    diff: string,
    cancellationToken: vscode.CancellationToken
) {
    const originalSize = diff.length;
    diff = await limitTokens(model, diff);
    if (diff.length < originalSize) {
        console.debug(`Diff truncated from ${originalSize} to ${diff.length}`);
    }

    const prompt = [
        vscode.LanguageModelChatMessage.User(createReviewPrompt()),
        vscode.LanguageModelChatMessage.User('```diff\n' + diff + '\n```'),
    ];
    const response = await model.sendRequest(prompt, {}, cancellationToken);

    return await readStream(response);
}

/** Parse model response into individual comments  */
function splitResponseIntoComments(response: string): string[] {
    const rawComments: string[] = [];
    const lines = response.split('\n');
    let comment = '';
    for (const line of lines) {
        if (line.startsWith(' - ')) {
            if (comment) {
                rawComments.push(comment);
            }
            comment = line;
        } else {
            comment += '\n' + line;
        }
    }
    if (comment) {
        rawComments.push(comment);
    }

    return rawComments;
}

function parseComment(comment: string) {
    comment = comment.trim();
    const severityRegex = /(\d)\/5$/;
    const severityMatch = comment.match(severityRegex);

    return {
        comment: comment.replace(severityRegex, '').trim(),
        severity: severityMatch ? parseInt(severityMatch[1]) : 3,
    };
}

/** Read response stream into a string */
async function readStream(
    responseStream: vscode.LanguageModelChatResponse
): Promise<string> {
    let text = '';
    try {
        for await (const fragment of responseStream.text) {
            text += fragment;
        }
    } catch (e) {
        throw new Error(`Stream error: ${e}`);
    }

    return text;
}

function createReviewPrompt(): string {
    return `
You are a senior software engineer reviewing a pull request. 
Please review the following diff for any problems, bearing in mind that it will not show the full context of the code.
Be succinct in your response.
For each issue you find, put the comment on a new line starting with \` - \` and ending in \` 1/5\` to \` 5/5\` to indicate the severity of the issue.
For example:
\`\`\`
 - Using \`eval()\` with a possibly user-supplied string is likely to result in code injection. 5/5
 - This code is not formatted correctly. 2/5
 - The <script> tag is missspelled as <scirpt>. 4/5
\`\`\`
`;
}
