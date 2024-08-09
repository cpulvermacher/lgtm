import * as vscode from 'vscode';

import { Config } from './config';
import { limitTokens } from './utils';
export type FileReview = {
    target: string; // target file
    comment: string; // review comment
    severity: number; // in 0..5
};

export async function reviewDiff(
    config: Config,
    stream: vscode.ChatResponseStream,
    diffRevisionRange: string,
    cancellationToken: vscode.CancellationToken
) {
    //get list of files in the commit
    const fileString = await config.git.diff([
        '--name-only',
        diffRevisionRange,
    ]);
    const files = fileString.split('\n').filter((f) => f.length > 0);

    stream.markdown(`Found ${files.length} files.\n\n`);

    const reviewComments: FileReview[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (cancellationToken.isCancellationRequested) {
            return;
        }

        stream.progress(`Reviewing file ${file} (${i + 1}/${files.length})`);

        const diff = await config.git.diff([
            '--no-prefix',
            diffRevisionRange,
            '--',
            file,
        ]);

        if (diff.length === 0) {
            console.debug('No changes in file:', file);
            continue;
        }

        const { comment, severity } = await getReviewComment(
            config.model,
            diff,
            cancellationToken
        );

        reviewComments.push({
            target: file,
            comment,
            severity,
        });
    }
    return reviewComments;
}

export async function getReviewComment(
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

    let comment = '';
    try {
        for await (const fragment of response.text) {
            comment += fragment;
        }
    } catch (e) {
        throw new Error(`Stream error: ${e}`);
    }

    const severityMatch = comment.match(/\n(\d)\/5$/);
    if (!severityMatch) {
        console.debug('No severity found in:', comment);
    }
    const severity = severityMatch ? parseInt(severityMatch[1]) : 3;

    return { comment, severity };
}

function createReviewPrompt(): string {
    return `You are a senior software engineer reviewing a pull request. Please review the following diff for any problems. Be succinct in your response. You must end your answer with "\\nN/5", replacing N with an integer in 0..5 denoting the severity (0: nothing to do, 5: blocker).`;
}
