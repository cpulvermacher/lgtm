import * as vscode from 'vscode';

import { reviewDiff } from './review/review';
import { Config } from './types/Config';
import { ReviewRequest, ReviewScope } from './types/ReviewRequest';
import { ReviewResult } from './types/ReviewResult';
import { parseArguments } from './utils/parseArguments';
import { getConfig, toUri } from './vscode/config';
import { pickCommit, pickRef, pickRefs } from './vscode/ui';

let config: Config | undefined;
let chatParticipant: vscode.ChatParticipant;
let commentController: vscode.CommentController;

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
    if (commentController) {
        commentController.dispose();
    }
}

async function handler(
    chatRequest: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    cancellationToken: vscode.CancellationToken
): Promise<void> {
    if (!config) {
        config = await getConfig();
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

    const reviewRequest = await getReviewRequest(
        config,
        chatRequest.command,
        chatRequest.prompt
    );
    if (!reviewRequest) {
        return;
    }

    if (chatRequest.command === 'commit') {
        stream.markdown(
            `Reviewing changes in commit \`${reviewRequest.scope.target}\`...\n\n`
        );
    } else {
        const { base, target } = reviewRequest.scope;
        const targetIsBranch = await config.git.isBranch(target);
        stream.markdown(
            `Reviewing changes ${targetIsBranch ? 'on' : 'at'} \`${target}\` compared to \`${base}\`...\n\n`
        );
        if (await config.git.isSameRef(base, target)) {
            stream.markdown('No changes found.');
            return;
        }
    }
    if (reviewRequest.userPrompt) {
        stream.markdown(
            `Using custom prompt: \`${reviewRequest.userPrompt}\`\n\n`
        );
    }

    const results = await review(config, reviewRequest, stream);

    showReviewResults(config, results, stream, cancellationToken);
}

/** Constructs review request (prompting user if needed) */
async function getReviewRequest(
    config: Config,
    command: string,
    prompt: string
): Promise<ReviewRequest | undefined> {
    const parsedPrompt = await parseArguments(config.git, prompt);

    let reviewScope: ReviewScope;
    if (command === 'commit') {
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

        reviewScope = await config.git.getReviewScope(commit);
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
        } else if (command === 'review') {
            refs = await pickRefs(config, undefined);
        } else if (command === 'branch') {
            refs = await pickRefs(config, 'branch');
        }
        if (!refs || !refs.target || !refs.base) {
            return;
        }

        reviewScope = await config.git.getReviewScope(refs.target, refs.base);
    }

    return { scope: reviewScope, userPrompt: parsedPrompt.customPrompt };
}

/** Reviews changes and displays progress bar */
async function review(
    config: Config,
    reviewRequest: ReviewRequest,
    stream: vscode.ChatResponseStream
) {
    return await vscode.window.withProgress(
        {
            cancellable: true,
            location: vscode.ProgressLocation.Notification,
            title: 'Reviewing ',
        },
        async (progress, cancel) => {
            const result = await reviewDiff(
                config,
                reviewRequest,
                progress,
                cancel
            );
            if (cancel.isCancellationRequested) {
                stream.markdown('\nCancelled, showing partial results.');
            }

            return result;
        }
    );
}

function showReviewResults(
    config: Config,
    result: ReviewResult,
    stream: vscode.ChatResponseStream,
    cancellationToken: vscode.CancellationToken
) {
    if (commentController) {
        //remove previous comments
        commentController.dispose();
    }
    commentController = vscode.comments.createCommentController(
        'lgtm',
        'LGTM Comments'
    );

    const options = config.getOptions();
    const isTargetCheckedOut = result.request.scope.isTargetCheckedOut;
    let noProblemsFound = true;
    for (const file of result.fileComments) {
        if (cancellationToken.isCancellationRequested) {
            return;
        }

        const filteredFileComments = file.comments.filter(
            (comment) => comment.severity >= options.minSeverity
        );

        // if (filteredFileComments.length > 0) {
        //     stream.anchor(toUri(config, file.target));
        // }

        for (const comment of filteredFileComments) {
            const isValidLineNumber = isTargetCheckedOut && comment.line > 0;
            const startPosition = new vscode.Position(comment.line - 1, 0);
            // const location = isValidLineNumber
            //     ? new vscode.Location(
            //           toUri(config, file.target),
            //           startPosition
            //       )
            //     : null;
            const commentMarkdown = `${comment.comment} (Severity: ${comment.severity}/5)`;

            const thread = commentController.createCommentThread(
                toUri(config, file.target),
                new vscode.Range(startPosition, startPosition),
                [
                    {
                        body: commentMarkdown,
                        mode: vscode.CommentMode.Preview,
                        author: { name: 'LGTM' },
                    },
                ]
            );
            thread.canReply = false;
            if (!isValidLineNumber) {
                thread.label =
                    '(line information inaccurate since the reviewed commit is not checked out)';
            }

            // stream.markdown(`\n - `);
            // if (location) {
            //     stream.anchor(location);
            // } else {
            //     stream.markdown(`Line ${comment.line}: `);
            // }
            // stream.markdown(commentMarkdown);
            noProblemsFound = false;
        }
        if (options.enableDebugOutput && file.debug) {
            const numCommentsSkipped = file.comments.reduce(
                (acc, comment) =>
                    comment.severity < options.minSeverity ? acc + 1 : acc,
                0
            );
            config.logger.debug(
                `File: ${file.target} Input tokens: ${file.debug?.promptTokens} Response tokens: ${file.debug?.responseTokens} Skipped comments: ${numCommentsSkipped}`
            );
        }

        if (filteredFileComments.length > 0) {
            stream.markdown('\n\n');
        }
    }

    if (noProblemsFound) {
        stream.markdown('\nNo problems found.');
    } else {
        if (!isTargetCheckedOut) {
            vscode.commands.executeCommand(
                'workbench.action.focusCommentsPanel'
            );
            stream.markdown(
                '\nNote: The target branch or commit is not checked out, so line numbers may not match the current state.'
            );
        }
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
