import { describe, expect, it, vi } from 'vitest';
import type { CancellationToken } from 'vscode';

import { getReviewResponse } from '../../../review/review';
import { Model } from '../../../types/Model';

describe('getReviewResponse', () => {
    const model = {
        sendRequest: vi.fn(async () => {
            return 'Some review comment\n3/5';
        }),
        limitTokens: vi.fn(async (text: string) => text),
    } as unknown as Model;

    const diff = 'Some diff content';
    const cancellationToken = null as unknown as CancellationToken;

    it('should return a comment and severity', async () => {
        const result = await getReviewResponse(
            model,
            'chore: dummy change',
            diff,
            cancellationToken
        );

        expect(result).toBe('Some review comment\n3/5');
        expect(model.limitTokens).toHaveBeenCalledWith(diff);
        expect(model.sendRequest).toHaveBeenCalledWith(
            expect.stringMatching(/^\nYou are a senior software engineer/),
            cancellationToken
        );
    });

    it('should throw an error if there is a stream error', async () => {
        vi.mocked(model.sendRequest).mockRejectedValue(
            new Error('Stream error')
        );

        await expect(async () => {
            await getReviewResponse(
                model,
                'chore: dummy change',
                diff,
                cancellationToken
            );
        }).rejects.toThrow('Stream error');
    });
});
