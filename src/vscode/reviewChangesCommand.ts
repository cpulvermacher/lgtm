import * as vscode from 'vscode';

import type { Config } from '@/types/Config';
import { UncommittedRef } from '@/types/Ref';
import type { ReviewComment } from '@/types/ReviewComment';
import type { ReviewScope } from '@/types/ReviewRequest';
import {
    formatReviewStartMessage,
    getModelDisplayNames,
    getReviewRequest,
    type ModelReviewError,
    type ModelReviewResult,
    runReviewWithModels,
} from '@/vscode/chat';
import { getConfig } from '@/vscode/config';

type ModelSelection = string | string[];

export type ReviewChangesCommandOptions = {
    target?: string;
    topic?: string;
    base?: string;
    scope?: 'staged' | 'unstaged';
    staged?: boolean;
    unstaged?: boolean;
    models?: ModelSelection;
    modelIds?: ModelSelection;
    reviewProviderIds?: ModelSelection;
};

export type ReviewChangesComment = ReviewComment & {
    modelId: string;
    modelName: string;
};

export type ReviewChangesError = {
    modelId?: string;
    modelName?: string;
    name: string;
    message: string;
    stack?: string;
};

export type ReviewChangesResult = {
    message: string;
    cancelled: boolean;
    comments: ReviewChangesComment[];
    errors: ReviewChangesError[];
    results: ModelReviewResult[];
};

type NormalizedReviewChangesArgs = {
    prompt: string;
    models?: ModelSelection;
};

/**
 * Programmatic review entry point. It mirrors the chat review flow, but reports
 * progress through a cancellable notification and returns structured results
 * instead of writing markdown back to the chat stream.
 */
export async function reviewChangesCommand(
    ...args: unknown[]
): Promise<ReviewChangesResult> {
    const config = await getConfig({ refreshWorkspace: true });
    config.logger.info('lgtm.reviewChanges called', { args });

    const normalized = normalizeReviewChangesArgs(args);
    const availableModels = await vscode.lm.selectChatModels();
    const modelIds = resolveReviewModelIds(
        normalized.models,
        config.getOptions().chatModel,
        config.getOptions().preferredModels
    );
    const modelNames = getModelDisplayNames(modelIds, availableModels);
    const reviewRequest = await getReviewRequest(config, normalized.prompt);
    if (!reviewRequest) {
        throw new Error('Could not create a review request.');
    }
    config.logger.info('lgtm.reviewChanges resolved', {
        prompt: normalized.prompt,
        scope: await createReviewScopeLog(config, reviewRequest.scope),
        models: modelIds.map((id, index) => ({
            id,
            name: modelNames[index],
        })),
    });

    const message = await formatReviewStartMessage(
        config,
        reviewRequest,
        modelNames,
        'plain'
    );

    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: message,
            cancellable: true,
        },
        async (progress, token) => {
            const { results, errors } = await runReviewWithModels(
                config,
                reviewRequest,
                modelIds,
                modelNames,
                createNotificationProgress(progress),
                token
            );

            return buildReviewChangesResult(
                message,
                token.isCancellationRequested,
                results,
                errors,
                config.getOptions().minSeverity
            );
        }
    );
}

/**
 * Supports both VS Code command calling styles: a single options object for
 * typed integrations, and positional arguments for lightweight callers using
 * `executeCommand`. Both paths normalize into the prompt format already used by
 * the chat review flow so the command does not need its own ref parsing logic.
 */
function normalizeReviewChangesArgs(
    args: unknown[]
): NormalizedReviewChangesArgs {
    if (args.length === 1 && isOptionsObject(args[0])) {
        return normalizeOptionsObject(args[0]);
    }

    if (typeof args[0] !== 'string') {
        throw new Error(
            "Expected 'staged', 'unstaged', or a target/base ref pair."
        );
    }

    if (args[0] === 'staged' || args[0] === 'unstaged') {
        return {
            prompt: args[0],
            models: normalizeModelArgument(args[1]),
        };
    }

    if (typeof args[1] !== 'string') {
        throw new Error('Expected a base ref after the target ref.');
    }

    return {
        prompt: `${args[0]} ${args[1]}`,
        models: normalizeModelArgument(args[2]),
    };
}

/**
 * Accepts a few synonymous option shapes so programmatic callers can use the
 * command naturally from different contexts: boolean flags from simple scripts,
 * a `scope` enum from typed callers, or target/topic + base refs from review
 * integrations. All forms are reduced to the same prompt string consumed by the
 * shared chat review request parser.
 */
function normalizeOptionsObject(
    options: ReviewChangesCommandOptions
): NormalizedReviewChangesArgs {
    const models = normalizeModelArgument(
        options.models ?? options.modelIds ?? options.reviewProviderIds
    );
    const requestedScopes = new Set(
        [
            options.staged ? 'staged' : undefined,
            options.unstaged ? 'unstaged' : undefined,
            options.scope,
        ].filter((scope): scope is 'staged' | 'unstaged' => Boolean(scope))
    );

    if (requestedScopes.size > 1) {
        throw new Error(
            "Expected exactly one change scope: 'staged' or 'unstaged'."
        );
    }

    if (options.staged || options.scope === 'staged') {
        return {
            prompt: 'staged',
            models,
        };
    }

    if (options.unstaged || options.scope === 'unstaged') {
        return {
            prompt: 'unstaged',
            models,
        };
    }

    const target = options.target ?? options.topic;
    if (!target || !options.base) {
        throw new Error(
            "Expected 'staged', 'unstaged', or both target/topic and base refs."
        );
    }

    return {
        prompt: `${target} ${options.base}`,
        models,
    };
}

