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
        const scope = await pickBranchesOrTags(config);
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
                ' - `@lgtm /branch` to review changes between two branches or tags\n' +
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
    const options = config.getOptions();
    let noProblemsFound = true;
    for (const file of fileComments) {
        if (cancellationToken.isCancellationRequested) {
            return;
        }

        stream.anchor(toUri(config, file.target), file.target);
        for (const comment of file.comments) {
            if (comment.severity < options.minSeverity) {
                continue;
            }

            stream.markdown(
                '\n - ' + comment.comment + ' ' + comment.severity + '/5'
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
        return;
    }
}

/** Asks user to select a commit. Returns short commit hash, or undefined when aborted. */
async function pickCommit(config: Config): Promise<string | undefined> {
    const commits = await config.git.log({ maxCount: 30 });
    const quickPickOptions: vscode.QuickPickItem[] = commits.all.map(
        (commit) => ({
            label: commit.hash.substring(0, 7),
            description: commit.message,
            iconPath: new vscode.ThemeIcon('git-commit'),
        })
    );
    const manualInputOption = {
        label: 'Input commit hash manually...',
    };
    quickPickOptions.unshift(manualInputOption, {
        label: 'Recent Commits',
        kind: vscode.QuickPickItemKind.Separator,
    });

    const selected = await vscode.window.showQuickPick(quickPickOptions, {
        title: 'Select a commit to review',
        matchOnDescription: true,
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

/** Asks user to select base and target. Returns undefined if aborted. */
async function pickBranchesOrTags(config: Config) {
    const branchIcon = new vscode.ThemeIcon('git-branch');
    const tagIcon = new vscode.ThemeIcon('tag');

    const branches = await config.git.branch();
    const tags = await config.git.tags();

    const quickPickOptions: vscode.QuickPickItem[] = [];
    quickPickOptions.push({
        label: 'Branches',
        kind: vscode.QuickPickItemKind.Separator,
    });
    branches.all.forEach((branch) => {
        quickPickOptions.push({ label: branch, iconPath: branchIcon });
    });

    quickPickOptions.push({
        label: 'Tags',
        kind: vscode.QuickPickItemKind.Separator,
    });
    tags.all.forEach((tag) => {
        quickPickOptions.push({ label: tag, iconPath: tagIcon });
    });

    const target = await vscode.window.showQuickPick(quickPickOptions, {
        title: 'Select a branch or tag to review (1/2)',
    });
    if (!target) {
        return;
    }

    const base = await vscode.window.showQuickPick(
        quickPickOptions.filter((name) => name !== target),
        {
            title: 'Select a base branch or tag (2/2)',
        }
    );
    if (!base) {
        return;
    }

    return { baseBranch: base.label, targetBranch: target.label };
}
