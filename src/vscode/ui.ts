import * as vscode from 'vscode';

import type { Config } from '@/types/Config';
import { type Ref, UncommittedRef } from '@/types/Ref';
import { distributeItems } from '@/utils/distributeItems';
import { shortHashLength } from '@/utils/git';

type RefQuickPickItem = vscode.QuickPickItem & {
    ref?: Ref;
};

/** Ask user to select a single ref. Returns undefined if aborted */
export async function pickRef(
    config: Config,
    title: string,
    beforeRef?: string,
    type?: 'branch' | 'tag' | 'commit', // all types by default
    totalCount: number = 30 // total amount of refs to show in picker
): Promise<Ref | undefined> {
    const showUncommitted = !type && !beforeRef;
    const showDetachedHead = !beforeRef;
    const showBranches = !type || type === 'branch';
    const showCommits = !type || type === 'commit';
    const showTags = !type || type === 'tag';

    const [uncommitted, detachedHead, branches, commits, tags] =
        await Promise.all([
            showUncommitted ? config.git.getUncommittedChanges() : [],
            showDetachedHead ? config.git.getDetachedHead() : undefined,
            showBranches
                ? config.git.getBranchList(beforeRef, totalCount + 1)
                : [],
            showCommits
                ? config.git.getCommitList(beforeRef, totalCount + 1)
                : [],
            showTags ? config.git.getTagList(beforeRef, totalCount + 1) : [],
        ]);

    const [numBranches, numCommits, numTags] = distributeItems(
        totalCount - uncommitted.length - (detachedHead ? 1 : 0),
        [branches.length, commits.length, tags.length]
    );

    let moreBranchesOption;
    let moreCommitsOption;
    let moreTagsOption;
    const quickPickOptions: RefQuickPickItem[] = [];

    if (uncommitted.length > 0) {
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
    if (detachedHead) {
        quickPickOptions.push({
            label: 'Detached HEAD',
            kind: vscode.QuickPickItemKind.Separator,
        });
        const detachedIcon = new vscode.ThemeIcon('git-commit');
        quickPickOptions.push({
            label: detachedHead.ref.substring(0, shortHashLength),
            ref: detachedHead.ref,
            description: detachedHead.description,
            iconPath: detachedIcon,
        });
    }
    if (branches.length > 0) {
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

    if (commits.length > 0) {
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
                detail: ref.extra,
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

    if (tags.length > 0) {
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
                detail: tag.extra,
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
    if (
        config.git.isUncommitted(target) ||
        (await config.git.isInitialCommit(target))
    ) {
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

/** offer Fetch Remotes action*/
export async function promptToFetchRemotes(message: string) {
    const abortAction = { title: 'Abort' };
    const fetchAction = { title: 'Fetch Remotes' };

    const userSelection = await vscode.window.showErrorMessage(
        message,
        {},
        abortAction,
        fetchAction
    );

    if (userSelection === fetchAction) {
        //refetch using vscode (should handle passphrase input if needed)
        await vscode.commands.executeCommand('git.fetch');
        return 'fetch';
    }
    return 'abort';
}

export async function promptToCheckout(
    config: Config,
    target: string
): Promise<boolean> {
    const autoCheckoutTarget = config.getOptions().autoCheckoutTarget;

    if (autoCheckoutTarget === 'always') {
        return true;
    } else if (autoCheckoutTarget === 'never') {
        return false;
    }

    // Show prompt with options to remember preference
    const checkoutAction = { title: 'Check Out' };
    const alwaysCheckoutAction = { title: 'Always Check Out' };
    const skipAction = { title: 'Skip' };
    const neverCheckoutAction = { title: 'Never' };

    const userSelection = await vscode.window.showInformationMessage(
        `Would you like to check out '${target}'? This enables code navigation.`,
        {},
        checkoutAction,
        alwaysCheckoutAction,
        skipAction,
        neverCheckoutAction
    );

    if (userSelection === alwaysCheckoutAction) {
        await config.setOption('autoCheckoutTarget', 'always');
    } else if (userSelection === neverCheckoutAction) {
        await config.setOption('autoCheckoutTarget', 'never');
    }

    return (
        userSelection === checkoutAction ||
        userSelection === alwaysCheckoutAction
    );
}
