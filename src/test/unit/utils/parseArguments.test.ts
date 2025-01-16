import { describe, expect, it, vi } from 'vitest';

import { Git } from '../../../utils/git';
import { parseArguments } from '../../../utils/parseArguments';

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

    it('throws for invalid target', async () => {
        vi.mocked(mockGit.getCommitRef).mockRejectedValue(
            new Error('not found')
        );

        await expect(parseArguments(mockGit, 'target')).rejects.toThrow();
    });

    it('throws for invalid base', async () => {
        vi.mocked(mockGit.getCommitRef).mockResolvedValueOnce('ignored');
        vi.mocked(mockGit.getCommitRef).mockRejectedValueOnce(
            new Error('not found')
        );

        await expect(parseArguments(mockGit, 'target base')).rejects.toThrow();

        expect(mockGit.getCommitRef).toHaveBeenCalledTimes(2);
    });
});
