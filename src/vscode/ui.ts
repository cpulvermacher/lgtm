import * as vscode from 'vscode';

import { Config } from '../types/Config';

/** Ask user to select a single ref. Returns undefined if aborted */
export async function pickRef(
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
        const branches = await config.git.getBranchList(beforeRef, maxCount);

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
        const commits = await config.git.getCommitList(beforeRef, maxCount);
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
        const tags = await config.git.getTagList(beforeRef, maxCount);
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

    const expandedCount = totalCount * 100;
    if (moreBranchesOption && target === moreBranchesOption) {
        return pickRef(config, title, beforeRef, 'branch', expandedCount);
    }
    if (moreCommitsOption && target === moreCommitsOption) {
        return pickRef(config, title, beforeRef, 'commit', expandedCount);
    }
    if (moreTagsOption && target === moreTagsOption) {
        return pickRef(config, title, beforeRef, 'tag', expandedCount);
    }
    return target.label;
}

/** Asks user to select base and target. If `type` is set, only shows this type of ref. Otherwise, all types are allowed. Returns undefined if aborted. */
export async function pickRefs(config: Config, type?: 'branch') {
    const typeDescription = type ? type : 'branch/commit/tag';
    const target = await pickRef(
        config,
        `Select a ${typeDescription} to review (1/2)`,
        undefined,
        type
    );
    if (!target) {
        return;
    }
    const base = await pickRef(
        config,
        `Select a ${typeDescription} to compare with (2/2)`,
        target,
        type
    );
    if (!base) {
        return;
    }

    return { base, target };
}

/** Asks user to select a commit. Returns short commit hash, or undefined when aborted.
 * If `beforeRef` is provided, only commits before that ref are shown. */
export async function pickCommit(
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
