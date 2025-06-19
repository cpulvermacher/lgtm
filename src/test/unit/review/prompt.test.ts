import { describe, expect, it } from 'vitest';

import { createReviewPrompt } from '@/review/prompt';

describe('createReviewPrompt', () => {
    it('creates prompt with custom prompt', async () => {
        const prompt = createReviewPrompt(
            'Various refactorings',
            'diff\nhere',
            'user prompt'
        );

        await expect(prompt).toMatchFileSnapshot('review-prompt.snap');
    });
});
