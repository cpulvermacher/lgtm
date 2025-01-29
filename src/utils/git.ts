import simpleGit, { SimpleGit } from 'simple-git';

import { ReviewScope } from '../types/ReviewRequest';

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
    async getChangedFiles(diffRevisionRange: string): Promise<string[]> {
        const fileString = await this.git.diff([
            '--name-only',
            diffRevisionRange,
        ]);
        return fileString.split('\n').filter((f) => f.length > 0);
    }

    /** get diff of the given file between the two revisions */
    async getFileDiff(
        diffRevisionRange: string,
        file: string,
        contextLines: number = 3
    ): Promise<string> {
        let diff = await this.git.diff([
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

    /** get review scope for the given refs (commits, branches, tags, ...). If baseRef is undefined will use the parent commit. */
    async getReviewScope(
        targetRef: string,
        baseRef?: string
    ): Promise<ReviewScope> {
        if (!baseRef) {
            baseRef = `${targetRef}^`;
        }

        const { revisionRangeDiff, revisionRangeLog } =
            await this.getCommitRange(baseRef, targetRef);
        const changeDescription =
            await this.getCommitMessages(revisionRangeLog);

        const isTargetCheckedOut = await this.isSameRef('HEAD', targetRef);
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
        const logs = await this.git.log([revisionRangeLog]);
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
        //^{} is needed to dereference tags (no effect on other types of refs)
        return this.git.revparse(['--verify', '--end-of-options', ref + '^{}']);
    }

    /** returns true iff given ref refers to a branch */
    async isBranch(ref: string): Promise<boolean> {
        return (await this.git.branch(['--all'])).all.includes(ref);
    }

    /** returns up to `maxCount` branches.
     *
     * If `beforeRef` is given, only returns branches that don't include that ref.
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
        const refs = branches.all.map((branch) => {
            const branchSummary = branches.branches[branch];
            return {
                ref: branch,
                description:
                    (branchSummary.current ? '(current) ' : '') +
                    branchSummary.commit.substring(0, 7),
            };
        });

        if (!beforeRef) {
            //for target: current branch is not necessarily the newest, let's put it first
            refs.sort((a) => (branches.branches[a.ref].current ? -1 : 0));
        } else {
            //for base: put remote for `beforeRef` and common main branches first
            const getPriority = (ref: string) => {
                if (
                    ref.startsWith('remotes/') &&
                    ref.endsWith('/' + beforeRef)
                ) {
                    return -5;
                }
                const index = ['develop', 'main', 'master', 'trunk'].indexOf(
                    ref
                );
                return index >= 0 ? -4 + index : 0;
            };
            refs.sort((a, b) => getPriority(a.ref) - getPriority(b.ref));
        }

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
}

export type RefList = {
    ref: string;
    description?: string; // e.g. commit message for a commit ref
}[];
