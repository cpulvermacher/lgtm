// allowed only in extension.ts and config.ts, since it cannot be imported in unit tests.
// eslint-disable-next-line no-restricted-imports
import * as vscode from 'vscode';

import { reviewDiff } from './review/review';
import { Config } from './types/Config';
import { ReviewResult } from './types/ReviewResult';
import { ReviewScope } from './types/ReviewScope';
import { getConfig, toUri } from './utils/config';
import { getReviewScope, isSameRef } from './utils/git';

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
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    cancellationToken: vscode.CancellationToken
): Promise<void> {
    console.debug('Received request:', chatRequest, 'with context:', context);
    if (__GIT_VERSION__) {
        stream.markdown(`**LGTM dev build: ${__GIT_VERSION__}**\n\n`);
    }

    if (chatRequest.command !== 'branch' && chatRequest.command !== 'commit') {
        stream.markdown(
            'Please use one of the following commands:\n' +
                ' - `@lgtm /branch` to review changes between two branches or tags\n' +
                ' - `@lgtm /commit` to review changes in a commit'
        );
        return;
    }

    const config = await getConfig();

    //TODO handle any arguments in chatRequest.prompt
    let reviewScope: ReviewScope;
    if (chatRequest.command === 'branch') {
        const refs = await pickBranchesOrTags(config);
        if (!refs) {
            return;
        }

        stream.markdown(
            `Reviewing changes on \`${refs.target}\` compared to \`${refs.base}\`.`
        );
        if (await isSameRef(config.git, refs.base, refs.target)) {
            stream.markdown(' No changes found.');
            return;
        }
        reviewScope = await getReviewScope(config.git, refs.target, refs.base);
    } else if (chatRequest.command === 'commit') {
        const commit = await pickCommit(config);
        if (!commit) {
            return;
        }

        stream.markdown(`Reviewing changes in commit \`${commit}\`.`);
        reviewScope = await getReviewScope(config.git, commit);
    } else {
        throw new Error(`Unhandled command "${chatRequest.command}"`);
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

/** Asks user to select a commit. Returns short commit hash, or undefined when aborted. */
async function pickCommit(config: Config) {
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

    let commit;
    if (selected === manualInputOption) {
        commit = await vscode.window.showInputBox({
            title: 'Enter a commit hash',
            value: 'HEAD',
            ignoreFocusOut: true,
        });
    } else {
        commit = selected?.label;
    }
    if (!commit) {
        return undefined;
    }

    return commit;
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

    return {
        base: base.label,
        target: target.label,
    };
}
