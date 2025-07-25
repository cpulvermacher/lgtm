import simpleGit, { SimpleGit } from 'simple-git';

import { UncommittedRef, type Ref } from '@/types/Ref';
import { ReviewScope } from '@/types/ReviewRequest';

/** same as git's default length for short commit hashes */
export const shortHashLength = 7;

/** Git's empty tree object hash, useful when comparing against the initial commit. */
export const GIT_EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export type DiffFile = {
    file: string;
    from?: string; //previous file name (if renamed)
    status: string; // see --diff-filter in git-diff(1). Interesting for us: D (deleted), R (renamed)
};

/** Create a new Git instance */
export async function createGit(workspaceRoot: string): Promise<Git> {
    const git = simpleGit(workspaceRoot);
    const gitRoot = await git.revparse(['--show-toplevel']);

    await git.cwd(gitRoot); // make gitRoot the base for all git commands
    return new Git(git, gitRoot);
}

/** Handles all git-related operations in the current repository */
export class Git {
    /** Should not be called directly, use createGit() instead. */
    constructor(
        private git: SimpleGit,
        private gitRoot: string
    ) {}

    /** Absolute path to git repository root */
    getGitRoot(): string {
        return this.gitRoot;
    }

    /** Get list of files in the commit */
    async getChangedFiles(scope: ReviewScope): Promise<DiffFile[]> {
        const diffArgs = this.getDiffArgs(scope);
        const summary = await this.git.diffSummary([
            '--name-status',
            ...diffArgs,
        ]);
        return summary.files.map((file) => {
            if ('status' in file) {
                return {
                    file: file.file,
                    status: file.status || 'X',
                    from: file.from,
                };
            }
            return {
                file: file.file,
                status: 'X', // unknown
            };
        });
    }

    /** get argument to git diff for given scope */
    private getDiffArgs(scope: ReviewScope) {
        if (scope.isCommitted) {
            return ['--end-of-options', scope.revisionRangeDiff];
        } else if (scope.target === UncommittedRef.Staged) {
            return ['--staged'];
        } else if (scope.target === UncommittedRef.Unstaged) {
            return [];
        }
        throw new Error(`Invalid review scope: ${JSON.stringify(scope)}`);
    }

    /** get diff of the given file*/
    async getFileDiff(
        scope: ReviewScope,
        file: DiffFile,
        contextLines: number = 3
    ): Promise<string> {
        // add all relevant file paths to the diff command to ensure renames are not handled as add+delete
        const fileArgs = [file.file];
        if (file.from) {
            fileArgs.unshift(file.from);
        }

        const diffArgs = this.getDiffArgs(scope);
        const rawDiff = await this.git.diff([
            '--no-prefix',
            `-U${contextLines}`,
            ...diffArgs,
            '--',
            ...fileArgs,
        ]);

        const diff = rawDiff
            .split('\n')
            .filter((line) => line !== '\\ No newline at end of file')
            .join('\n');

        return this.addLineNumbers(diff);
    }