/** Identifies the object-style command call without accepting arrays. */
function isOptionsObject(value: unknown): value is ReviewChangesCommandOptions {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates the optional model selector accepted by `executeCommand`. Callers
 * can pass one provider ID, multiple provider IDs, `preferred`, or omit it to
 * use the configured default.
 */
function normalizeModelArgument(value: unknown): ModelSelection | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value === 'string') {
        return value;
    }

    if (
        Array.isArray(value) &&
        value.every((item) => typeof item === 'string')
    ) {
        return value;
    }

    throw new Error(
        "Expected models to be omitted, 'preferred', a model ID, or an array of model IDs."
    );
}

/**
 * Expands the command-level model selector into provider IDs. Regular model IDs
 * are intentionally left untouched so the shared review/provider loading path
 * remains the single authority for model availability and errors.
 */
function resolveReviewModelIds(
    models: unknown,
    chatModel: string,
    preferredModels: string[]
): string[] {
    const normalizedModels = normalizeModelArgument(models);

    if (!normalizedModels) {
        return [chatModel];
    }

    const requestedModels =
        typeof normalizedModels === 'string'
            ? [normalizedModels]
            : normalizedModels;
    const modelIds = requestedModels.flatMap((modelId) =>
        modelId === 'preferred' ? [chatModel, ...preferredModels] : [modelId]
    );
    const uniqueModelIds = [...new Set(modelIds)];

    if (uniqueModelIds.length === 0) {
        throw new Error('Expected at least one review model.');
    }

    return uniqueModelIds;
}

/**
 * Produces a compact log payload for the resolved review scope so callers can
 * diagnose whether the command reviewed the intended refs or uncommitted set.
 */
async function createReviewScopeLog(config: Config, scope: ReviewScope) {
    if (!scope.isCommitted) {
        return {
            kind:
                scope.target === UncommittedRef.Staged ? 'staged' : 'unstaged',
            target: scope.target,
        };
    }

    return {
        kind: (await config.git.isBranch(scope.target)) ? 'branch' : 'ref',
        target: scope.target,
        base: scope.base,
        revisionRangeDiff: scope.revisionRangeDiff,
        revisionRangeLog: scope.revisionRangeLog,
        isTargetCheckedOut: scope.isTargetCheckedOut,
    };
}

/**
 * Adapts VS Code notification progress to the review runner's progress shape
 * and deduplicates repeated messages from parallel model reviews.
 */
function createNotificationProgress(
    progress: vscode.Progress<{ message?: string; increment?: number }>
) {
    const reportedMessages = new Set<string>();
    return {
        report: (value: { message?: string; increment?: number }) => {
            const reportValue: { message?: string; increment?: number } = {};

            if (value.increment !== undefined) {
                reportValue.increment = value.increment;
            }

            if (value.message && !reportedMessages.has(value.message)) {
                reportedMessages.add(value.message);
                reportValue.message = value.message;
            }

            if (
                reportValue.message === undefined &&
                reportValue.increment === undefined
            ) {
                return;
            }

            progress.report(reportValue);
        },
    };
}

/**
 * Converts shared per-model review results into the command return object,
 * preserving raw per-model results while also exposing flattened comments and
 * serializable errors for simpler programmatic consumers.
 */
function buildReviewChangesResult(
    message: string,
    cancelled: boolean,
    results: ModelReviewResult[],
    commandErrors: ModelReviewError[],
    minSeverity: number
): ReviewChangesResult {
    return {
        message,
        cancelled,
        comments: results.flatMap(({ modelId, modelName, result }) =>
            flattenReviewComments(
                result.fileComments,
                modelId,
                modelName,
                minSeverity
            )
        ),
        errors: [
            ...commandErrors.map(({ error, modelId, modelName }) =>
                serializeError(error, modelId, modelName)
            ),
            ...results.flatMap(({ modelId, modelName, result }) =>
                result.errors.map((error) =>
                    serializeError(error, modelId, modelName)
                )
            ),
        ],
        results,
    };
}

/**
 * Applies the extension's chat-display filters to returned comments and adds
 * model attribution, matching what users would see in the chat surface.
 */
function flattenReviewComments(
    fileComments: ModelReviewResult['result']['fileComments'],
    modelId: string,
    modelName: string,
    minSeverity: number
): ReviewChangesComment[] {
    return fileComments.flatMap((fileComment) =>
        fileComment.comments
            .filter(
                (comment) => comment.severity >= minSeverity && comment.line > 0
            )
            .map((comment) => ({
                ...comment,
                modelId,
                modelName,
            }))
    );
}

/**
 * Converts thrown values and review errors into plain objects so the VS Code
 * command result can be consumed across extension boundaries.
 */
function serializeError(
    error: unknown,
    modelId?: string,
    modelName?: string
): ReviewChangesError {
    if (error instanceof Error) {
        return {
            modelId,
            modelName,
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    return {
        modelId,
        modelName,
        name: 'Error',
        message: String(error),
    };
}
