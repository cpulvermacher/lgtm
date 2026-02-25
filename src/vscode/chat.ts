import * as vscode from 'vscode';

import { reviewDiff } from '@/review/review';
import { Config } from '@/types/Config';
import { FileComments } from '@/types/FileComments';
import { Logger } from '@/types/Logger';
import { UncommittedRef } from '@/types/Ref';
import { ReviewComment } from '@/types/ReviewComment';
import { ReviewRequest, ReviewScope } from '@/types/ReviewRequest';
import { ReviewResult } from '@/types/ReviewResult';

/** Minimal model shape used by resolveOneModelSpec, allowing test doubles */
export type ModelInfo = Pick<
    vscode.LanguageModelChat,
    'vendor' | 'id' | 'name'
>;

import { correctFilename } from '@/utils/filenames';
import { extractModelSpecs, parseArguments } from '@/utils/parseArguments';
import { getConfig } from './config';
import { FixCommentArgs } from './fix';
import { pickRef, pickRefs, promptToCheckout } from './ui';
import { toCommandLink, toUri } from './uri';

export function registerChatParticipant(context: vscode.ExtensionContext) {
    const chatParticipant = vscode.chat.createChatParticipant(
        'lgtm',
        handleChat
    );
    chatParticipant.iconPath = vscode.Uri.joinPath(
        context.extensionUri,
        'images/chat_icon.png'
    );
    return chatParticipant;
}

