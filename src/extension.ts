import * as vscode from 'vscode';

import { reviewDiff } from './review/review';
import { Config } from './types/Config';
import { UncommittedRef } from './types/Ref';
import { ReviewRequest, ReviewScope } from './types/ReviewRequest';
import { ReviewResult } from './types/ReviewResult';
import { parseArguments } from './utils/parseArguments';
import { getConfig, toUri } from './vscode/config';
import { ReviewTool } from './vscode/ReviewTool';
import { pickCommit, pickRef, pickRefs } from './vscode/ui';

let chatParticipant: vscode.ChatParticipant;

// called the first time a command is executed
export function activate(context: vscode.ExtensionContext) {
    chatParticipant = vscode.chat.createChatParticipant('lgtm', handleChat);
    chatParticipant.iconPath = vscode.Uri.joinPath(
        context.extensionUri,
        'images/chat_icon.png'
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'lgtm.selectChatModel',
            handleSelectChatModel
        )
    );

    context.subscriptions.push(
        vscode.lm.registerTool('review', new ReviewTool())
    );
}

export function deactivate() {
    if (chatParticipant) {
        chatParticipant.dispose();
    }
}

async function handleChat(
    chatRequest: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<void> {
    const config = await getConfig();

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
    } else if (!reviewRequest.scope.isCommitted) {
        const targetLabel =
            reviewRequest.scope.target === UncommittedRef.Staged
                ? 'staged'
                : 'unstaged';
        stream.markdown(`Reviewing ${targetLabel} changes...\n\n`);
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

    const results = await review(config, reviewRequest, stream, token);

    showReviewResults(config, results, stream, token);
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
        if (!config.git.isValidRefPair(refs)) {
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
            const isValidLineNumber = isTargetCheckedOut && comment.line > 0;
            const location = isValidLineNumber
                ? new vscode.Location(
                      toUri(config, file.target),
                      new vscode.Position(comment.line - 1, 0)
                  )
                : null;

            stream.markdown(`\n - `);
            if (location) {
                stream.anchor(location);
            } else {
                stream.markdown(`Line ${comment.line}: `);
            }
            stream.markdown(
                `${comment.comment} (Severity: ${comment.severity}/5)`
            );
            noProblemsFound = false;
        }
        if (options.enableDebugOutput) {
            const numCommentsSkipped = file.comments.reduce(
                (acc, comment) =>
                    comment.severity < options.minSeverity ? acc + 1 : acc,
                0
            );
            config.logger.debug(
                `File: ${file.target} Skipped comments: ${numCommentsSkipped}`
            );
        }

        if (filteredFileComments.length > 0) {
            stream.markdown('\n\n');
        }
    }

    if (noProblemsFound) {
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

async function handleSelectChatModel() {
    const config = await getConfig();
    const models = await vscode.lm.selectChatModels();
    if (models && models.length > 0) {
        const currentModelId = config.getOptions().chatModel;

        const quickPickItems = models.map((model) => {
            const prefix = model.id === currentModelId ? '$(check)' : '\u2003 '; // em space
            const modelName = model.name ?? model.id;
            return {
                label: prefix + modelName,
                description: model.vendor,
                id: model.id, // Store the actual model.id
                name: modelName,
            };
        });
        const selectedQuickPickItem = await vscode.window.showQuickPick(
            quickPickItems,
            { placeHolder: 'Select a chat model for LGTM reviews' }
        );
        if (selectedQuickPickItem) {
            await vscode.workspace
                .getConfiguration('lgtm')
                .update(
                    'chatModel',
                    selectedQuickPickItem.id,
                    vscode.ConfigurationTarget.Global
                );
            vscode.window.showInformationMessage(
                `LGTM chat model set to: ${selectedQuickPickItem.name}`
            );
        }
    } else {
        vscode.window.showWarningMessage('No Copilot chat models available.');
    }
}
