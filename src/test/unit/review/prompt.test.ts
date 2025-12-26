import { describe, expect, it } from 'vitest';

import { createReviewPrompt } from '@/review/prompt';

const changeDescription = 'Various refactorings';
const diff = 'diff\nhere';
const customPrompt = 'custom prompt';

describe('createReviewPrompt', () => {
    it('creates prompt with custom prompt (default)', async () => {
        const prompt = createReviewPrompt(
            changeDescription,
            diff,
            customPrompt
        );
        await expect(prompt).toMatchFileSnapshot(
            'review-prompt-v2think-custom-prompt.snap'
        );
    });

    it('creates prompt with v2 type', async () => {
        const prompt = createReviewPrompt(
            changeDescription,
            diff,
            customPrompt,
            'v2'
        );
        await expect(prompt).toMatchFileSnapshot('review-prompt-v2.snap');
    });

    it('creates prompt with v2think type', async () => {
        const prompt = createReviewPrompt(
            changeDescription,
            diff,
            customPrompt,
            'v2think'
        );
        await expect(prompt).toMatchFileSnapshot('review-prompt-v2think.snap');
    });
});
