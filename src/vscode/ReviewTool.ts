import * as vscode from 'vscode';

import { reviewDiff } from '@/review/review';
import { type Ref, UncommittedRef } from '@/types/Ref';
import { getConfig } from './config';

// Input for #review
type CommittedReviewInput = {
    target: string;
    base: string;
};

// Input for #reviewStaged and #reviewUnstaged (empty)
type UncommittedReviewInput = {
    changeDescription?: string;
};

// Union type for all possible inputs
export type ReviewInput = CommittedReviewInput | UncommittedReviewInput;

type ReviewToolConfig = {
    defaultTarget?: UncommittedRef;
};

export class ReviewTool implements vscode.LanguageModelTool<ReviewInput> {
    private toolConfig?: ReviewToolConfig;

    constructor(config?: ReviewToolConfig) {
        this.toolConfig = config;
    }

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<ReviewInput>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { target, base } = this.getReviewTarget(options.input);

        const config = await getConfig();
        const reviewRequest = {
            scope: await config.git.getReviewScope(target, base),
        };
        if ('changeDescription' in options.input) {
            reviewRequest.scope.changeDescription =
                options.input.changeDescription;
        }

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
        const { target, base } = this.getReviewTarget(options.input);
        let message: string;

        if (target === UncommittedRef.Staged) {
            message = `LGTM: Reviewing staged changes...`;
        } else if (target === UncommittedRef.Unstaged) {
            message = `LGTM: Reviewing unstaged changes...`;
        } else {
            message = `LGTM: Reviewing changes on ${target} compared to ${base}...`;
        }

        return {
            invocationMessage: message,
        };
    }

    private getReviewTarget(toolInput: ReviewInput) {
        let target: Ref;
        let base: string | undefined;

        if (this.toolConfig?.defaultTarget !== undefined) {
            // Case 1: Using defaultTarget from config (for reviewStaged/reviewUnstaged tools)
            target = this.toolConfig.defaultTarget;
            base = undefined;
        } else {
            // Case 2: Using values from input (for regular review tool)
            const input = toolInput as CommittedReviewInput;
            if (!input.target) {
                throw new Error("Missing required parameter 'target'");
            }
            if (!input.base) {
                throw new Error("Missing required parameter 'base'");
            }
            target = input.target;
            base = input.base;
        }
        return { target, base };
    }
}
