import { LogResult, SimpleGit } from 'simple-git';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    getChangedFiles,
    getFileDiff,
    getReviewScope,
} from '../../../utils/git';

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

    it('getFileDiff', async () => {
        vi.mocked(mockGit.diff).mockResolvedValue('diff');

        const result = await getFileDiff(mockGit, 'rev...rev', 'file');

        expect(mockGit.diff).toHaveBeenCalledWith([
            '--no-prefix',
            'rev...rev',
            '--',
            'file',
        ]);
        expect(result).toBe('diff');
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
});
