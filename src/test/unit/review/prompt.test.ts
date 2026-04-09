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

        expect(prompt).toContain(
            'Here is project-wide documentation and context for the codebase where the diff applies:'
        );
        expect(prompt).toContain('<context_file_AGENTS_x002e_md>');
        expect(prompt).toContain('Follow the repo conventions.');
        expect(prompt).toContain('<context_file_docs_x002f_README_x002e_md>');
        expect(prompt).toContain('Architecture notes.');
    });

    it('renders distinct tags for paths that would otherwise collide', () => {
        const prompt = createReviewPrompt(
            changeDescription,
            diff,
            customPrompt,
            undefined,
            [
                { path: 'a/b.md', content: 'slash path' },
                { path: 'a_b.md', content: 'underscore path' },
            ]
        );

        expect(prompt).toContain('<context_file_a_x002f_b_x002e_md>');
        expect(prompt).toContain('<context_file_a_x005f_b_x002e_md>');
    });

    it('uses a readable fallback tag when a context path is empty', () => {
        const prompt = createReviewPrompt(
            changeDescription,
            diff,
            customPrompt,
            undefined,
            [{ path: '', content: 'fallback context' }]
        );

        expect(prompt).toContain('<context_file>');
        expect(prompt).not.toContain('<context_file_file>');
    });
});
