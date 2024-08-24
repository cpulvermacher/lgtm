import * as vscode from 'vscode';

import { reviewDiff } from './review/review';
import { Config } from './types/Config';
import { FileComments } from './types/FileComments';
import { getConfig, toUri } from './utils/config';

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
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    cancellationToken: vscode.CancellationToken
): Promise<void> {
    console.debug('Received request:', request, 'with context:', context);

    const config = await getConfig();

    if (request.command === 'branch') {
        const scope = await pickBranches(config);
        if (!scope) {
            return;
        }

        stream.markdown(
            `Reviewing changes on branch \`${scope.targetBranch}\` compared to \`${scope.baseBranch}\`\n`
        );

        const reviewComments = await reviewDiff(
            config,
            stream,
            scope,
            cancellationToken
        );

        showReviewComments(reviewComments, stream, config, cancellationToken);
    } else if (request.command === 'commit') {
        //TODO handle any arguments in request.prompt

        const commit = await pickCommit(config);
        if (!commit) {
            return;
        }

        stream.markdown(`Reviewing changes in commit \`${commit}\`\n`);
        const reviewComments = await reviewDiff(
            config,
            stream,
            { commit },
            cancellationToken
        );

        showReviewComments(reviewComments, stream, config, cancellationToken);
    } else {
        stream.markdown(
            'Please use one of the following commands:\n' +
                ' - `@lgtm /branch` to review changes on a branch (compared to a reference branch)\n' +
                ' - `@lgtm /commit` to review changes in a commit'
        );
    }
}

function showReviewComments(
    fileComments: FileComments[],
    stream: vscode.ChatResponseStream,
    config: Config,
    cancellationToken: vscode.CancellationToken
) {
    if (fileComments.length === 0) {
        stream.markdown('No problems found.');
        return;
    }

    const options = config.getOptions();
    for (const file of fileComments) {
        if (cancellationToken.isCancellationRequested) {
            return;
        }
        if (file.maxSeverity < options.minSeverity) {
            continue;
        }

        stream.anchor(toUri(config, file.target), file.target);
        for (const comment of file.comments) {
            if (comment.severity < options.minSeverity) {
                continue;
            }

            stream.markdown(
                '\n - ' + comment.comment + ' ' + comment.severity + '/5'
            );
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
}

/** Asks user to select a commit. Returns short commit hash, or undefined when aborted. */
async function pickCommit(config: Config): Promise<string | undefined> {
    const commits = await config.git.log({ maxCount: 20 });
    const quickPickOptions: vscode.QuickPickItem[] = commits.all.map(
        (commit) => ({
            label: commit.hash.substring(0, 7),
            description: commit.message,
        })
    );
    quickPickOptions.push({
        label: '',
        kind: vscode.QuickPickItemKind.Separator,
    });
    const manualInputOption = {
        label: 'Input commit hash manually...',
    };
    quickPickOptions.push(manualInputOption);

    const selected = await vscode.window.showQuickPick(quickPickOptions, {
        title: 'Select a commit to review',
    });

    if (selected === manualInputOption) {
        return await vscode.window.showInputBox({
            title: 'Enter a commit hash',
            value: 'HEAD',
            ignoreFocusOut: true,
        });
    }

    return selected?.label;
}

/** Asks user to select base and target branch. Returns undefined if aborted. */
async function pickBranches(config: Config) {
    const branches = await config.git.branch();
    const branchNames = branches.all;
    //select via quick input
    const targetBranch = await vscode.window.showQuickPick(branchNames, {
        title: 'Select a branch to review (1/2)',
    });
    if (!targetBranch) {
        return;
    }

    const baseBranch = await vscode.window.showQuickPick(
        branchNames.filter((name) => name !== targetBranch),
        {
            title: 'Select a base branch (2/2)',
        }
    );
    if (!baseBranch) {
        return;
    }

    return { baseBranch, targetBranch };
}
