// allowed only in extension.ts and config.ts, since it cannot be imported in unit tests.
// eslint-disable-next-line no-restricted-imports
import * as vscode from 'vscode';

import { reviewDiff } from './review/review';
import { Config } from './types/Config';
import { ReviewResult } from './types/ReviewResult';
import { ReviewScope } from './types/ReviewScope';
import { getConfig, toUri } from './utils/config';
import {
    getBranchList,
    getCommitList,
    getReviewScope,
    getTagList,
    isSameRef,
} from './utils/git';

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

    if (
        !chatRequest.command ||
        !['review', 'branch', 'commit'].includes(chatRequest.command)
    ) {
        stream.markdown(
            'Please use one of the following commands:\n' +
                ' - `@lgtm /review` to review changes between two branches, commits, or tags\n' +
                ' - `@lgtm /branch` to review changes between two branches or tags\n' +
                ' - `@lgtm /commit` to review changes in a single commit'
        );
        // TODO remove other commands later
        return;
    }

    const config = await getConfig();

    //TODO handle any arguments in chatRequest.prompt (e.g. /review BRANCH1 BRANCH2)
    let reviewScope: ReviewScope;
    if (chatRequest.command === 'commit') {
        const commit = await pickCommit(config);
        if (!commit) {
            return;
        }

        stream.markdown(`Reviewing changes in commit \`${commit}\`.`);
        reviewScope = await getReviewScope(config.git, commit);
    } else {
        let refs;
        let fromRefPreposition = 'at';
        if (chatRequest.command === 'review') {
            refs = await pickRefs(config);
            fromRefPreposition = 'on'; //TODO
        } else if (chatRequest.command === 'branch') {
            refs = await pickBranchesOrTags(config);
            fromRefPreposition = 'on';
        }
        if (!refs) {
            return;
        }

        stream.markdown(
            `Reviewing changes ${fromRefPreposition} \`${refs.target}\` compared to \`${refs.base}\`.`
        );
        if (await isSameRef(config.git, refs.base, refs.target)) {
            stream.markdown(' No changes found.');
            return;
        }
        reviewScope = await getReviewScope(config.git, refs.target, refs.base);
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

/** Asks user to select a commit. Returns short commit hash, or undefined when aborted.
 * If `beforeRef` is provided, only commits before that ref are shown. */
async function pickCommit(
    config: Config,
    beforeRef?: string,
    pickerTitle: string = 'Select a commit to review'
) {
    const commit = await pickRef(config, pickerTitle, beforeRef, 'commit');
    if (!commit) {
        return;
    }

    return commit;
}

/** Asks user to select base and target. Returns undefined if aborted. */
async function pickBranchesOrTags(config: Config) {
    const branches = await getBranchList(config.git);
    const tags = await getTagList(config.git);

    const quickPickOptions: vscode.QuickPickItem[] = [];
    quickPickOptions.push({
        label: 'Branches',
        kind: vscode.QuickPickItemKind.Separator,
    });
    const branchIcon = new vscode.ThemeIcon('git-branch');
    branches.refs.forEach((branch) => {
        quickPickOptions.push({
            label: branch.ref,
            description: branch.description,
            iconPath: branchIcon,
        });
    });

    if (tags.refs.length > 0) {
        quickPickOptions.push({
            label: 'Tags',
            kind: vscode.QuickPickItemKind.Separator,
        });
        const tagIcon = new vscode.ThemeIcon('tag');
        tags.refs.forEach((tag) => {
            quickPickOptions.push({
                label: tag.ref,
                description: tag.description,
                iconPath: tagIcon,
            });
        });
    }

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

/** Asks user to select base and target. Returns undefined if aborted. */
async function pickRefs(config: Config) {
    const target = await pickRef(
        config,
        'Select a branch/tag/commit to review (1/2)'
    );
    if (!target) {
        return;
    }
    const base = await pickRef(
        config,
        'Select a branch/tag/commit to compare with (2/2)',
        target
    );
    if (!base) {
        return;
    }

    return { base, target };
}

/** Ask user to select a single ref. Returns undefined if aborted */
async function pickRef(
    config: Config,
    title: string,
    beforeRef?: string,
    type?: 'branch' | 'tag' | 'commit', // all types by default
    totalCount: number = 20
): Promise<string | undefined> {
    const maxCount = type ? totalCount : totalCount / 3;
    let moreBranchesOption = undefined;
    let moreCommitsOption = undefined;
    let moreTagsOption = undefined;

    const quickPickOptions: vscode.QuickPickItem[] = [];
    if (!type || type === 'branch') {
        const branches = await getBranchList(config.git, beforeRef, maxCount);

        quickPickOptions.push({
            label: 'Branches',
            kind: vscode.QuickPickItemKind.Separator,
        });
        const branchIcon = new vscode.ThemeIcon('git-branch');
        branches.refs.forEach((branch) => {
            quickPickOptions.push({
                label: branch.ref,
                description: branch.description,
                iconPath: branchIcon,
            });
        });
        if (branches.hasMore) {
            moreBranchesOption = {
                label: 'More branches...',
                alwaysShow: true,
            };
            quickPickOptions.push(moreBranchesOption);
        }
    }

    if (!type || type === 'commit') {
        const commits = await getCommitList(config.git, beforeRef, maxCount);
        if (commits.refs.length > 0) {
            quickPickOptions.push({
                label: 'Commits',
                kind: vscode.QuickPickItemKind.Separator,
            });
            const commitIcon = new vscode.ThemeIcon('git-commit');
            commits.refs.forEach((ref) => {
                quickPickOptions.push({
                    label: ref.ref.substring(0, 7), //short hash
                    description: ref.description,
                    iconPath: commitIcon,
                });
            });
            if (commits.hasMore) {
                moreCommitsOption = {
                    label: 'More commits...',
                    alwaysShow: true,
                };
                quickPickOptions.push(moreCommitsOption);
            }
        }
    }

    if (!type || type === 'tag') {
        const tags = await getTagList(config.git, beforeRef, maxCount);
        if (tags.refs.length > 0) {
            quickPickOptions.push({
                label: 'Tags',
                kind: vscode.QuickPickItemKind.Separator,
            });
            const tagIcon = new vscode.ThemeIcon('tag');
            tags.refs.forEach((tag) => {
                quickPickOptions.push({
                    label: tag.ref,
                    description: tag.description,
                    iconPath: tagIcon,
                });
            });
            if (tags.hasMore) {
                moreTagsOption = {
                    label: 'More tags...',
                    alwaysShow: true,
                };
                quickPickOptions.push(moreTagsOption);
            }
        }
    }

    const target = await vscode.window.showQuickPick(quickPickOptions, {
        title,
        matchOnDescription: true, //match by commit message as well
    });
    if (!target) {
        return;
    }
    if (moreBranchesOption && target === moreBranchesOption) {
        return pickRef(config, title, beforeRef, 'branch', totalCount * 2);
    }
    if (moreCommitsOption && target === moreCommitsOption) {
        return pickRef(config, title, beforeRef, 'commit', totalCount * 2);
    }
    if (moreTagsOption && target === moreTagsOption) {
        return pickRef(config, title, beforeRef, 'tag', totalCount * 2);
    }
    return target.label;
}
