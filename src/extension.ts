import * as vscode from 'vscode';

import { groupByFile, ReviewComment, reviewDiff } from './review/review';
import { Config, getConfig, toUri } from './utils/config';

let chatParticipant: vscode.ChatParticipant;

// called the first time a command is executed
export function activate(context: vscode.ExtensionContext) {
    chatParticipant = vscode.chat.createChatParticipant('lgtm', handler);
    chatParticipant.iconPath = vscode.Uri.joinPath(
        context.extensionUri,
        'images/icon.png'
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

        const reviewComments = await reviewDiff(
            config,
            stream,
            baseBranch,
            targetBranch,
            cancellationToken
        );

        showReviewComments(reviewComments, stream, config, cancellationToken);
    } else if (request.command === 'commit') {
        //TODO handle any arguments in request.prompt

        const commit = await vscode.window.showInputBox({
            title: 'Enter a commit hash',
            value: 'HEAD',
            ignoreFocusOut: true,
        });
        if (!commit) {
            return;
        }

        const lastRevision = `${commit}^`;
        const reviewComments = await reviewDiff(
            config,
            stream,
            lastRevision,
            commit,
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
    reviewComments: ReviewComment[] | undefined,
    stream: vscode.ChatResponseStream,
    config: Config,
    cancellationToken: vscode.CancellationToken
) {
    if (!reviewComments || reviewComments.length === 0) {
        stream.markdown('No problems found.');
        return;
    }

    const fileComments = groupByFile(reviewComments);
    for (const file of fileComments) {
        if (cancellationToken.isCancellationRequested) {
            return;
        }
        if (file.maxSeverity === 0) {
            continue;
        }

        stream.anchor(toUri(config, file.target), file.target);
        for (const comment of file.comments) {
            stream.markdown(
                '\n' + comment.comment + ' ' + comment.severity + '/5'
            );
        }
        stream.markdown('\n\n');
    }
}
