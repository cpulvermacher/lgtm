import { describe, expect, it } from 'vitest';
import type { CancellationToken } from 'vscode';

import { getReviewResponse } from '../../../review/review';
import { Model } from '../../../utils/model';

describe('getReviewResponse', () => {
    const model = {
        sendRequest: async () => {
            return 'Some review comment\n3/5';
        },
        limitTokens: async (text: string) => text,
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
    });

    it('should throw an error if there is a stream error', async () => {
        model.sendRequest = async () => {
            throw new Error('Stream error');
        };

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
