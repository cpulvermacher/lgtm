import { LogResult, SimpleGit } from 'simple-git';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    addLineNumbers,
    getChangedFiles,
    getFileDiff,
    getReviewScope,
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

describe('git', () => {
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
                'rev...rev',
                '--',
                'file',
            ]);
            expect(result).toBe('0\tdiff');
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
            const request = { commit: 'rev' };
            const result = await getReviewScope(mockGit, request);

            expect(result).toEqual({
                request,
                revisionRangeDiff: 'rev^...rev',
                revisionRangeLog: 'rev^..rev',
                changeDescription: 'message\nmessage2',
            });
        });

        it('for branch', async () => {
            const request = { baseBranch: 'base', targetBranch: 'target' };
            const result = await getReviewScope(mockGit, request);

            expect(result).toEqual({
                request,
                revisionRangeDiff: 'base...target',
                revisionRangeLog: 'base..target',
                changeDescription: 'message\nmessage2',
            });
        });
    });

    describe('addLineNumbers', () => {
        it('adds line numbers', () => {
            const diff = '@@ -1,2 +1,2 @@\nline1\nline2';
            const result = addLineNumbers(diff);

            expect(result).toBe('0\t@@ -1,2 +1,2 @@\n1\tline1\n2\tline2');
        });

        it('prints 0 until first hunk header', () => {
            const diff = 'line1\nline2\n@@ -1,2 +1,2 @@\nline3';
            const result = addLineNumbers(diff);

            expect(result).toBe(
                '0\tline1\n0\tline2\n0\t@@ -1,2 +1,2 @@\n1\tline3'
            );
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
    });
});
