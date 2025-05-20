import * as vscode from 'vscode';

import { Config } from '../types/Config';
import { UncommittedRef, type Ref } from '../types/Ref';
import { distributeItems } from '../utils/distributeItems';
import { isUncommitted, RefList, shortHashLength } from '../utils/git';

type RefQuickPickItem = vscode.QuickPickItem & {
    ref?: Ref;
};

/** Ask user to select a single ref. Returns undefined if aborted */
export async function pickRef(
    config: Config,
    title: string,
    beforeRef?: string,
    type?: 'branch' | 'tag' | 'commit', // all types by default
    totalCount: number = 20 // total amount of refs to show in picker
): Promise<Ref | undefined> {
    let uncommitted: RefList = [];
    let branches: RefList = [];
    let commits: RefList = [];
    let tags: RefList = [];
    if (!type && !beforeRef) {
        uncommitted = await config.git.getUncommittedChanges();
    }
    if (!type || type === 'branch') {
        branches = await config.git.getBranchList(beforeRef, totalCount + 1);
    }
    if (!type || type === 'commit') {
        commits = await config.git.getCommitList(beforeRef, totalCount + 1);
    }
    if (!type || type === 'tag') {
        tags = await config.git.getTagList(beforeRef, totalCount + 1);
    }

    const [numBranches, numCommits, numTags] = distributeItems(
        totalCount - uncommitted.length,
        [branches.length, commits.length, tags.length]
    );

    let moreBranchesOption = undefined;
    let moreCommitsOption = undefined;
    let moreTagsOption = undefined;
    const quickPickOptions: RefQuickPickItem[] = [];

    if (uncommitted && uncommitted.length > 0) {
        const uncommittedIcon = new vscode.ThemeIcon('request-changes');
        quickPickOptions.push({
            label: 'Not committed',
            kind: vscode.QuickPickItemKind.Separator,
        });
        for (const ref of uncommitted) {
            quickPickOptions.push({
                label:
                    ref.ref === UncommittedRef.Staged ? 'Staged' : 'Unstaged',
                ref: ref.ref,
                description: ref.description,
                iconPath: uncommittedIcon,
            });
        }
    }
    if (branches && branches.length > 0) {
        quickPickOptions.push({
            label: 'Branches',
            kind: vscode.QuickPickItemKind.Separator,
        });
        const branchIcon = new vscode.ThemeIcon('git-branch');
        for (let i = 0; i < numBranches; i++) {
            const branch = branches[i];
            quickPickOptions.push({
                label: branch.ref as string,
                ref: branch.ref,
                description: branch.description,
                detail: branch.extra,
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
                label: (ref.ref as string).substring(0, shortHashLength),
                ref: ref.ref,
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
                label: tag.ref as string,
                ref: tag.ref,
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
        matchOnDetail: true, //match by other branch names as well
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
    return target.ref;
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
    if (isUncommitted(target)) {
        return { target };
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
