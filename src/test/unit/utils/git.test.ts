import * as assert from 'assert';
import { describe, it } from 'mocha';
import { SimpleGit } from 'simple-git';

import {
    getChangedFiles,
    getFileDiff,
    getReviewScope,
} from '../../../utils/git';

describe('git', () => {
    const mockGit = {
        revparse: async () => 'rev',
        log: async () => {
            return { all: [{ message: 'message' }, { message: 'message2' }] };
        },
        diff: async () => 'diff\n\ndiff',
    } as unknown as SimpleGit;

    it('getChangedFiles', async () => {
        const result = await getChangedFiles(mockGit, 'rev..rev');

        assert.deepStrictEqual(result, ['diff', 'diff']);
    });

    it('getFileDiff', async () => {
        const result = await getFileDiff(mockGit, 'rev..rev', 'file');

        assert.strictEqual(result, 'diff\n\ndiff');
    });

    describe('getReviewScope', () => {
        it('for commit', async () => {
            const request = { commit: 'rev' };
            const result = await getReviewScope(mockGit, request);

            assert.deepStrictEqual(result, {
                request,
                revisionRange: 'rev^..rev',
                changeDescription: 'message\nmessage2',
            });
        });

        it('for branch', async () => {
            const request = { baseBranch: 'base', targetBranch: 'target' };
            const result = await getReviewScope(mockGit, request);

            assert.deepStrictEqual(result, {
                request,
                revisionRange: 'base..target',
                changeDescription: 'message\nmessage2',
            });
        });
    });
});
