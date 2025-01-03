import { BranchSummary, LogResult, SimpleGit, TagResult } from 'simple-git';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    addLineNumbers,
    getBranchList,
    getChangedFiles,
    getCommitList,
    getFileDiff,
    getReviewScope,
    getTagList,
} from '../../../utils/git';

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

const mockGit = {
    revparse: vi.fn(),
    log: vi.fn(),
    diff: vi.fn(),
} as unknown as SimpleGit;

it('getChangedFiles', async () => {
    vi.mocked(mockGit.diff).mockResolvedValue('\nfile1\nfile2');

    const result = await getChangedFiles(mockGit, 'rev...rev');

    expect(mockGit.diff).toHaveBeenCalledWith(['--name-only', 'rev...rev']);
    expect(result).toEqual(['file1', 'file2']);
});

describe('getFileDiff', () => {
    it('returns diff with line numbers', async () => {
        vi.mocked(mockGit.diff).mockResolvedValue('diff');

        const result = await getFileDiff(mockGit, 'rev...rev', 'file');

        expect(mockGit.diff).toHaveBeenCalledWith([
            '--no-prefix',
            '-U3',
            'rev...rev',
            '--',
            'file',
        ]);
        expect(result).toBe('0\tdiff');
    });

    it('passes contextLines to diff call', async () => {
        vi.mocked(mockGit.diff).mockResolvedValue('diff');

        await getFileDiff(mockGit, 'rev...rev', 'file', 99);

        expect(mockGit.diff).toHaveBeenCalledWith([
            '--no-prefix',
            '-U99',
            'rev...rev',
            '--',
            'file',
        ]);
    });

    it('filters "no newline at end of file" message', async () => {
        vi.mocked(mockGit.diff).mockResolvedValue(
            'diff\n\\ No newline at end of file'
        );

        const result = await getFileDiff(mockGit, 'rev...rev', 'file');

        expect(result).toBe('0\tdiff');
    });

    it('adds line numbers for a complete diff', async () => {
        vi.mocked(mockGit.diff).mockResolvedValue(completeDiff);

        const result = await getFileDiff(mockGit, 'rev...rev', 'file');

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

describe('getReviewScope', () => {
    beforeEach(() => {
        vi.mocked(mockGit.revparse).mockResolvedValue('rev');
        vi.mocked(mockGit.log).mockResolvedValue({
            all: [{ message: 'message' }, { message: 'message2' }],
        } as unknown as LogResult);
    });

    it('for commit', async () => {
        const result = await getReviewScope(mockGit, 'rev');

        expect(result).toEqual({
            target: 'rev',
            base: 'rev^',
            isTargetCheckedOut: true,
            revisionRangeDiff: 'rev^...rev',
            revisionRangeLog: 'rev^..rev',
            changeDescription: 'message\nmessage2',
        });
    });

    it('for branch', async () => {
        const result = await getReviewScope(mockGit, 'target', 'base');

        expect(result).toEqual({
            target: 'target',
            base: 'base',
            isTargetCheckedOut: true,
            revisionRangeDiff: 'base...target',
            revisionRangeLog: 'base..target',
            changeDescription: 'message\nmessage2',
        });
    });
});

describe('addLineNumbers', () => {
    it('adds line numbers from hunk header', () => {
        const diff = '@@ -1,2 +42,2 @@\nline1\nline2';
        const result = addLineNumbers(diff);

        expect(result).toBe('0\t@@ -1,2 +42,2 @@\n42\tline1\n43\tline2');
    });

    it('adds line numbers for single-line hunks (to file)', () => {
        const diff = '@@ -0,0 +1 @@\n+test';
        const result = addLineNumbers(diff);

        expect(result).toBe('0\t@@ -0,0 +1 @@\n1\t+test');
    });
    it('adds line numbers for single-line hunks (from file)', () => {
        const diff = '@@ -1 +1,1 @@\n+test';
        const result = addLineNumbers(diff);

        expect(result).toBe('0\t@@ -1 +1,1 @@\n1\t+test');
    });

    it('handles hunk headers with context', () => {
        const diff = '@@ -1,2 +3,2 @@ func main() {\nline1';
        const result = addLineNumbers(diff);

        expect(result).toBe('0\t@@ -1,2 +3,2 @@ func main() {\n3\tline1');
    });

    it('prints 0 until first hunk header', () => {
        const diff = 'line1\nline2\n@@ -1,2 +1,2 @@\nline3';
        const result = addLineNumbers(diff);

        expect(result).toBe('0\tline1\n0\tline2\n0\t@@ -1,2 +1,2 @@\n1\tline3');
    });

    it('prints 0 for removed lines', () => {
        const diff = '@@ -1,2 +1,2 @@\nline1\n-removed\n+added';
        const result = addLineNumbers(diff);

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
        const result = addLineNumbers(diff);

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
        expect(() => addLineNumbers(diff)).toThrow();
    });

    it('handles hunk-header not on start of line as normal text', () => {
        const hunkHeader1 = '@@ -1,2 +2,30 @@';
        const hunkHeader2 = '@@ -100,2 +410,20 @@';
        const diff = `${hunkHeader1}\nline1\n ${hunkHeader2}`;
        const result = addLineNumbers(diff);

        expect(result).toBe(`0\t${hunkHeader1}\n2\tline1\n3\t ${hunkHeader2}`);
    });
});

describe('getBranchList', () => {
    const mockGit = {
        branch: vi.fn(),
    } as unknown as SimpleGit;

    it('returns list of branches', async () => {
        vi.mocked(mockGit.branch).mockResolvedValue({
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

        const result = await getBranchList(mockGit, undefined, 2);

        expect(mockGit.branch).toHaveBeenCalledWith([
            '--all',
            '--sort=-committerdate',
        ]);
        expect(result.refs.map((ref) => ref.ref)).toEqual([
            'branch1',
            'branch2',
        ]);
        expect(result.refs.map((ref) => ref.description)).toEqual([
            'abc1',
            'abc2',
        ]);
        expect(result.hasMore).toBe(false);
    });

    it('handles empty list', async () => {
        vi.mocked(mockGit.branch).mockResolvedValue({
            all: [],
            branches: {},
        } as unknown as BranchSummary);

        const result = await getBranchList(mockGit, undefined, 2);

        expect(result.refs.length).toBe(0);
        expect(result.hasMore).toBe(false);
    });

    it('limits results to maxCount', async () => {
        vi.mocked(mockGit.branch).mockResolvedValue({
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

        const result = await getBranchList(mockGit, undefined, 1);

        expect(result.refs.map((ref) => ref.ref)).toEqual(['branch1']);
        expect(result.refs.map((ref) => ref.description)).toEqual(['abc1']);
        expect(result.hasMore).toBe(true);
    });

    it('puts current branch first with beforeRef=undefined', async () => {
        vi.mocked(mockGit.branch).mockResolvedValue({
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
        } as unknown as BranchSummary);

        const result = await getBranchList(mockGit, undefined, 2);

        expect(result.refs.map((ref) => ref.ref)).toEqual([
            'branch2',
            'branch1',
        ]);
        expect(result.refs.map((ref) => ref.description)).toEqual([
            '(current) abc2',
            'abc1',
        ]);
        expect(result.hasMore).toBe(false);
    });

    it('does not put current branch first with beforeRef set', async () => {
        vi.mocked(mockGit.branch).mockResolvedValue({
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
        } as unknown as BranchSummary);

        const result = await getBranchList(mockGit, 'some-other-ref', 2);

        expect(mockGit.branch).toHaveBeenCalledWith([
            '--all',
            '--sort=-committerdate',
            '--no-contains=some-other-ref',
        ]);
        expect(result.refs.map((ref) => ref.ref)).toEqual([
            'branch1',
            'branch2',
        ]);
        expect(result.refs.map((ref) => ref.description)).toEqual([
            'abc1',
            '(current) abc2',
        ]);
        expect(result.hasMore).toBe(false);
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
        const branchSummaries = {};
        branches.forEach((branch) => {
            branchSummaries[branch] = {
                current: false,
                commit: branch,
            };
        });

        vi.mocked(mockGit.branch).mockResolvedValue({
            all: branches,
            branches: branchSummaries,
        } as unknown as BranchSummary);

        const result = await getBranchList(mockGit, 'myfeature', 7);

        const expectedBranches = [
            'remotes/origin/myfeature',
            'remotes/mirror/myfeature',
            'develop',
            'main',
            'master',
            'trunk',
            'other',
        ];
        expect(result.refs.map((ref) => ref.ref)).toEqual(expectedBranches);
        expect(result.refs.map((ref) => ref.description)).toEqual(
            expectedBranches.map((branch) => branch.substring(0, 7))
        );
        expect(result.hasMore).toBe(true);
    });
});

describe('getTagList', () => {
    const mockGit = {
        tags: vi.fn(),
    } as unknown as SimpleGit;

    it('returns list of tags', async () => {
        vi.mocked(mockGit.tags).mockResolvedValue({
            all: ['tag1', 'tag2'],
        } as TagResult);

        const result = await getTagList(mockGit, undefined, 2);

        expect(mockGit.tags).toHaveBeenCalledWith(['--sort=-creatordate']);
        expect(result.refs.map((ref) => ref.ref)).toEqual(['tag1', 'tag2']);
        expect(result.refs.map((ref) => ref.description)).toEqual([
            undefined,
            undefined,
        ]);
        expect(result.hasMore).toBe(false);
    });

    it('limits results to maxCount', async () => {
        vi.mocked(mockGit.tags).mockResolvedValue({
            all: ['tag1', 'tag2'],
        } as TagResult);

        const result = await getTagList(mockGit, undefined, 1);

        expect(result.refs.map((ref) => ref.ref)).toEqual(['tag1']);
        expect(result.refs.map((ref) => ref.description)).toEqual([undefined]);
        expect(result.hasMore).toBe(true);
    });

    it('handles empty list', async () => {
        vi.mocked(mockGit.tags).mockResolvedValue({
            all: [],
        } as unknown as TagResult);

        const result = await getTagList(mockGit, undefined, 2);

        expect(result.refs.length).toBe(0);
        expect(result.hasMore).toBe(false);
    });
});

describe('getCommitList', () => {
    const mockGit = {
        log: vi.fn(),
        firstCommit: vi.fn(),
    } as unknown as SimpleGit;

    it('returns list of commits', async () => {
        vi.mocked(mockGit.log).mockResolvedValue({
            all: [{ hash: 'hash1' }, { hash: 'hash2' }],
        } as unknown as LogResult);

        const result = await getCommitList(mockGit, undefined, 2);

        expect(mockGit.log).toHaveBeenCalledWith({
            maxCount: 3,
        });
        expect(mockGit.firstCommit).not.toHaveBeenCalled();
        expect(result.refs.map((ref) => ref.ref)).toEqual(['hash1', 'hash2']);
        expect(result.hasMore).toBe(false);
    });

    it('limits results to maxCount', async () => {
        vi.mocked(mockGit.log).mockResolvedValue({
            all: [{ hash: 'hash1' }, { hash: 'hash2' }],
        } as unknown as LogResult);

        const result = await getCommitList(mockGit, undefined, 1);

        expect(result.refs.map((ref) => ref.ref)).toEqual(['hash1']);
        expect(result.hasMore).toBe(true);
    });

    it('handles empty list', async () => {
        vi.mocked(mockGit.log).mockResolvedValue({
            all: [],
        } as unknown as LogResult);

        const result = await getCommitList(mockGit, undefined, 2);

        expect(result.refs.length).toBe(0);
        expect(result.hasMore).toBe(false);
    });

    it('returns commits before beforeRef', async () => {
        vi.mocked(mockGit.log).mockResolvedValue({
            all: [{ hash: 'hash1' }, { hash: 'hash2' }],
        } as unknown as LogResult);
        vi.mocked(mockGit.firstCommit).mockResolvedValue('firstCommit');

        const result = await getCommitList(mockGit, 'beforeRef', 2);

        expect(mockGit.log).toHaveBeenCalledWith({
            maxCount: 3,
            from: 'firstCommit',
            to: 'beforeRef^',
        });
        expect(mockGit.firstCommit).toHaveBeenCalledOnce();
        expect(result.refs.map((ref) => ref.ref)).toEqual(['hash1', 'hash2']);
        expect(result.hasMore).toBe(false);
    });
});
