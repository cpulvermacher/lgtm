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
