import { describe, expect, it, vi } from 'vitest';

import { UncommittedRef } from '@/types/Ref';
import { Git } from '@/utils/git';
import { extractModelSpecs, parseArguments } from '@/utils/parseArguments';

describe('parseArguments', () => {
    const mockGit = {
        getCommitRef: vi.fn(),
    } as unknown as Git;

    it('parses empty arguments', async () => {
        const result = await parseArguments(mockGit, '');

        expect(result).toEqual({ target: undefined, base: undefined });
    });

    it('parses only whitespace arguments', async () => {
        const result = await parseArguments(mockGit, ' \t  \t');

        expect(result).toEqual({ target: undefined, base: undefined });
    });

    it('parses single argument', async () => {
        const result = await parseArguments(mockGit, 'target');

        expect(result).toEqual({ target: 'target', base: undefined });

        expect(mockGit.getCommitRef).toHaveBeenCalledTimes(1);
    });

    it('parses two arguments', async () => {
        const result = await parseArguments(mockGit, 'target base');

        expect(result).toEqual({ target: 'target', base: 'base' });

        expect(mockGit.getCommitRef).toHaveBeenCalledTimes(2);
    });

    it('parses two arguments with surrounding whitespace', async () => {
        const result = await parseArguments(mockGit, ' target base ');

        expect(result).toEqual({ target: 'target', base: 'base' });
    });

    it('parses two arguments with extra whitespace', async () => {
        const result = await parseArguments(
            mockGit,
            'target \t\t      base     '
        );

        expect(result).toEqual({ target: 'target', base: 'base' });
    });

    it('throws for single non-commit-ref argument', async () => {
        vi.mocked(mockGit.getCommitRef).mockRejectedValue(new Error());

        await expect(parseArguments(mockGit, 'prompt')).rejects.toThrow(
            "Could not find target ref 'prompt'."
        );
    });

    it('throws for two non-commit-ref arguments', async () => {
        vi.mocked(mockGit.getCommitRef).mockRejectedValue(new Error());

        await expect(
            parseArguments(mockGit, 'prompt1 prompt2')
        ).rejects.toThrow("Could not find target ref 'prompt1'.");
    });

    it('throws on more than two arguments', async () => {
        vi.mocked(mockGit.getCommitRef).mockRejectedValue(new Error());

        await expect(
            parseArguments(mockGit, 'target base extra')
        ).rejects.toThrow('Expected at most two refs as arguments.');
        expect(mockGit.getCommitRef).not.toHaveBeenCalled();
    });

    it('throws on single commit-ref argument plus non-commit-ref', async () => {
        vi.mocked(mockGit.getCommitRef)
            .mockResolvedValueOnce('')
            .mockRejectedValue(new Error());

        await expect(parseArguments(mockGit, 'target extra')).rejects.toThrow(
            "Could not find base ref 'extra'."
        );
    });

    it('parses "staged"', async () => {
        const result = await parseArguments(mockGit, 'staged');

        expect(result).toEqual({
            target: UncommittedRef.Staged,
            base: undefined,
        });

        expect(mockGit.getCommitRef).toHaveBeenCalledTimes(0);
    });

    it('parses "unstaged"', async () => {
        const result = await parseArguments(mockGit, 'unstaged');

        expect(result).toEqual({
            target: UncommittedRef.Unstaged,
            base: undefined,
        });

        expect(mockGit.getCommitRef).toHaveBeenCalledTimes(0);
    });

    it('throws for additional arguments after an uncomitted ref', async () => {
        await expect(parseArguments(mockGit, 'staged extra')).rejects.toThrow(
            "Expected no argument after 'staged'."
        );
    });

    describe('inline model specs', () => {
        it('extracts a single model spec', async () => {
            const result = await parseArguments(
                mockGit,
                'model:gpt-4.1 target base'
            );

            expect(result).toEqual({
                target: 'target',
                base: 'base',
                modelIds: ['gpt-4.1'],
            });
        });

        it('extracts multiple model specs', async () => {
            const result = await parseArguments(
                mockGit,
                'model:gpt-4.1 model:claude-sonnet target base'
            );

            expect(result).toEqual({
                target: 'target',
                base: 'base',
                modelIds: ['gpt-4.1', 'claude-sonnet'],
            });
        });

        it('extracts model specs after refs', async () => {
            const result = await parseArguments(
                mockGit,
                'target model:gpt-4.1 base'
            );

            expect(result).toEqual({
                target: 'target',
                base: 'base',
                modelIds: ['gpt-4.1'],
            });
        });

        it('extracts model specs with vendor prefix', async () => {
            const result = await parseArguments(
                mockGit,
                'model:copilot:gpt-4.1 target'
            );

            expect(result).toEqual({
                target: 'target',
                modelIds: ['copilot:gpt-4.1'],
            });
        });

        it('extracts model specs with staged ref', async () => {
            const result = await parseArguments(
                mockGit,
                'model:gpt-4.1 staged'
            );

            expect(result).toEqual({
                target: UncommittedRef.Staged,
                modelIds: ['gpt-4.1'],
            });
        });

        it('extracts model specs with no refs', async () => {
            const result = await parseArguments(
                mockGit,
                'model:gpt-4.1 model:claude-sonnet'
            );

            expect(result).toEqual({
                modelIds: ['gpt-4.1', 'claude-sonnet'],
            });
        });

        it('ignores empty model: prefix', async () => {
            const result = await parseArguments(mockGit, 'model: target base');

            expect(result).toEqual({ target: 'target', base: 'base' });
        });

        it('still throws on too many non-model refs', async () => {
            await expect(
                parseArguments(mockGit, 'model:gpt-4.1 target base extra')
            ).rejects.toThrow('Expected at most two refs as arguments.');
        });
    });
});

describe('extractModelSpecs', () => {
    it('extracts model specs from mixed tokens', () => {
        const result = extractModelSpecs(
            'model:gpt-4.1 develop model:claude-sonnet main'
        );

        expect(result).toEqual({
            modelIds: ['gpt-4.1', 'claude-sonnet'],
            remaining: ['develop', 'main'],
        });
    });

    it('returns empty modelIds when no model: tokens present', () => {
        const result = extractModelSpecs('develop main');

        expect(result).toEqual({
            modelIds: [],
            remaining: ['develop', 'main'],
        });
    });

    it('handles empty string', () => {
        const result = extractModelSpecs('');

        expect(result).toEqual({
            modelIds: [],
            remaining: [],
        });
    });

    it('skips model: tokens with no value', () => {
        const result = extractModelSpecs('model: develop');

        expect(result).toEqual({
            modelIds: [],
            remaining: ['develop'],
        });
    });

    it('handles vendor:id format in model spec', () => {
        const result = extractModelSpecs('model:copilot:gpt-4.1');

        expect(result).toEqual({
            modelIds: ['copilot:gpt-4.1'],
            remaining: [],
        });
    });
});
