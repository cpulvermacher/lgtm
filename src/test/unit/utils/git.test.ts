import simpleGit, {
    BranchSummary,
    LogResult,
    SimpleGit,
    TagResult,
    type BranchSummaryBranch,
    type DiffResult,
    type StatusResult,
} from 'simple-git';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UncommittedRef } from '@/types/Ref';
import type { ReviewScope } from '@/types/ReviewRequest';
import { createGit, GIT_EMPTY_TREE_HASH, type Git } from '@/utils/git';

const completeDiff = `diff --git a/index.html b/index.html
index 44cbb3f..887431b 100644
--- a/index.html
+++ b/index.html
@@ -1,6 +1,7 @@
 <html>
 <head>
     <title>Home</title>
+    <scirpt src="index.js"></scirpt>
 </head>
 <body>
 
@@ -26,7 +27,7 @@
 
 
     <script>
-        window['settings'] = {}
+        window['settings'] = eval("(" + new URLSearchParams(window.location.search).get('settings') + ")");
     </script>
 </body>
 </html>
\\ No newline at end of file
`;

describe('git', () => {
    vi.mock('simple-git', () => ({
        default: vi.fn(),
    }));

    const mockSimpleGit = {
        revparse: vi.fn(),
        cwd: vi.fn(),
        log: vi.fn(),
        diff: vi.fn(),
        diffSummary: vi.fn(),
        branch: vi.fn(),
        tags: vi.fn(),
        firstCommit: vi.fn(),
        status: vi.fn(),
        raw: vi.fn(),
    } as unknown as SimpleGit;

    const scope: ReviewScope = {
        target: 'target',
        base: 'base',
        isTargetCheckedOut: true,
        isCommitted: true,
        revisionRangeDiff: 'rev...rev',
        revisionRangeLog: 'rev..rev',
        changeDescription: 'message\nmessage2',
    };

    let git: Git;
    beforeEach(async () => {
        vi.mocked(simpleGit).mockReturnValue(mockSimpleGit);

        vi.mocked(mockSimpleGit.revparse).mockResolvedValueOnce('/git/root');
        git = await createGit('/git/root/workspace');

        expect(mockSimpleGit.revparse).toHaveBeenCalledWith([
            '--show-toplevel',
        ]);
        expect(mockSimpleGit.cwd).toHaveBeenCalledWith('/git/root');
    });

    it('getGitRoot', () => {
        expect(mockSimpleGit.revparse).toHaveBeenCalledWith([
            '--show-toplevel',
        ]);
        expect(git.getGitRoot()).toBe('/git/root');
    });

    describe('getChangedFiles', () => {
        it('committed', async () => {
            vi.mocked(mockSimpleGit.diffSummary).mockResolvedValue({
                files: [
                    { file: 'file1', status: 'M', from: 'othername' },
                    { file: 'file2' },
                ],
            } as unknown as DiffResult);

            const result = await git.getChangedFiles(scope);

            expect(mockSimpleGit.diffSummary).toHaveBeenCalledWith([
                '--name-status',
                '--end-of-options',
                'rev...rev',
            ]);
            expect(result).toEqual([
                { file: 'file1', status: 'M', from: 'othername' },
                { file: 'file2', status: 'X', from: undefined },
            ]);
        });

        it('staged changes', async () => {
            vi.mocked(mockSimpleGit.diffSummary).mockResolvedValue({
                files: [],
            } as unknown as DiffResult);

            const stagedScope = await git.getReviewScope(UncommittedRef.Staged);
            const result = await git.getChangedFiles(stagedScope);

            expect(mockSimpleGit.diffSummary).toHaveBeenCalledWith([
                '--name-status',
                '--staged',
            ]);
            expect(result).toEqual([]);
        });

        it('unstaged changes', async () => {
            vi.mocked(mockSimpleGit.diffSummary).mockResolvedValue({
                files: [],
            } as unknown as DiffResult);

            const unstagedScope = await git.getReviewScope(
                UncommittedRef.Unstaged
            );
            const result = await git.getChangedFiles(unstagedScope);

            expect(mockSimpleGit.diffSummary).toHaveBeenCalledWith([
                '--name-status',
            ]);
            expect(result).toEqual([]);
        });
    });

    describe('getFileDiff', () => {
        const file = {
            file: 'file',
            status: '?',
        };
        const fileWithPreviousName = {
            file: 'file',
            status: 'M',
            from: 'othername',
        };

        it('returns diff with line numbers', async () => {
            vi.mocked(mockSimpleGit.diff).mockResolvedValue('diff');

            const result = await git.getFileDiff(scope, file);

            expect(mockSimpleGit.diff).toHaveBeenCalledWith([
                '--no-prefix',
                '-U3',
                '--end-of-options',
                'rev...rev',
                '--',
                'file',
            ]);
            expect(result).toBe('0\tdiff');
        });

        it('passes both file and previous name to diff call', async () => {
            vi.mocked(mockSimpleGit.diff).mockResolvedValue(
                'diff --git a/main.html b/index.html\n\
similarity index 76%\n\
rename from main.html\n\
rename to index.html'
            );

            const result = await git.getFileDiff(scope, fileWithPreviousName);

            expect(mockSimpleGit.diff).toHaveBeenCalledWith([
                '--no-prefix',
                '-U3',
                '--end-of-options',
                'rev...rev',
                '--',
                'othername',
                'file',
            ]);
            expect(result).toMatchInlineSnapshot(
                `
              "0	diff --git a/main.html b/index.html
              0	similarity index 76%
              0	rename from main.html
              0	rename to index.html"
            `
            );
        });

        it('passes contextLines to diff call', async () => {
            vi.mocked(mockSimpleGit.diff).mockResolvedValue('diff');

            await git.getFileDiff(scope, file, 99);

            expect(mockSimpleGit.diff).toHaveBeenCalledWith([
                '--no-prefix',
                '-U99',
                '--end-of-options',
                'rev...rev',
                '--',
                'file',
            ]);
        });

        it('filters "no newline at end of file" message', async () => {
            vi.mocked(mockSimpleGit.diff).mockResolvedValue(
                'diff\n\\ No newline at end of file'
            );

            const result = await git.getFileDiff(scope, file);

            expect(result).toBe('0\tdiff');
        });

        it('adds line numbers for a complete diff', async () => {
            vi.mocked(mockSimpleGit.diff).mockResolvedValue(completeDiff);

            const result = await git.getFileDiff(scope, file);

            expect(result).toMatchInlineSnapshot(`
              "0	diff --git a/index.html b/index.html
              0	index 44cbb3f..887431b 100644
              0	--- a/index.html
              0	+++ b/index.html
              0	@@ -1,6 +1,7 @@
              1	 <html>
              2	 <head>
              3	     <title>Home</title>
              4	+    <scirpt src="index.js"></scirpt>
              5	 </head>
              6	 <body>
              7	 
              0	@@ -26,7 +27,7 @@
              27	 
              28	 
              29	     <script>
              0	-        window['settings'] = {}
              30	+        window['settings'] = eval("(" + new URLSearchParams(window.location.search).get('settings') + ")");
              31	     </script>
              32	 </body>
              33	 </html>
              34	"
            `);
        });
    });

    it('isValidRefPair', () => {
        expect(git.isValidRefPair(undefined)).toBe(false);
        expect(git.isValidRefPair({})).toBe(false);
        expect(git.isValidRefPair({ target: 'ref' })).toBe(false);
        expect(git.isValidRefPair({ target: 'ref', base: 'ref' })).toBe(true);
        expect(git.isValidRefPair({ target: UncommittedRef.Staged })).toBe(
            true
        );
        expect(git.isValidRefPair({ target: UncommittedRef.Unstaged })).toBe(
            true
        );
        expect(
            git.isValidRefPair({ target: 'ref', base: UncommittedRef.Staged })
        ).toBe(false);
    });

    describe('isInitialCommit', () => {
        it('returns true for initial commit', async () => {
            vi.mocked(mockSimpleGit.revparse).mockResolvedValue('root1');
            vi.mocked(mockSimpleGit.raw).mockResolvedValue('root1');

            const result = await git.isInitialCommit('anything');

            expect(result).toBe(true);
        });

        it('returns false for non-initial commit', async () => {
            vi.mocked(mockSimpleGit.revparse).mockResolvedValue('commit1');
            vi.mocked(mockSimpleGit.raw).mockResolvedValue('root1\nroot2');

            const result = await git.isInitialCommit('anything');

            expect(result).toBe(false);
        });

        it('returns false for non-string ref', async () => {
            const result = await git.isInitialCommit(undefined);

            expect(result).toBe(false);
        });
    });

    describe('getReviewScope', () => {
        beforeEach(() => {
            vi.mocked(mockSimpleGit.revparse).mockResolvedValue('rev');
            vi.mocked(mockSimpleGit.log).mockResolvedValue({
                all: [{ message: 'message' }, { message: 'message2' }],
            } as unknown as LogResult);
        });

        it('for commit', async () => {
            vi.mocked(mockSimpleGit.raw).mockResolvedValueOnce('first\nfirst2');

            const result = await git.getReviewScope('rev');

            expect(result).toEqual({
                target: 'rev',
                base: 'rev^',
                isTargetCheckedOut: true,
                isCommitted: true,
                revisionRangeDiff: 'rev^...rev',
                revisionRangeLog: 'rev^..rev',
                changeDescription: 'message\nmessage2',
            });
        });

        it('for branch', async () => {
            const result = await git.getReviewScope('target', 'base');

            expect(result).toEqual({
                target: 'target',
                base: 'base',
                isTargetCheckedOut: true,
                isCommitted: true,
                revisionRangeDiff: 'base...target',
                revisionRangeLog: 'base..target',
                changeDescription: 'message\nmessage2',
            });
        });

        it('for staged changes', async () => {
            const result = await git.getReviewScope(UncommittedRef.Staged);

            expect(result).toEqual({
                target: UncommittedRef.Staged,
                isTargetCheckedOut: true,
                isCommitted: false,
            });
        });

        it('for unstaged changes', async () => {
            const result = await git.getReviewScope(UncommittedRef.Unstaged);

            expect(result).toEqual({
                target: UncommittedRef.Unstaged,
                isTargetCheckedOut: true,
                isCommitted: false,
            });
        });

        it('for initial commit', async () => {
            // call for targetRef^ - should fail to indicate initial commit
            vi.mocked(mockSimpleGit.revparse)
                .mockResolvedValueOnce('first') //isInitialCommit
                .mockResolvedValueOnce('rev');
            vi.mocked(mockSimpleGit.raw).mockResolvedValueOnce('first');

            const result = await git.getReviewScope('rev');

            expect(result).toEqual({
                target: 'rev',
                base: GIT_EMPTY_TREE_HASH,
                isTargetCheckedOut: true,
                isCommitted: true,
                revisionRangeDiff: `${GIT_EMPTY_TREE_HASH}..rev`,
                revisionRangeLog: `${GIT_EMPTY_TREE_HASH}..rev`,
                changeDescription: 'message\nmessage2',
            });
        });

        it('for initial commit with HEAD check failure', async () => {
            vi.mocked(mockSimpleGit.revparse)
                .mockResolvedValueOnce('first') //isInitialCommit
                .mockResolvedValueOnce('rev') //getCommitRange
                .mockResolvedValueOnce('rev') //getCommitRange
                .mockResolvedValueOnce('HEAD') //isSameRef
                .mockResolvedValueOnce('rev');
            vi.mocked(mockSimpleGit.raw).mockResolvedValueOnce('first');

            const result = await git.getReviewScope('rev');

            expect(result).toEqual({
                target: 'rev',
                base: GIT_EMPTY_TREE_HASH,
                isTargetCheckedOut: false,
                isCommitted: true,
                revisionRangeDiff: `${GIT_EMPTY_TREE_HASH}..rev`,
                revisionRangeLog: `${GIT_EMPTY_TREE_HASH}..rev`,
                changeDescription: 'message\nmessage2',
            });
        });
    });

    describe('addLineNumbers', () => {
        it('adds line numbers from hunk header', () => {
            const diff = '@@ -1,2 +42,2 @@\nline1\nline2';
            const result = git.addLineNumbers(diff);

            expect(result).toBe('0\t@@ -1,2 +42,2 @@\n42\tline1\n43\tline2');
        });

        it('adds line numbers for single-line hunks (to file)', () => {
            const diff = '@@ -0,0 +1 @@\n+test';
            const result = git.addLineNumbers(diff);

            expect(result).toBe('0\t@@ -0,0 +1 @@\n1\t+test');
        });
        it('adds line numbers for single-line hunks (from file)', () => {
            const diff = '@@ -1 +1,1 @@\n+test';
            const result = git.addLineNumbers(diff);

            expect(result).toBe('0\t@@ -1 +1,1 @@\n1\t+test');
        });

        it('handles hunk headers with context', () => {
            const diff = '@@ -1,2 +3,2 @@ func main() {\nline1';
            const result = git.addLineNumbers(diff);

            expect(result).toBe('0\t@@ -1,2 +3,2 @@ func main() {\n3\tline1');
        });

        it('prints 0 until first hunk header', () => {
            const diff = 'line1\nline2\n@@ -1,2 +1,2 @@\nline3';
            const result = git.addLineNumbers(diff);

            expect(result).toBe(
                '0\tline1\n0\tline2\n0\t@@ -1,2 +1,2 @@\n1\tline3'
            );
        });

        it('prints 0 for removed lines', () => {
            const diff = '@@ -1,2 +1,2 @@\nline1\n-removed\n+added';
            const result = git.addLineNumbers(diff);

            expect(result).toBe(
                '0\t@@ -1,2 +1,2 @@\n1\tline1\n0\t-removed\n2\t+added'
            );
        });

        it('adjusts line numbers after each hunk header', () => {
            const diff = `@@ -1,2 +1,2 @@
line1
line2
@@ -1,2 +1,2 @@
line3`;
            const result = git.addLineNumbers(diff);

            expect(result).toBe(
                `0	@@ -1,2 +1,2 @@
1	line1
2	line2
0	@@ -1,2 +1,2 @@
1	line3`
            );
        });

        it('throws on invalid hunk header', () => {
            const diff = '@@ -1,2 +,2 @@\nline1\nline2';
            expect(() => git.addLineNumbers(diff)).toThrow();
        });

        it('handles hunk-header not on start of line as normal text', () => {
            const hunkHeader1 = '@@ -1,2 +2,30 @@';
            const hunkHeader2 = '@@ -100,2 +410,20 @@';
            const diff = `${hunkHeader1}\nline1\n ${hunkHeader2}`;
            const result = git.addLineNumbers(diff);

            expect(result).toBe(
                `0\t${hunkHeader1}\n2\tline1\n3\t ${hunkHeader2}`
            );
        });
    });

    describe('getCommitRef', () => {
        it('returns commit ref', async () => {
            vi.mocked(mockSimpleGit.revparse).mockResolvedValue('rev');

            const ref = await git.getCommitRef('hash');

            expect(ref).toBe('rev');
        });

        it('throws on invalid ref', async () => {
            vi.mocked(mockSimpleGit.revparse).mockRejectedValue(
                new Error('Invalid ref')
            );
            await expect(git.getCommitRef('invalid')).rejects.toThrow(
                `Invalid ref "invalid". Please provide a valid commit, branch, tag, or HEAD.`
            );
        });
    });

    describe('isBranch', () => {
        beforeEach(() => {
            vi.mocked(mockSimpleGit.branch).mockResolvedValue({
                all: ['branch1', 'branch2'],
            } as BranchSummary);
        });

        it('returns true for branch', async () => {
            expect(await git.isBranch('branch1')).toBe(true);

            expect(mockSimpleGit.branch).toHaveBeenCalledWith(['--all']);
        });

        it('returns false for non-branch', async () => {
            expect(await git.isBranch('tag1')).toBe(false);
        });
    });

    describe('getBranchList', () => {
        it('returns list of branches', async () => {
            vi.mocked(mockSimpleGit.branch).mockResolvedValue({
                all: ['branch1', 'branch2'],
                branches: {
                    branch1: {
                        current: false,
                        commit: 'abc1',
                    },
                    branch2: {
                        current: false,
                        commit: 'abc2',
                    },
                },
            } as unknown as BranchSummary);

            const result = await git.getBranchList(undefined, 2);

            expect(mockSimpleGit.branch).toHaveBeenCalledWith([
                '--all',
                '--sort=-committerdate',
            ]);

            expect(result).toHaveLength(2);
            expect(result).toEqual([
                {
                    ref: 'branch1',
                    description: 'abc1',
                },
                {
                    ref: 'branch2',
                    description: 'abc2',
                },
            ]);
        });

        it('merges branches with same ref', async () => {
            vi.mocked(mockSimpleGit.branch).mockResolvedValue({
                all: ['branch1', 'remotes/something/branch1', 'branch2'],
                branches: {
                    branch1: {
                        commit: 'abc1',
                    },
                    branch2: {
                        commit: 'abc2',
                    },
                    'remotes/something/branch1': {
                        commit: 'abc1',
                    },
                },
            } as unknown as BranchSummary);

            const result = await git.getBranchList(undefined, 2);

            expect(mockSimpleGit.branch).toHaveBeenCalledWith([
                '--all',
                '--sort=-committerdate',
            ]);

            expect(result).toHaveLength(2);
            expect(result).toEqual([
                {
                    ref: 'branch1',
                    description: 'abc1',
                    extra: '       Same as: remotes/something/branch1',
                },
                {
                    ref: 'branch2',
                    description: 'abc2',
                },
            ]);
        });

        it('handles empty list', async () => {
            vi.mocked(mockSimpleGit.branch).mockResolvedValue({
                all: [],
                branches: {},
            } as unknown as BranchSummary);

            const result = await git.getBranchList(undefined, 2);

            expect(result.length).toBe(0);
        });

        it('limits results to maxCount', async () => {
            vi.mocked(mockSimpleGit.branch).mockResolvedValue({
                all: ['branch1', 'branch2'],
                branches: {
                    branch1: {
                        current: false,
                        commit: 'abc1',
                    },
                    branch2: {
                        current: false,
                        commit: 'abc2',
                    },
                },
            } as unknown as BranchSummary);

            const result = await git.getBranchList(undefined, 1);

            expect(result.map((ref) => ref.ref)).toEqual(['branch1']);
            expect(result.map((ref) => ref.description)).toEqual(['abc1']);
        });

        it('puts current branch first with beforeRef=undefined', async () => {
            vi.mocked(mockSimpleGit.branch).mockResolvedValue({
                all: ['branch1', 'branch2'],
                branches: {
                    branch1: {
                        current: false,
                        commit: 'abc1',
                    },
                    branch2: {
                        current: true,
                        commit: 'abc2',
                    },
                },
                current: 'branch2',
            } as unknown as BranchSummary);

            const result = await git.getBranchList(undefined, 2);

            expect(result.map((ref) => ref.ref)).toEqual([
                'branch2',
                'branch1',
            ]);
            expect(result.map((ref) => ref.description)).toEqual([
                '(current) abc2',
                'abc1',
            ]);
        });

        it('does not put current branch first with beforeRef set', async () => {
            vi.mocked(mockSimpleGit.branch).mockResolvedValue({
                all: ['branch1', 'branch2'],
                branches: {
                    branch1: {
                        current: false,
                        commit: 'abc1',
                    },
                    branch2: {
                        current: true,
                        commit: 'abc2',
                    },
                },
                current: 'branch2',
            } as unknown as BranchSummary);

            const result = await git.getBranchList('some-other-ref', 2);

            expect(mockSimpleGit.branch).toHaveBeenCalledWith([
                '--all',
                '--sort=-committerdate',
                '--no-contains=some-other-ref',
            ]);
            expect(result.map((ref) => ref.ref)).toEqual([
                'branch1',
                'branch2',
            ]);
            expect(result.map((ref) => ref.description)).toEqual([
                'abc1',
                '(current) abc2',
            ]);
        });

        it('puts common base branches first when beforeRef set', async () => {
            const branches = [
                'trunk',
                'master',
                'main',
                'develop',
                'other',
                'remotes/origin/myfeature',
                'remotes/origin/other',
                'remotes/mirror/myfeature',
            ];
            const branchSummaries: Record<string, BranchSummaryBranch> = {};
            branches.forEach((branch) => {
                branchSummaries[branch] = {
                    current: false,
                    commit: branch,
                } as BranchSummaryBranch;
            });

            vi.mocked(mockSimpleGit.branch).mockResolvedValue({
                all: branches,
                branches: branchSummaries,
            } as BranchSummary);

            const result = await git.getBranchList('myfeature', 7);

            const expectedBranches = [
                'remotes/origin/myfeature',
                'remotes/mirror/myfeature',
                'develop',
                'main',
                'master',
                'trunk',
                'other',
            ];
            expect(result.map((ref) => ref.ref)).toEqual(expectedBranches);
            expect(result.map((ref) => ref.description)).toEqual(
                expectedBranches.map((branch) => branch.substring(0, 7))
            );
        });
    });

    describe('getTagList', () => {
        it('returns list of tags', async () => {
            vi.mocked(mockSimpleGit.tags).mockResolvedValue({
                all: ['tag1', 'tag2'],
            } as TagResult);

            const result = await git.getTagList(undefined, 2);

            expect(mockSimpleGit.tags).toHaveBeenCalledWith([
                '--sort=-creatordate',
            ]);
            expect(result.map((ref) => ref.ref)).toEqual(['tag1', 'tag2']);
            expect(result.map((ref) => ref.description)).toEqual([
                undefined,
                undefined,
            ]);
        });

        it('returns list of tags before beforeRef', async () => {
            vi.mocked(mockSimpleGit.tags).mockResolvedValue({
                all: ['tag1', 'tag2'],
            } as TagResult);

            const result = await git.getTagList('beforeRef', 2);

            expect(mockSimpleGit.tags).toHaveBeenCalledWith([
                '--sort=-creatordate',
                '--no-contains=beforeRef',
            ]);
            expect(result.map((ref) => ref.ref)).toEqual(['tag1', 'tag2']);
            expect(result.map((ref) => ref.description)).toEqual([
                undefined,
                undefined,
            ]);
        });

        it('limits results to maxCount', async () => {
            vi.mocked(mockSimpleGit.tags).mockResolvedValue({
                all: ['tag1', 'tag2'],
            } as TagResult);

            const result = await git.getTagList(undefined, 1);

            expect(result.map((ref) => ref.ref)).toEqual(['tag1']);
            expect(result.map((ref) => ref.description)).toEqual([undefined]);
        });

        it('handles empty list', async () => {
            vi.mocked(mockSimpleGit.tags).mockResolvedValue({
                all: [],
            } as unknown as TagResult);

            const result = await git.getTagList(undefined, 2);

            expect(result.length).toBe(0);
        });
    });

    describe('getCommitList', () => {
        it('returns list of commits', async () => {
            vi.mocked(mockSimpleGit.log).mockResolvedValue({
                all: [{ hash: 'hash1' }, { hash: 'hash2' }],
            } as unknown as LogResult);

            const result = await git.getCommitList(undefined, 2);

            expect(mockSimpleGit.log).toHaveBeenCalledWith(['--max-count=2']);
            expect(result.map((ref) => ref.ref)).toEqual(['hash1', 'hash2']);
        });

        it('limits results to maxCount', async () => {
            vi.mocked(mockSimpleGit.log).mockResolvedValue({
                all: [{ hash: 'hash1' }, { hash: 'hash2' }],
            } as unknown as LogResult);

            const result = await git.getCommitList(undefined, 1);

            expect(result.map((ref) => ref.ref)).toEqual(['hash1']);
        });

        it('handles empty list', async () => {
            vi.mocked(mockSimpleGit.log).mockResolvedValue({
                all: [],
            } as unknown as LogResult);

            const result = await git.getCommitList(undefined, 2);

            expect(result.length).toBe(0);
        });

        it('returns commits before beforeRef', async () => {
            vi.mocked(mockSimpleGit.log).mockResolvedValue({
                all: [{ hash: 'hash1' }, { hash: 'hash2' }],
            } as unknown as LogResult);

            const result = await git.getCommitList('beforeRef', 2);

            expect(mockSimpleGit.log).toHaveBeenCalledWith([
                '--max-count=2',
                'beforeRef^',
            ]);
            expect(result.map((ref) => ref.ref)).toEqual(['hash1', 'hash2']);
        });
    });

    describe('getUncommittedChanges', () => {
        it('returns nothing if clean', async () => {
            vi.mocked(mockSimpleGit.status).mockResolvedValue({
                files: [],
                staged: [],
            } as unknown as StatusResult);

            const result = await git.getUncommittedChanges();

            expect(result).toEqual([]);
        });

        it('returns staged changes', async () => {
            vi.mocked(mockSimpleGit.status).mockResolvedValue({
                files: [],
                staged: [{}, {}],
            } as unknown as StatusResult);

            const result = await git.getUncommittedChanges();

            expect(result).toEqual([
                {
                    ref: UncommittedRef.Staged,
                    description: 'Staged changes in 2 files',
                },
            ]);
        });

        it('returns unstaged changes', async () => {
            vi.mocked(mockSimpleGit.status).mockResolvedValue({
                files: [{}, {}],
                staged: [],
            } as unknown as StatusResult);

            const result = await git.getUncommittedChanges();

            expect(result).toEqual([
                {
                    ref: UncommittedRef.Unstaged,
                    description: 'Unstaged changes in 2 files',
                },
            ]);
        });
    });
});