    /** prefix the following diff with the line numbers of the to-side (from hunk headers) */
    addLineNumbers(diff: string) {
        // format: `@@ -fromLine,fromCount +toLine,toCount @@ function name`, with count=1 being optional
        const lineRegExp = /^@@ -\d+(,\d+)? \+(\d+)(,\d+)? @@/;

        let lineNo = 0;
        return diff
            .split('\n')
            .map((line) => {
                if (line.startsWith('@@')) {
                    const match = lineRegExp.exec(line);
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

    /** returns true iff the given refs are valid for a review request */
    isValidRefPair(refs?: {
        target?: Ref;
        base?: Ref;
    }): refs is
        | { target: string; base: string }
        | { target: UncommittedRef; base: undefined } {
        if (!refs || !refs.target) {
            return false;
        }
        if (this.isUncommitted(refs.target)) {
            return true;
        }
        if (!refs.base || this.isUncommitted(refs.base)) {
            return false;
        }

        return true;
    }

    /**
     * Returns true if the given ref is one of the root commits.
     */
    async isInitialCommit(ref?: Ref): Promise<boolean> {
        if (typeof ref !== 'string') {
            return false;
        }

        const commitRef = await this.getCommitRef(ref);
        const rootCommits = await this.git.raw([
            'rev-list',
            '--max-parents=0',
            commitRef,
        ]);
        const hashes = rootCommits.trim().split(/\s+/);
        return hashes.includes(commitRef);
    }

    /**
     * Get review scope for the given refs (commits, branches, tags, ...).
     * If baseRef is undefined will use the parent commit, or for the initial commit
     * it will use the empty tree object as base.
     */
    async getReviewScope(
        targetRef: Ref,
        baseRef?: string
    ): Promise<ReviewScope> {
        if (this.isUncommitted(targetRef)) {
            return {
                target: targetRef,
                isCommitted: false,
                isTargetCheckedOut: true,
                changeDescription: undefined,
            };
        }

        if (!baseRef) {
            if (await this.isInitialCommit(targetRef)) {
                baseRef = GIT_EMPTY_TREE_HASH;
            } else {
                baseRef = `${targetRef}^`;
            }
        }
        const commitRange = await this.getCommitRange(baseRef, targetRef);
        if (baseRef === GIT_EMPTY_TREE_HASH) {
            // for initial commit, avoid using ... for diff
            commitRange.revisionRangeDiff = commitRange.revisionRangeLog;
        }

        const changeDescription = await this.getCommitMessages(
            commitRange.revisionRangeLog
        );

        const isTargetCheckedOut = await this.isSameRef('HEAD', targetRef);
        return {
            target: targetRef,
            base: baseRef,
            isCommitted: true,
            isTargetCheckedOut,
            revisionRangeDiff: commitRange.revisionRangeDiff,
            revisionRangeLog: commitRange.revisionRangeLog,
            changeDescription,
        };
    }

    /** Validates the given revisions and returns diff ranges to get changes between the latest common ancestor and the new revision */
    async getCommitRange(oldRef: string, newRef: string) {
        //verify that the given refs are valid
        await this.getCommitRef(oldRef);
        await this.getCommitRef(newRef);

        return {
            revisionRangeDiff: `${oldRef}...${newRef}`,
            revisionRangeLog: `${oldRef}..${newRef}`,
        };
    }

    /** return all commit messages in a newline-separated string*/
    async getCommitMessages(revisionRangeLog: string): Promise<string> {
        const logs = await this.git.log(['--end-of-options', revisionRangeLog]);
        return logs.all.map((log) => log.message).join('\n');
    }

    /** return true iff if the given refs refer to the same commit */
    async isSameRef(refA: string, refB: string) {
        return (
            (await this.getCommitRef(refA)) === (await this.getCommitRef(refB))
        );
    }

    /**
     * return the commit hash for the given commit, branch, tag, or HEAD.
     *
     * Tags are referenced to their commit hash.
     * Throws an error if the ref is not valid.
     */
    async getCommitRef(ref: string): Promise<string> {
        try {
            //^{} is needed to dereference tags (no effect on other types of refs)
            return await this.git.revparse([
                '--verify',
                '--end-of-options',
                ref + '^{}',
            ]);
        } catch {
            throw new Error(
                `Invalid ref "${ref}". Please provide a valid commit, branch, tag, or HEAD.`
            );
        }
    }

    /** returns true iff given ref refers to a branch */
    async isBranch(ref: string): Promise<boolean> {
        return (await this.git.branch(['--all'])).all.includes(ref);
    }

    /** returns true iff this ref doesn't require a 2nd ref to compare to */
    isUncommitted(ref: Ref): ref is UncommittedRef {
        return ref === UncommittedRef.Staged || ref === UncommittedRef.Unstaged;
    }

    /** returns up to `maxCount` branches. Branches are sorted by last commit date,
     * with current branch first. Branches with same ref are grouped together.
     *
     * If `beforeRef` is given, only returns branches that don't include that ref, and
     * prioritizes the suspected remote branch and common main branches in order.
     */
    async getBranchList(
        beforeRef: string | undefined,
        maxCount: number
    ): Promise<RefList> {
        const branchOptions = ['--all', '--sort=-committerdate'];
        if (beforeRef) {
            branchOptions.push(`--no-contains=${beforeRef}`);
        }
        const branches = await this.git.branch(branchOptions);

        const branchesByCommitRef: { [commit: string]: string[] } = {};
        const orderedUniqueRefs: string[] = [];
        branches.all.forEach((branch) => {
            const branchSummary = branches.branches[branch];
            if (branchSummary.commit in branchesByCommitRef) {
                branchesByCommitRef[branchSummary.commit].push(branch);
            } else {
                orderedUniqueRefs.push(branchSummary.commit);
                branchesByCommitRef[branchSummary.commit] = [branch];
            }
        });

        let firstBranch;
        if (!beforeRef) {
            //for target: put current branch first
            firstBranch = new RegExp(`^${branches.current}$`);
        } else {
            //for base: put remote for `beforeRef` and common main branches first
            firstBranch = new RegExp(`^remotes/.*/${beforeRef}$`);
        }

        // sort each branchesByCommitRef entry
        for (const commit in branchesByCommitRef) {
            branchesByCommitRef[commit].sort(
                (a, b) =>
                    getBranchPriority(a, firstBranch) -
                    getBranchPriority(b, firstBranch)
            );
        }
        // sort the orderedUniqueRefs
        orderedUniqueRefs.sort(
            (a, b) =>
                getBranchPriority(branchesByCommitRef[a][0], firstBranch) -
                getBranchPriority(branchesByCommitRef[b][0], firstBranch)
        );

        const refs = orderedUniqueRefs.map((commit) => {
            const [ref, ...otherBranches] = branchesByCommitRef[commit];
            const isCurrent = branches.branches[ref].current;

            let description = '';
            if (isCurrent) {
                description += '(current) ';
            }
            description += commit.substring(0, shortHashLength);

            const extra = formatExtraBranches(otherBranches);

            return { ref, description, extra };
        });

        return refs.slice(0, maxCount);
    }

    /** returns up to `maxCount` tags.
     *
     * If `beforeRef` is given, only returns tags that don't include that ref.
     */
    async getTagList(
        beforeRef: string | undefined,
        maxCount: number
    ): Promise<RefList> {
        const tagOptions = ['--sort=-creatordate'];
        if (beforeRef) {
            tagOptions.push(`--no-contains=${beforeRef}`);
        }
        const tags = await this.git.tags(tagOptions);
        return tags.all.slice(0, maxCount).map((tag) => ({
            ref: tag,
        }));
    }

    /** returns up to `maxCount` commit refs.
     *
     * If `beforeRef` is given, only returns commits before that ref.
     */
    async getCommitList(
        beforeRef: string | undefined,
        maxCount: number
    ): Promise<RefList> {
        const logOptions = [`--max-count=${maxCount}`];
        if (beforeRef) {
            logOptions.push(`${beforeRef}^`);
        }
        const commits = await this.git.log(logOptions);

        return commits.all.slice(0, maxCount).map((commit) => ({
            ref: commit.hash,
            description: commit.message,
        }));
    }

    /** return pseudo-refs for staged/unstaged changes if any */
    async getUncommittedChanges(): Promise<RefList> {
        const status = await this.git.status();
        // get unstaged changes
        const unstaged = status.files.filter(
            (file) => file.working_dir !== ' ' && file.working_dir !== '?'
        );

        const refs: RefList = [];
        if (status.staged.length > 0) {
            refs.push({
                ref: UncommittedRef.Staged,
                description: `Staged changes in ${status.staged.length} files`,
            });
        }
        if (unstaged.length > 0) {
            refs.push({
                ref: UncommittedRef.Unstaged,
                description: `Unstaged changes in ${unstaged.length} files`,
            });
        }
        return refs;
    }
}

export type RefList = {
    ref: Ref; // commit ref, SpecialRef.Staged or SpecialRef.Unstaged
    description?: string; // e.g. commit message for a commit ref
    extra?: string; // e.g. additional branch names pointing to the same commit
}[];

function formatExtraBranches(otherBranches: string[]) {
    if (otherBranches.length === 0) {
        return undefined;
    }
    return '       Same as: ' + otherBranches.join(', ');
}

/** returns a numerical value for the branch priority to be used with sort().
 * Priority is as follows:
 * -5: branch that matches the regex `first`, if provided
 * -4..-1: develop, main, master, trunk
 * 0 otherwise
 */
function getBranchPriority(ref: string, first?: RegExp) {
    if (first && first.test(ref)) {
        return -5;
    }
    const index = ['develop', 'main', 'master', 'trunk'].indexOf(ref);
    return index >= 0 ? -4 + index : 0;
}
