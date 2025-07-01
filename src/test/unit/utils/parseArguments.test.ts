import { describe, expect, it, vi } from 'vitest';

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

    it('parses two arguments with whitespace', async () => {
        const result = await parseArguments(mockGit, ' target base ');

        expect(result).toEqual({ target: 'target', base: 'base' });
    });

    it('parses single non-commit-ref argument into empty object', async () => {
        vi.mocked(mockGit.getCommitRef).mockRejectedValue(new Error());

        const result = await parseArguments(mockGit, 'prompt');

        expect(result).toEqual({});
    });

    it('parses two non-commit-ref arguments into empty object', async () => {
        vi.mocked(mockGit.getCommitRef).mockRejectedValue(new Error());

        const result = await parseArguments(mockGit, 'prompt1 prompt2');

        expect(result).toEqual({});
    });

    it('throws on more than two arguments', async () => {
        vi.mocked(mockGit.getCommitRef).mockRejectedValue(new Error());

        await expect(() =>
            parseArguments(mockGit, 'target base extra')
        ).rejects.toThrow(
            'Expected at most two refs as arguments. Use the command without arguments to select refs interactively.'
        );
        expect(mockGit.getCommitRef).not.toHaveBeenCalled();
    });

    it('parses single commit-ref argument plus non-commit-ref', async () => {
        vi.mocked(mockGit.getCommitRef)
            .mockResolvedValueOnce('')
            .mockRejectedValue(new Error());

        const result = await parseArguments(mockGit, 'target extra');

        expect(result).toEqual({ target: 'target' });
    });
});
