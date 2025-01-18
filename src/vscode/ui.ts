import * as vscode from 'vscode';

import { Config } from '../types/Config';
import { distributeItems } from '../utils/distributeItems';
import { RefList } from '../utils/git';

/** same as git's default length for short commit hashes */
const shortHashLength = 7;

/** Ask user to select a single ref. Returns undefined if aborted */
export async function pickRef(
    config: Config,
    title: string,
    beforeRef?: string,
    type?: 'branch' | 'tag' | 'commit', // all types by default
    totalCount: number = 20 // total amount of refs to show in picker
): Promise<string | undefined> {
    let branches: RefList = [];
    let commits: RefList = [];
    let tags: RefList = [];
    if (!type || type === 'branch') {
        branches = await config.git.getBranchList(beforeRef, totalCount + 1);
    }
    if (!type || type === 'commit') {
        commits = await config.git.getCommitList(beforeRef, totalCount + 1);
    }
    if (!type || type === 'tag') {
        tags = await config.git.getTagList(beforeRef, totalCount + 1);
    }

    const [numBranches, numCommits, numTags] = distributeItems(totalCount, [
        branches.length,
        commits.length,
        tags.length,
    ]);

    let moreBranchesOption = undefined;
    let moreCommitsOption = undefined;
    let moreTagsOption = undefined;
    const quickPickOptions: vscode.QuickPickItem[] = [];

    if (branches && branches.length > 0) {
        quickPickOptions.push({
            label: 'Branches',
            kind: vscode.QuickPickItemKind.Separator,
        });
        const branchIcon = new vscode.ThemeIcon('git-branch');
        for (let i = 0; i < numBranches; i++) {
            const branch = branches[i];
            quickPickOptions.push({
                label: branch.ref,
                description: branch.description,
                iconPath: branchIcon,
            });
        }
        if (branches.length > numBranches) {
            moreBranchesOption = {
                label: 'More branches...',
                alwaysShow: true,
            };
            quickPickOptions.push(moreBranchesOption);
        }
    }

    if (commits && commits.length > 0) {
        quickPickOptions.push({
            label: 'Commits',
            kind: vscode.QuickPickItemKind.Separator,
        });
        const commitIcon = new vscode.ThemeIcon('git-commit');
        for (let i = 0; i < numCommits; i++) {
            const ref = commits[i];
            quickPickOptions.push({
                label: ref.ref.substring(0, shortHashLength), // short hash
                description: ref.description,
                iconPath: commitIcon,
            });
        }
        if (commits.length > numCommits) {
            moreCommitsOption = {
                label: 'More commits...',
                alwaysShow: true,
            };
            quickPickOptions.push(moreCommitsOption);
        }
    }

    if (tags && tags.length > 0) {
        quickPickOptions.push({
            label: 'Tags',
            kind: vscode.QuickPickItemKind.Separator,
        });
        const tagIcon = new vscode.ThemeIcon('tag');
        for (let i = 0; i < numTags; i++) {
            const tag = tags[i];
            quickPickOptions.push({
                label: tag.ref,
                description: tag.description,
                iconPath: tagIcon,
            });
        }
        if (tags.length > numTags) {
            moreTagsOption = {
                label: 'More tags...',
                alwaysShow: true,
            };
            quickPickOptions.push(moreTagsOption);
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
