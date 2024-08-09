import * as vscode from 'vscode';

import { Config, getConfig, toUri } from './config';
import { FileReview, reviewDiff } from './review';

let chatParticipant: vscode.ChatParticipant;

// called the first time a command is executed
export function activate() {
    chatParticipant = vscode.chat.createChatParticipant('lgtm', handler);
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
        const baseBranch = await vscode.window.showQuickPick(branchNames, {
            title: 'Select a base branch (2/2)',
        });

        const diffRevisionRange = `${baseBranch}..${targetBranch}`;

        stream.markdown(`Reviewing ${diffRevisionRange}.\n`);
        const reviewComments = await reviewDiff(
            config,
            stream,
            diffRevisionRange,
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

        const diffRevisionRange = `${commit}^..${commit}`;

        stream.markdown(`Reviewing ${diffRevisionRange}.\n`);
        const reviewComments = await reviewDiff(
            config,
            stream,
            diffRevisionRange,
            cancellationToken
        );

        showReviewComments(reviewComments, stream, config, cancellationToken);
    } else {
        stream.markdown(`Please use one of the following commands:
            - \`@lgtm /branch\` to review changes in a branch
            - \`@lgtm /commit\` to review changes in a commit`);
    }
}

function showReviewComments(
    reviewComments: FileReview[] | undefined,
    stream: vscode.ChatResponseStream,
    config: Config,
    cancellationToken: vscode.CancellationToken
) {
    if (!reviewComments) {
        stream.markdown('No problems found.');
        return;
    }

    //sort by descending severity
    reviewComments.sort((a, b) => b.severity - a.severity);

    for (const review of reviewComments) {
        if (cancellationToken.isCancellationRequested) {
            return;
        }
        if (review.severity === 0) {
            continue;
        }

        stream.anchor(toUri(config, review.target), review.target);
        stream.markdown('\n' + review.comment);
        stream.markdown('\n\n');
    }
}
