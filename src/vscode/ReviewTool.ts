import * as vscode from 'vscode';

import { reviewDiff } from '../review/review';
import { getConfig } from './config';

interface ReviewInput {
    target: string;
    base: string;
}

export class ReviewTool implements vscode.LanguageModelTool<ReviewInput> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<ReviewInput>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { target, base } = options.input;

        const config = await getConfig();
        const reviewRequest = {
            scope: await config.git.getReviewScope(target, base),
        };
        const result = await reviewDiff(
            config,
            reviewRequest,
            undefined,
            token
        );
        const comments = result.fileComments.flatMap((fileComment) => {
            return fileComment.comments.map(
                (comment) =>
                    `${comment.file}:${comment.line} - ${comment.comment} (Severity: ${comment.severity}/5)`
            );
        });

        return new vscode.LanguageModelToolResult(
            comments.map((comment) => new vscode.LanguageModelTextPart(comment))
        );
    }

    prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<ReviewInput>
    ): vscode.PreparedToolInvocation {
        return {
            invocationMessage: `LGTM: Reviewing changes on ${options.input.target} compared to ${options.input.base}...`,
        };
    }
}
