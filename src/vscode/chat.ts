import * as vscode from 'vscode';

import { reviewDiff } from '@/review/review';
import { Config } from '@/types/Config';
import { FileComments } from '@/types/FileComments';
import { UncommittedRef } from '@/types/Ref';
import { ReviewComment } from '@/types/ReviewComment';
import { ReviewRequest, ReviewScope } from '@/types/ReviewRequest';
import { ReviewResult } from '@/types/ReviewResult';
import { parseArguments } from '@/utils/parseArguments';
import { getConfig, toUri } from './config';
import { FixCommentArgs } from './fix';
import { pickRef, pickRefs, promptToCheckout } from './ui';

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
    const config = await getConfig();

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
                ' - `@lgtm /review` to review changes between two branches, commits, or tags. You can specify git refs using e.g. `/review develop main`, or omit the second or both arguments to select refs interactively. Use `/review staged` or `/review unstaged` to review uncommitted changes.'
        );
        return;
    }

    const reviewRequest = await getReviewRequest(config, chatRequest.prompt);
    if (!reviewRequest) {
        stream.markdown(`Nothing to do.`);
        return;
    }

    if (!reviewRequest.scope.isCommitted) {
        const targetLabel =
            reviewRequest.scope.target === UncommittedRef.Staged
                ? 'staged'
                : 'unstaged';
        stream.markdown(`Reviewing ${targetLabel} changes...\n\n`);
    } else {
        const { base, target } = reviewRequest.scope;
        if (!reviewRequest.scope.isTargetCheckedOut) {
            await maybeCheckoutTarget(target, stream);
            //regardless of choice, recheck if ref is now checked out
            reviewRequest.scope = await config.git.getReviewScope(target, base);
        }

        const targetIsBranch = await config.git.isBranch(target);
        stream.markdown(
            `Reviewing changes ${targetIsBranch ? 'on' : 'at'} \`${target}\` compared to \`${base}\`...\n\n`
        );
        if (await config.git.isSameRef(base, target)) {
            stream.markdown('No changes found.');
            return;
        }
    }
    const results = await review(config, reviewRequest, stream, token);

    showReviewResults(config, results, stream, token);
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

/** Reviews changes and displays progress bar */
async function review(
    config: Config,
    reviewRequest: ReviewRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
) {
    const progress = {
        lastMessage: '',
        report: ({ message }: { message: string }) => {
            if (message && message !== progress.lastMessage) {
                stream.progress(message);
                progress.lastMessage = message;
            }
        },
    };

    const result = await reviewDiff(config, reviewRequest, progress, token);
    if (token.isCancellationRequested) {
        if (result.fileComments.length > 0) {
            stream.markdown('\nCancelled, showing partial results.');
        } else {
            stream.markdown('\nCancelled.');
        }
    }

    return result;
}

function showReviewResults(
    config: Config,
    result: ReviewResult,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
) {
    if (result.files.length === 0) {
        stream.markdown('\nNo changes found.');
        return;
    }

    const options = config.getOptions();
    const isTargetCheckedOut = result.request.scope.isTargetCheckedOut;
    let noProblemsFound = true;
    for (const file of result.fileComments) {
        if (token.isCancellationRequested) {
            return;
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
        stream.markdown('\nNo problems found.');
    } else if (!isTargetCheckedOut) {
        stream.markdown(
            '\nNote: The target branch or commit is not checked out, so line numbers may not match the current state.'
        );
    }

    if (result.errors.length > 0) {
        for (const error of result.errors) {
            config.logger.info('Error: ', error.message, error.stack);
        }

        const errorString = result.errors
            .map((error) => ` - ${error.message}`)
            .join('\n');
        throw new Error(
            `${result.errors.length} error(s) occurred during review:\n${errorString}`
        );
    }
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
        const args: FixCommentArgs = {
            file: file.target,
            line: comment.line,
            comment: comment.comment,
        };
        const icon = '✦';
        const nbsp = '\u00A0';
        markdown.appendMarkdown(
            ` | [**${icon}${nbsp}Fix**](${toCommandLink('lgtm.fixComment', args)})`
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

function toCommandLink(command: string, args: unknown) {
    const encodedArgs = encodeURIComponent(JSON.stringify(args));
    return `command:${command}?${encodedArgs}`;
}
