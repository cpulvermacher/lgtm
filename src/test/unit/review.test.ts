import * as assert from 'assert';
import { it } from 'mocha';
import type { CancellationToken } from 'vscode';

import { getReviewComments } from '../../review/review';
import { Model } from '../../utils/model';

describe('getReviewComment_test', () => {
    const model = {
        sendRequest: async () => {
            return 'Some review comment\n3/5';
        },
        limitTokens: async (text: string) => text,
    } as unknown as Model;

    const diff = 'Some diff content';
    const cancellationToken = null as unknown as CancellationToken;

    it('should return a comment and severity', async () => {
        const result = await getReviewComments(model, diff, cancellationToken);

        assert.strictEqual(result, 'Some review comment\n3/5');
    });

    it('should throw an error if there is a stream error', async () => {
        // Mock the response to throw an error when iterating over the text fragments
        model.sendRequest = async () => {
            throw new Error('Stream error');
        };

        // Assert that the function throws the expected error
        await assert.rejects(async () => {
            await getReviewComments(model, diff, cancellationToken);
        }, new Error('Stream error'));
    });
});
