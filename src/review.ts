import * as vscode from 'vscode';

import { limitTokens } from './utils';

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
