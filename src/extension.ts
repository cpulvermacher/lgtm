import * as vscode from 'vscode';

import { reviewDiff } from './review/review';
import { Config } from './types/Config';
import { ReviewResult } from './types/ReviewResult';
import { ReviewScope } from './types/ReviewScope';
import { getConfig, toUri } from './vscode/config';
import { pickCommit, pickRef, pickRefs } from './vscode/ui';

// defined when built via `npm run dev`
declare const __GIT_VERSION__: string | undefined;

let chatParticipant: vscode.ChatParticipant;

// called the first time a command is executed
export function activate(context: vscode.ExtensionContext) {
    chatParticipant = vscode.chat.createChatParticipant('lgtm', handler);
    chatParticipant.iconPath = vscode.Uri.joinPath(
        context.extensionUri,
        'images/chat_icon.png'
    );
}

export function deactivate() {
    if (chatParticipant) {
        chatParticipant.dispose();
    }
}

async function handler(
    chatRequest: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    cancellationToken: vscode.CancellationToken
): Promise<void> {
    if (__GIT_VERSION__) {
        stream.markdown(`**LGTM dev build**: ${__GIT_VERSION__}\n\n`);
    }

    if (
        !chatRequest.command ||
        !['review', 'branch', 'commit'].includes(chatRequest.command)
    ) {
        stream.markdown(
            'Please use one of the following commands:\n' +
                ' - `@lgtm /review` to review changes between two branches, commits, or tags. You can specify git refs using e.g. `/review develop main`, or omit the second or both arguments to select refs interactively.\n' +
                ' - `@lgtm /branch` to review changes between two branches\n' +
                ' - `@lgtm /commit` to review changes in a single commit'
        );
        return;
    }

    const config = await getConfig();
    const git = config.git;
    if (config.getOptions().enableDebugOutput) {
        const model = config.model;
        stream.markdown(
            `**Model**: ${model.name} (${model.vendor}), input token limit: ${model.maxInputTokens} tokens\n\n`
        );
    }

    let parsedPrompt;
    try {
        parsedPrompt = await parseArguments(config, chatRequest.prompt);
    } catch {
        throw new Error(
            `Could not parse "${chatRequest.prompt}" into valid commit refs. Try branch names, commit hashes, tags, or "HEAD".`
        );
    }
    let reviewScope: ReviewScope;
    if (chatRequest.command === 'commit') {
        let commit;
        if (parsedPrompt.target) {
            if (parsedPrompt.base) {
                throw new Error(
                    '/commit expects at most a single ref as argument'
                );
            }
            commit = parsedPrompt.target;
        } else {
            commit = await pickCommit(config);
        }
        if (!commit) {
            return;
        }

        stream.markdown(`Reviewing changes in commit \`${commit}\`.`);
        reviewScope = await git.getReviewScope(commit);
    } else {
        let refs;
        if (parsedPrompt.target && parsedPrompt.base) {
            // both refs are provided
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
        } else if (chatRequest.command === 'review') {
            refs = await pickRefs(config, undefined);
        } else if (chatRequest.command === 'branch') {
            refs = await pickRefs(config, 'branch');
        }
        if (!refs) {
            return;
        }

        const targetIsBranch = await git.isBranch(refs.target);
        stream.markdown(
            `Reviewing changes ${targetIsBranch ? 'on' : 'at'} \`${refs.target}\` compared to \`${refs.base}\`.`
        );
        if (await git.isSameRef(refs.base, refs.target)) {
            stream.markdown(' No changes found.');
            return;
        }
        reviewScope = await git.getReviewScope(refs.target, refs.base);
    }

    const reviewResult = await reviewDiff(
        config,
        stream,
        reviewScope,
        cancellationToken
    );

    showReviewResults(reviewResult, stream, config, cancellationToken);
}

function showReviewResults(
    result: ReviewResult,
    stream: vscode.ChatResponseStream,
    config: Config,
    cancellationToken: vscode.CancellationToken
) {
    const options = config.getOptions();
    const isTargetCheckedOut = result.scope.isTargetCheckedOut;
    let noProblemsFound = true;
    for (const file of result.fileComments) {
        if (cancellationToken.isCancellationRequested) {
            return;
        }

        const filteredFileComments = file.comments.filter(
            (comment) => comment.severity >= options.minSeverity
        );

        if (filteredFileComments.length === 0 && !options.enableDebugOutput) {
            continue;
        }

        stream.anchor(toUri(config, file.target), file.target);
        for (const comment of filteredFileComments) {
            const isValidLineNumber = isTargetCheckedOut && comment.line > 0;
            const location = isValidLineNumber
                ? new vscode.Location(
                      toUri(config, file.target),
                      new vscode.Position(comment.line - 1, 0)
                  )
                : null;

            stream.markdown(`\n - `);
            if (location) {
                stream.anchor(location, `Line ${comment.line}: `);
            } else {
                stream.markdown(`Line ${comment.line}: `);
            }
            stream.markdown(
                `${comment.comment} (Severity: ${comment.severity}/5)`
            );
            noProblemsFound = false;
        }
        if (options.enableDebugOutput && file.debug) {
            stream.markdown(`\n\n**Debug Info:**`);
            stream.markdown(`\nInput tokens: ${file.debug?.promptTokens}`);
            stream.markdown(`\nResponse tokens: ${file.debug?.responseTokens}`);

            const numCommentsSkipped = file.comments.reduce(
                (acc, comment) =>
                    comment.severity < options.minSeverity ? acc + 1 : acc,
                0
            );
            if (numCommentsSkipped > 0) {
                stream.markdown(`\nSkipped comments: ${numCommentsSkipped}`);
            }
        }
        stream.markdown('\n\n');
    }

    if (noProblemsFound) {
        stream.markdown('No problems found.');
    } else if (!isTargetCheckedOut) {
        stream.markdown(
            'Note: The target branch or commit is not checked out, so line numbers may not match the current state.'
        );
    }

    const errorString = result.errors
        .map((error) => ` - ${error.file}: ${error.error.message}`)
        .join('\n');
    if (errorString.length > 0) {
        throw new Error(
            `${result.errors.length} error(s) occurred during review:\n${errorString}`
        );
    }
}

/** parse given arguments to a /command into target/base refs.
 * If no arguments are provided, returns undefined instead of refs.
 * If arguments cannot be parsed into at least one ref, throws.
 */
async function parseArguments(config: Config, args: string) {
    if (!args || args.trim().length === 0) {
        return { target: undefined, base: undefined };
    }

    const [target, base] = args.split(' ', 2);
    await config.git.getCommitRef(target);
    if (base) {
        await config.git.getCommitRef(base);
    }
    return { target, base };
}