async function handleChat(
    chatRequest: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<void> {
    if (chatRequest.command !== 'review') {
        if (['branch', 'commit'].includes(chatRequest.command ?? '')) {
            //TODO temporary, clean this up in ~Mar 2026
            stream.markdown(
                '/branch and /commit have been removed, please use /review instead.'
            );
            return;
        }
        stream.markdown(
            'Please use the /review command:\n' +
                ' - `@lgtm /review` to review changes between two branches, commits, or tags. You can specify git refs using e.g. `/review develop main`, or omit the second or both arguments to select refs interactively. Use `/review staged` or `/review unstaged` to review uncommitted changes. Use `model:modelId` to specify models inline, e.g. `/review model:gpt-4.1 develop main`.'
        );
        return;
    }

    const config = await getConfig({ refreshWorkspace: true });
    const availableModels = await vscode.lm.selectChatModels();

    // Check if models were specified inline in the prompt (e.g. model:gpt-4.1)
    const { modelIds: promptModelSpecs, remaining: refTokens } =
        extractModelSpecs(chatRequest.prompt);

    // Check if we need to prompt for model selection
    const options = config.getOptions();
    let selectedModelIds = [options.chatModel];
    if (promptModelSpecs.length > 0) {
        // Resolve inline model specs against available models
        const resolvedModelIds = await resolveModelSpecs(
            promptModelSpecs,
            config.logger,
            stream,
            availableModels
        );
        if (resolvedModelIds.length === 0) {
            return;
        }
        selectedModelIds = resolvedModelIds;
    } else if (options.selectChatModelForReview === 'Always ask') {
        const selected = await config.promptForSessionModelIds();
        if (!selected || selected.length === 0) {
            stream.markdown('No model selected. Review cancelled.');
            return;
        }
        selectedModelIds = selected;
    }

    // Pass only the ref tokens (model: specs already extracted)
    const cleanPrompt = refTokens.join(' ');
    const reviewRequest = await getReviewRequest(config, cleanPrompt);
    if (!reviewRequest) {
        stream.markdown(`Nothing to do.`);
        return;
    }

    const modelIds = selectedModelIds;
    const modelNames = modelIds.map((id) =>
        getModelDisplayName(id, availableModels)
    );
    const modelNamesDisplay =
        modelNames.length === 1
            ? `**${modelNames[0]}**`
            : modelNames.map((n) => `**${n}**`).join(', ');

    if (!reviewRequest.scope.isCommitted) {
        const targetLabel =
            reviewRequest.scope.target === UncommittedRef.Staged
                ? 'staged'
                : 'unstaged';
        stream.markdown(
            `Reviewing ${targetLabel} changes using ${modelNamesDisplay}...\n\n`
        );
    } else {
        const { base, target } = reviewRequest.scope;
        if (!reviewRequest.scope.isTargetCheckedOut) {
            await maybeCheckoutTarget(target, stream);
            //regardless of choice, recheck if ref is now checked out
            reviewRequest.scope = await config.git.getReviewScope(target, base);
        }

        const targetIsBranch = await config.git.isBranch(target);
        stream.markdown(
            `Reviewing changes ${
                targetIsBranch ? 'on' : 'at'
            } \`${target}\` compared to \`${base}\` using ${modelNamesDisplay}...\n\n`
        );
        if (await config.git.isSameRef(base, target)) {
            stream.markdown('No changes found.');
            return;
        }
    }

    // Create a shared progress reporter that deduplicates messages across all models
    const sharedProgress = createSharedProgress(stream);

    // Run reviews for all selected models with bounded concurrency
    const reviewTasks = modelIds.map(
        (modelId, index) => () =>
            reviewWithModel(
                config,
                reviewRequest,
                modelId,
                modelNames[index],
                sharedProgress,
                token
            )
    );
    const settledResults = await runWithConcurrency(
        reviewTasks,
        options.maxConcurrentModelRequests
    );

    // Collect successful results and log failures
    const results: ModelReviewResult[] = [];
    for (let i = 0; i < settledResults.length; i++) {
        const settled = settledResults[i];
        if (settled.status === 'fulfilled') {
            results.push(settled.value);
        } else {
            config.logger.info(
                `Model ${modelNames[i]} failed:`,
                settled.reason
            );
        }
    }

    // Display results based on outputModeWithMultipleModels setting
    if (
        options.outputModeWithMultipleModels === 'Merged with attribution' &&
        results.length > 1
    ) {
        showMergedReviewResults(config, results, stream, token);
    } else {
        // Separate sections (default)
        showSeparateReviewResults(config, results, stream, token);
    }
}

async function maybeCheckoutTarget(
    target: string,
    stream: vscode.ChatResponseStream
) {
    const config = await getConfig();
    const shouldCheckout = await promptToCheckout(config, target);
    if (!shouldCheckout) {
        return;
    }

    const localBranch = await config.git.getLocalBranchForRemote(target);
    const checkoutRef = localBranch || target;

    try {
        stream.markdown(`Checking out \`${checkoutRef}\`...`);
        await config.git.checkout(checkoutRef);

        stream.markdown(' done.\n');
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        stream.markdown(
            `\n> Failed to check out ${checkoutRef}: ${errorMessage}\n`
        );
    }
}

/** Constructs review request (prompting user if needed) */
async function getReviewRequest(
    config: Config,
    prompt: string
): Promise<ReviewRequest | undefined> {
    const parsedPrompt = await parseArguments(config.git, prompt);

    let refs;
    if (parsedPrompt.target && parsedPrompt.base) {
        // both refs are provided
        refs = parsedPrompt;
    } else if (
        parsedPrompt.target &&
        config.git.isUncommitted(parsedPrompt.target)
    ) {
        refs = parsedPrompt;
    } else if (parsedPrompt.target && !parsedPrompt.base) {
        // only target ref is provided
        const base = await pickRef(
            config,
            'Select a branch/tag/commit to compare with (2/2)',
            parsedPrompt.target
        );
        if (!base) {
            return;
        }
        refs = { target: parsedPrompt.target, base };
    } else {
        refs = await pickRefs(config, undefined);
    }

    let reviewScope: ReviewScope;
    if (config.git.isValidRefPair(refs)) {
        reviewScope = await config.git.getReviewScope(refs.target, refs.base);
    } else if (
        refs?.target &&
        (await config.git.isInitialCommit(refs.target))
    ) {
        reviewScope = await config.git.getReviewScope(refs.target, undefined);
    } else {
        return;
    }

    return { scope: reviewScope };
}

function buildComment(
    config: Config,
    file: FileComments,
    comment: ReviewComment,
    isTargetCheckedOut: boolean
) {
    const isValidLineNumber = isTargetCheckedOut && comment.line > 0;

    // some things learned about the markdown parsing:
    // - pushing multiple items to the stream with different isTrusted values will add newlines between them
    // - using theme icons can break other markdown (links) following it (also can cause display issues if main comment contains $(var) type text)
    // - using quotes (>) helps isolate unclosed markdown elements from the following unquoted text

    // Build the entire comment as a single markdown string
    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown('\n - ');

    // Add line number anchor
    const uri = toUri(config, file.target, comment.line);
    markdown.appendMarkdown(`[Line ${comment.line}](${uri.toString()})`);

    // (debug: prompt type)
    if (comment.promptType) {
        markdown.appendMarkdown(` | **${comment.promptType}**`);
    }
    markdown.appendText(` | Severity ${comment.severity}/5`);

    // Add fix button if location is valid
    if (isValidLineNumber) {
        markdown.appendMarkdown(
            ` | ${createFixLinkMarkdown(
                file.target,
                comment.line,
                comment.comment
            )}`
        );
        markdown.isTrusted = { enabledCommands: ['lgtm.fixComment'] };
    }

    // Properly quote multi-line comments
    const quotedComment = comment.comment
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    markdown.appendMarkdown(`\n${quotedComment}`);

    return markdown;
}

function createFixLinkMarkdown(
    filePath: string,
    line: number,
    commentText: string
) {
    const args: FixCommentArgs = {
        file: filePath,
        line: line,
        comment: commentText,
    };
    const icon = '✦';
    const nbsp = '\u00A0';
    return `[**${icon}${nbsp}Fix**](${toCommandLink('lgtm.fixComment', args)})`;
}

/**
 * Get the display name for a model ID by looking it up in the available models.
 * Falls back to the ID part if the model is not found.
 * @param modelId The model ID to look up
 * @param cachedModels Optional cached list of models to avoid repeated API calls
 */
export function getModelDisplayName(
    modelId: string,
    cachedModels: vscode.LanguageModelChat[]
): string {
    if (cachedModels && cachedModels.length > 0) {
        // Model IDs are in format "vendor:id"
        const colonIdx = modelId.indexOf(':');
        const [vendor, id] =
            colonIdx >= 0
                ? [modelId.slice(0, colonIdx), modelId.slice(colonIdx + 1)]
                : [undefined, modelId];

        const matchingModel = cachedModels.find((m) =>
            vendor ? m.vendor === vendor && m.id === id : m.id === id
        );

        if (matchingModel) {
            return matchingModel.name ?? matchingModel.id;
        }
    }

    // Fallback: just return the id part
    const colonIdx = modelId.indexOf(':');
    if (colonIdx >= 0) {
        return modelId.slice(colonIdx + 1);
    }
    return modelId;
}

/**
 * Resolve model specs from inline `model:xxx` syntax against available VS Code models.
 * Supports exact match on id, vendor:id, or substring match on id/name.
 * Returns resolved model IDs in "vendor:id" format.
 */
async function resolveModelSpecs(
    specs: string[],
    logger: Logger,
    stream: vscode.ChatResponseStream,
    availableModels: ModelInfo[]
): Promise<string[]> {
    if (!availableModels || availableModels.length === 0) {
        logger.info(
            'No chat models available for resolving inline model specs'
        );
        stream.markdown('No chat models available. Review cancelled.');
        return [];
    }

    const resolvedIds = new Set<string>();
    const notFound: string[] = [];
    const ambiguous: string[] = [];
    for (const spec of specs) {
        const resolved = resolveOneModelSpec(spec, availableModels);
        if (resolved.match) {
            resolvedIds.add(resolved.match);
        } else if (resolved.ambiguous) {
            logger.info(
                `Ambiguous model spec '${spec}' matched multiple models: ${resolved.ambiguous.join(', ')}`
            );
            ambiguous.push(
                `'${spec}' matches multiple models: ${resolved.ambiguous.join(', ')}`
            );
        } else {
            const suggestion = suggestClosestModelSpec(spec, availableModels);
            logger.info(
                `Could not resolve model spec '${spec}'. Available models: ${availableModels.map((m) => `${m.vendor}:${m.id}`).join(', ')}`
            );
            notFound.push(
                suggestion
                    ? `'${spec}' (did you mean '${suggestion}'?)`
                    : `'${spec}'`
            );
        }
    }

    if (ambiguous.length > 0) {
        stream.markdown(
            `Ambiguous model spec(s) — please be more specific: ${ambiguous.join('; ')}. Use the 'LGTM: Select Chat Model' command to see available IDs.`
        );
        return [];
    }
    if (notFound.length > 0) {
        stream.markdown(
            `Model(s) not found: ${notFound.join(', ')}. Available model IDs can be found via the 'LGTM: Select Chat Model' command.`
        );
        return [];
    }

    return [...resolvedIds];
}

export type ModelSpecResult =
    | { match: string; ambiguous?: never }
    | { match?: never; ambiguous: string[] }
    | { match?: never; ambiguous?: never };

/**
 * Resolve a single model spec against available models.
 * Matching priority: exact vendor:id > exact id > substring match on id > substring match on name.
 * If a substring match is ambiguous (multiple hits), returns the list of candidates instead.
 */
export function resolveOneModelSpec(
    spec: string,
    models: ModelInfo[]
): ModelSpecResult {
    const toId = (m: ModelInfo) => `${m.vendor}:${m.id}`;

    // If spec contains ':', try exact vendor:id match
    if (spec.includes(':')) {
        const colonIdx = spec.indexOf(':');
        const vendor = spec.slice(0, colonIdx);
        const id = spec.slice(colonIdx + 1);
        const exactMatch = models.find(
            (m) => m.vendor === vendor && m.id === id
        );
        if (exactMatch) {
            return { match: toId(exactMatch) };
        }
    }

    // Try exact id match (any vendor)
    const exactIdMatches = models.filter((m) => m.id === spec);
    if (exactIdMatches.length === 1) {
        return { match: toId(exactIdMatches[0]) };
    }
    if (exactIdMatches.length > 1) {
        return { ambiguous: exactIdMatches.map(toId) };
    }

    // Try substring match on model id — fail-fast if ambiguous
    const specLower = spec.toLowerCase();
    const idSubstringMatches = models.filter((m) =>
        m.id.toLowerCase().includes(specLower)
    );
    if (idSubstringMatches.length === 1) {
        return { match: toId(idSubstringMatches[0]) };
    }
    if (idSubstringMatches.length > 1) {
        return { ambiguous: idSubstringMatches.map(toId) };
    }

    // Try substring match on model name — fail-fast if ambiguous
    const nameMatches = models.filter((m) =>
        m.name?.toLowerCase().includes(specLower)
    );
    if (nameMatches.length === 1) {
        return { match: toId(nameMatches[0]) };
    }
    if (nameMatches.length > 1) {
        return { ambiguous: nameMatches.map(toId) };
    }

    return {};
}

/** Suggest closest model id (or vendor:id) for typo recovery. */
export function suggestClosestModelSpec(
    spec: string,
    models: ModelInfo[]
): string | undefined {
    if (models.length === 0) {
        return;
    }

    const candidates = models.flatMap((m) => [m.id, `${m.vendor}:${m.id}`]);
    const suggestion = correctFilename(spec, candidates);

    if (!suggestion || suggestion.toLowerCase() === spec.toLowerCase()) {
        return;
    }

    return suggestion;
}

/** Result of a review with model information */
export type ModelReviewResult = {
    modelId: string;
    modelName: string;
    result: ReviewResult;
};

/** Progress reporter interface */
type Progress = {
    report: (value: { message: string }) => void;
};

/** Creates a shared progress reporter that deduplicates messages across all models */
export function createSharedProgress(
    stream: vscode.ChatResponseStream
): Progress {
    const reportedMessages = new Set<string>();
    return {
        report: ({ message }: { message: string }) => {
            if (message && !reportedMessages.has(message)) {
                reportedMessages.add(message);
                stream.progress(message);
            }
        },
    };
}

async function runWithConcurrency<T>(
    tasks: Array<() => Promise<T>>,
    maxConcurrency: number
): Promise<PromiseSettledResult<T>[]> {
    const settled: PromiseSettledResult<T>[] = new Array(tasks.length);
    if (tasks.length === 0) {
        return settled;
    }

    const concurrency = Math.max(1, Math.min(maxConcurrency, tasks.length));
    let next = 0;

    const worker = async () => {
        while (next < tasks.length) {
            const index = next;
            next++;
            try {
                settled[index] = {
                    status: 'fulfilled',
                    value: await tasks[index](),
                };
            } catch (reason) {
                settled[index] = { status: 'rejected', reason };
            }
        }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return settled;
}

function reportErrors(
    logger: Logger,
    errors: Error[],
    stream: vscode.ChatResponseStream
) {
    if (errors.length === 0) {
        return;
    }

    for (const error of errors) {
        logger.info('Error: ', error.message, error.stack);
    }

    const errorString = errors.map((error) => ` - ${error.message}`).join('\n');
    stream.markdown(
        `\n${errors.length} error(s) occurred during review:\n${errorString}\n`
    );
}

/** Reviews changes with a specific model */
async function reviewWithModel(
    config: Config,
    reviewRequest: ReviewRequest,
    modelId: string,
    modelName: string,
    progress: Progress,
    token: vscode.CancellationToken
): Promise<ModelReviewResult> {
    // Create a config that uses the specific model
    const modelConfig: Config = {
        ...config,
        getModel: () => config.getModel(modelId),
    };

    const result = await reviewDiff(
        modelConfig,
        reviewRequest,
        progress,
        token
    );

    return { modelId, modelName, result };
}

/** Display results from multiple models in separate sections */
function showSeparateReviewResults(
    config: Config,
    results: ModelReviewResult[],
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
) {
    // Guard against empty results array
    if (results.length === 0) {
        if (token.isCancellationRequested) {
            stream.markdown(
                '\nCancelled. All models failed to complete the review; no results are available.\n'
            );
        } else {
            stream.markdown(
                '\nAll models failed to complete the review; no results are available.\n'
            );
        }
        return;
    }

    if (token.isCancellationRequested) {
        const hasAnyComments = results.some(
            (r) => r.result.fileComments.length > 0
        );
        if (hasAnyComments) {
            stream.markdown('\nCancelled, showing partial results.\n');
        } else {
            stream.markdown('\nCancelled.');
            return;
        }
    }

    const options = config.getOptions();
    const allErrors: Error[] = [];

    for (const { modelName, result } of results) {
        if (token.isCancellationRequested) {
            break;
        }

        // Add section heading if there are multiple models
        if (results.length > 1) {
            stream.markdown(`\n---\n*${modelName}*\n---\n`);
        }

        if (result.files.length === 0) {
            stream.markdown('No changes found.\n');
            continue;
        }

        const isTargetCheckedOut = result.request.scope.isTargetCheckedOut;
        let noProblemsFound = true;

        for (const file of result.fileComments) {
            if (token.isCancellationRequested) {
                break;
            }

            const filteredFileComments = file.comments.filter(
                (comment) =>
                    comment.severity >= options.minSeverity && comment.line > 0
            );

            if (filteredFileComments.length > 0) {
                stream.anchor(toUri(config, file.target));
            }

            for (const comment of filteredFileComments) {
                stream.markdown(
                    buildComment(config, file, comment, isTargetCheckedOut)
                );
                noProblemsFound = false;
            }

            if (filteredFileComments.length > 0) {
                stream.markdown('\n\n');
            }
        }

        if (noProblemsFound && result.errors.length === 0) {
            stream.markdown('No problems found.\n');
        }

        if (!isTargetCheckedOut) {
            stream.markdown(
                '\nNote: The target branch or commit is not checked out, so line numbers may not match the current state.\n'
            );
        }

        allErrors.push(...result.errors);
    }

    reportErrors(config.logger, allErrors, stream);
}

/** Comment with model attribution for merged display */
export type AttributedComment = {
    file: string;
    line: number;
    comment: string;
    severity: number;
    model: string; // model name that flagged this issue
    promptType?: string;
};

/**
 * Collect all review comments from multiple models into a flat list with
 * model attribution.  Comments below `minSeverity` or with non-positive
 * line numbers are filtered out.  The returned list is grouped by file
 * and sorted by line number within each file.
 */
export function collectAttributedComments(
    results: ModelReviewResult[],
    minSeverity: number
): Map<string, AttributedComment[]> {
    const all: AttributedComment[] = [];

    for (const { modelName, result } of results) {
        for (const file of result.fileComments) {
            for (const comment of file.comments) {
                if (comment.severity < minSeverity || comment.line <= 0) {
                    continue;
                }
                all.push({
                    file: comment.file,
                    line: comment.line,
                    comment: comment.comment,
                    severity: comment.severity,
                    model: modelName,
                    promptType: comment.promptType,
                });
            }
        }
    }

    // Group by file
    const grouped = new Map<string, AttributedComment[]>();
    for (const c of all) {
        const existing = grouped.get(c.file);
        if (existing) {
            existing.push(c);
        } else {
            grouped.set(c.file, [c]);
        }
    }

    // Sort by line within each file
    for (const comments of grouped.values()) {
        comments.sort((a, b) => a.line - b.line);
    }

    return grouped;
}

/** Display merged results from multiple models with attribution */
function showMergedReviewResults(
    config: Config,
    results: ModelReviewResult[],
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
) {
    // Guard against empty results array
    if (results.length === 0) {
        stream.markdown('\nNo results.\n');
        return;
    }

    if (token.isCancellationRequested) {
        const hasAnyComments = results.some(
            (r) => r.result.fileComments.length > 0
        );
        if (hasAnyComments) {
            stream.markdown('\nCancelled, showing partial results.\n');
        } else {
            stream.markdown('\nCancelled.');
            return;
        }
    }

    const options = config.getOptions();

    // Collect all comments with model attribution
    const fileComments = collectAttributedComments(
        results,
        options.minSeverity
    );

    // Collect errors first so we don't skip them on early return
    const allErrors = results.flatMap((r) => r.result.errors);

    if (fileComments.size === 0) {
        // Check if there were any files to review
        const hasFilesToReview = results.some((r) => r.result.files.length > 0);
        if (hasFilesToReview) {
            stream.markdown('\nNo problems found.\n');
        } else {
            stream.markdown('\nNo changes found.\n');
        }
        // Still report any errors that occurred
        reportErrors(config.logger, allErrors, stream);
        return;
    }

    // Use first result to get metadata
    const firstResult = results[0].result;
    const isTargetCheckedOut = results.every(
        (r) => r.result.request.scope.isTargetCheckedOut
    )
        ? firstResult.request.scope.isTargetCheckedOut
        : false;

    // Display comments grouped by file
    for (const [filePath, comments] of fileComments) {
        if (token.isCancellationRequested) {
            break;
        }

        stream.anchor(toUri(config, filePath));

        for (const comment of comments) {
            stream.markdown(
                buildMergedComment(
                    config,
                    comment,
                    isTargetCheckedOut,
                    results.length > 1
                )
            );
        }

        stream.markdown('\n\n');
    }

    if (!isTargetCheckedOut) {
        stream.markdown(
            '\nNote: The target branch or commit is not checked out, so line numbers may not match the current state.\n'
        );
    }

    // Report any errors that occurred
    reportErrors(config.logger, allErrors, stream);
}

/** Build a comment with model attribution for merged display */
function buildMergedComment(
    config: Config,
    comment: AttributedComment,
    isTargetCheckedOut: boolean,
    showAttribution: boolean
) {
    const isValidLineNumber = isTargetCheckedOut && comment.line > 0;

    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown('\n - ');

    // Add line number anchor
    const uri = toUri(config, comment.file, comment.line);
    markdown.appendMarkdown(`[Line ${comment.line}](${uri.toString()})`);

    // Show which model flagged this issue (if multiple models)
    if (showAttribution) {
        markdown.appendMarkdown(' | *');
        markdown.appendText(comment.model);
        markdown.appendMarkdown('*');
    }

    // (debug: prompt type)
    if (comment.promptType) {
        markdown.appendMarkdown(` | **${comment.promptType}**`);
    }
    markdown.appendText(` | Severity ${comment.severity}/5`);

    // Add fix button if location is valid
    if (isValidLineNumber) {
        markdown.appendMarkdown(
            ` | ${createFixLinkMarkdown(
                comment.file,
                comment.line,
                comment.comment
            )}`
        );
        markdown.isTrusted = { enabledCommands: ['lgtm.fixComment'] };
    }

    // Properly quote multi-line comments
    const quotedComment = comment.comment
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    markdown.appendMarkdown(`\n${quotedComment}`);

    return markdown;
}
