import { describe, expect, it, vi } from 'vitest';

import { UncommittedRef } from '@/types/Ref';
import { Git } from '@/utils/git';
import { parseArguments } from '@/utils/parseArguments';

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
});
