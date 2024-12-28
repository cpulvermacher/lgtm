import { SimpleGit } from 'simple-git';

import { ReviewScope } from '../types/ReviewScope';

/** Get list of files in the commit */
export async function getChangedFiles(
    git: SimpleGit,
    diffRevisionRange: string
): Promise<string[]> {
    const fileString = await git.diff(['--name-only', diffRevisionRange]);
    return fileString.split('\n').filter((f) => f.length > 0);
}

/** get diff of the given file between the two revisions */
export async function getFileDiff(
    git: SimpleGit,
    diffRevisionRange: string,
    file: string,
    contextLines: number = 3
): Promise<string> {
    let diff = await git.diff([
        '--no-prefix',
        `-U${contextLines}`,
        diffRevisionRange,
        '--',
        file,
    ]);

    diff = diff
        .split('\n')
        .filter((line) => line !== '\\ No newline at end of file')
        .join('\n');

    return addLineNumbers(diff);
}

/** prefix the following diff with the line numbers of the to-side (from hunk headers) */
export function addLineNumbers(diff: string) {
    let lineNo = 0;
    return diff
        .split('\n')
        .map((line) => {
            if (line.startsWith('@@')) {
                // format: `@@ -fromLine,fromCount +toLine,toCount @@ function name`, with count=1 being optional
                const match = line.match(/^@@ -\d+(,\d+)? \+(\d+)(,\d+)? @@/);
                if (!match) {
                    throw new Error(`Failed to parse hunk header: ${line}`);
                }

                const toFileStartLine = match[2];
                lineNo = parseInt(toFileStartLine, 10);
                return `0\t${line}`;
            } else if (line.startsWith('-')) {
                return `0\t${line}`;
            } else if (lineNo > 0) {
                return `${lineNo++}\t${line}`;
            }
            return `${lineNo}\t${line}`;
        })
        .join('\n');
}

/** get review scope for the given refs (commits, branches, tags, ...). If baseRef is undefined will use the parent commit. */
export async function getReviewScope(
    git: SimpleGit,
    targetRef: string,
    baseRef?: string
): Promise<ReviewScope> {
    if (!baseRef) {
        baseRef = `${targetRef}^`;
    }

    const { revisionRangeDiff, revisionRangeLog } = await getCommitRange(
        git,
        baseRef,
        targetRef
    );
    const changeDescription = await getCommitMessages(git, revisionRangeLog);

    const isTargetCheckedOut = await isSameRef(git, 'HEAD', targetRef);
    return {
        target: targetRef,
        base: baseRef,
        revisionRangeDiff,
        revisionRangeLog,
        changeDescription,
        isTargetCheckedOut,
    };
}

/** Validates the given revisions and returns diff ranges to get changes between the latest common ancestor and the new revision */
async function getCommitRange(git: SimpleGit, oldRef: string, newRef: string) {
    //verify that the given refs are valid
    await getCommitRef(git, oldRef);
    await getCommitRef(git, newRef);

    return {
        revisionRangeDiff: `${oldRef}...${newRef}`,
        revisionRangeLog: `${oldRef}..${newRef}`,
    };
}

/** return all commit messages in a newline-separated string*/
async function getCommitMessages(
    git: SimpleGit,
    revisionRangeLog: string
): Promise<string> {
    const logs = await git.log([revisionRangeLog]);
    return logs.all.map((log) => log.message).join('\n');
}

/** return true iff if the given refs refer to the same commit */
export async function isSameRef(git: SimpleGit, refA: string, refB: string) {
    return (await getCommitRef(git, refA)) === (await getCommitRef(git, refB));
}

/**
 * return the commit hash for the given commit, branch, tag, or HEAD.
 *
 * Tags are referenced to their commit hash.
 * Throws an error if the ref is not valid.
 */
export async function getCommitRef(
    git: SimpleGit,
    ref: string
): Promise<string> {
    //^{} is needed to dereference tags (no effect on other types of refs)
    return git.revparse(['--verify', '--end-of-options', ref + '^{}']);
}

export type RefList = {
    refs: {
        ref: string;
        description?: string; // e.g. commit message for a commit ref
    }[];
    hasMore: boolean; // true if there are more refs available than maxCount
};

/** returns up to `maxCount` branches. */
export async function getBranchList(
    git: SimpleGit,
    maxCount: number = 10
): Promise<RefList> {
    const branches = await git.branch(['--all', '--sort=-committerdate']);
    const refs = branches.all.slice(0, maxCount).map((branch) => ({
        ref: branch,
        description:
            (branches.current === branch ? '(current) ' : '') +
            branches.branches[branch].commit.substring(0, 7),
    }));
    return {
        refs,
        hasMore: branches.all.length > maxCount,
    };
}

/** returns up to `maxCount` tags. */
export async function getTagList(
    git: SimpleGit,
    maxCount: number = 10
): Promise<RefList> {
    const tags = await git.tags(['--sort=-creatordate']);
    const refs = tags.all.slice(0, maxCount).map((tag) => ({
        ref: tag,
    }));
    return {
        refs,
        hasMore: tags.all.length > maxCount,
    };
}

/** returns up to `maxCount` commit refs.
 *
 * If `beforeRef` is provided, only commits before that ref are shown.
 */
export async function getCommitList(
    git: SimpleGit,
    beforeRef?: string,
    maxCount: number = 10
): Promise<RefList> {
    const fromRef = beforeRef ? await git.firstCommit() : undefined;
    const toRef = beforeRef ? `${beforeRef}^` : undefined;
    const commits = await git.log({
        maxCount: maxCount + 1,
        from: fromRef,
        to: toRef,
    });

    const refs = commits.all.slice(0, maxCount).map((commit) => ({
        ref: commit.hash,
        description: commit.message,
    }));

    return {
        refs,
        hasMore: commits.all.length > maxCount,
    };
}
