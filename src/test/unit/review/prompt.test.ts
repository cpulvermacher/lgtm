import { describe, expect, it } from 'vitest';

import { createReviewPrompt } from '@/review/prompt';
import { PromptType } from '@/types/PromptType';
import type { ReviewContextFile } from '@/types/ReviewContextFile';

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

    it('falls back to default on unknown prompt type', async () => {
        const prompt = createReviewPrompt(
            changeDescription,
            diff,
            customPrompt,
            'v1' as PromptType
        );
        await expect(prompt).toMatchFileSnapshot('review-prompt-v2think.snap');
    });

    it('adds configured context files to the prompt', () => {
        const contextFiles: ReviewContextFile[] = [
            { path: 'AGENTS.md', content: 'Follow the repo conventions.' },
            { path: 'docs/README.md', content: 'Architecture notes.' },
        ];

        const prompt = createReviewPrompt(
            changeDescription,
            diff,
            customPrompt,
            undefined,
            contextFiles
        );

        expect(prompt).toContain('Here is relevant context for this codebase:');
        expect(prompt).toContain('<context_AGENTS_md>');
        expect(prompt).toContain('Follow the repo conventions.');
        expect(prompt).toContain('<context_docs_README_md>');
        expect(prompt).toContain('Architecture notes.');
    });
});
