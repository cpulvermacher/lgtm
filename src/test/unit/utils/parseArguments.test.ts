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

    it('parses more than two arguments', async () => {
        const result = await parseArguments(
            mockGit,
            'target base some long prompt'
        );

        expect(result).toEqual({
            target: 'target',
            base: 'base',
            customPrompt: 'some long prompt',
        });
    });

    it('parses single non-commit-ref argument into customPrompt', async () => {
        vi.mocked(mockGit.getCommitRef).mockRejectedValue(new Error());

        const result = await parseArguments(mockGit, 'prompt');

        expect(result).toEqual({ customPrompt: 'prompt' });
    });

    it('parses two non-commit-ref arguments into customPrompt', async () => {
        vi.mocked(mockGit.getCommitRef).mockRejectedValue(new Error());

        const result = await parseArguments(mockGit, 'prompt1 prompt2');

        expect(result).toEqual({ customPrompt: 'prompt1 prompt2' });
    });

    it('parses longer non-commit-ref arguments into customPrompt', async () => {
        vi.mocked(mockGit.getCommitRef).mockRejectedValue(new Error());

        const result = await parseArguments(
            mockGit,
            'this is a longish prompt'
        );

        expect(result).toEqual({
            customPrompt: 'this is a longish prompt',
        });
    });

    it('parses single commit-ref argument and rest into customPrompt', async () => {
        vi.mocked(mockGit.getCommitRef)
            .mockResolvedValueOnce('')
            .mockRejectedValue(new Error());

        const result = await parseArguments(mockGit, 'target prompt');

        expect(result).toEqual({ target: 'target', customPrompt: 'prompt' });
    });

    it('parses two commit-ref arguments and rest into customPrompt', async () => {
        vi.mocked(mockGit.getCommitRef)
            .mockResolvedValueOnce('')
            .mockResolvedValueOnce('')
            .mockRejectedValue(new Error());

        const result = await parseArguments(mockGit, 'target base prompt');

        expect(result).toEqual({
            target: 'target',
            base: 'base',
            customPrompt: 'prompt',
        });
    });

    it('parses single commit-ref argument and longer rest into customPrompt', async () => {
        vi.mocked(mockGit.getCommitRef)
            .mockResolvedValueOnce('')
            .mockRejectedValue(new Error());

        const result = await parseArguments(mockGit, 'target longer prompt');

        expect(result).toEqual({
            target: 'target',
            customPrompt: 'longer prompt',
        });
    });

    it('parses two commit-ref arguments and longer rest into customPrompt', async () => {
        vi.mocked(mockGit.getCommitRef)
            .mockResolvedValueOnce('')
            .mockResolvedValueOnce('')
            .mockRejectedValue(new Error());

        const result = await parseArguments(
            mockGit,
            'target base longer prompt'
        );

        expect(result).toEqual({
            target: 'target',
            base: 'base',
            customPrompt: 'longer prompt',
        });
    });
});
