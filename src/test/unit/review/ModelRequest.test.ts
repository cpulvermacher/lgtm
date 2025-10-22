import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CancellationToken } from 'vscode';

import { ModelRequest } from '@/review/ModelRequest';
import type { Config, Options } from '@/types/Config';
import type { Logger } from '@/types/Logger';
import type { Model } from '@/types/Model';

describe('ModelRequest', () => {
    let model: Model;
    let request: ModelRequest;
    beforeEach(async () => {
        const { config } = createMockConfig();
        model = await config.getModel();
        request = new ModelRequest(
            model,
            config.getOptions(),
            config.logger,
            'Various refactorings'
        );
    });

    it('constructs empty request', () => {
        expect(request.files).toEqual([]);
    });

    it('adds first diff to request', async () => {
        await request.addDiff('file1.ts', 'DIFF1');

        expect(request.files).toEqual(['file1.ts']);
        expect(request.getPrompt()).toContain('DIFF1');
    });

    it('for first diff, truncates change description if prompt exceeds token limit', async () => {
        vi.mocked(model.countTokens)
            .mockResolvedValueOnce(2000)
            .mockResolvedValueOnce(2);

        const longDiff = 'd'.repeat(10000);
        await request.addDiff('file1.ts', longDiff);

        expect(request.files).toEqual(['file1.ts']);
        //change description truncated first
        expect(request.getPrompt()).not.toContain('<Change Description>');
        expect(request.getPrompt()).not.toContain('Various refactorings');

        //diff not truncated
        expect(request.getPrompt()).toContain(longDiff);

        expect(model.countTokens).toHaveBeenCalledTimes(2);
    });

    it('for first diff, truncates diff if prompt still exceeds token limit', async () => {
        vi.mocked(model.countTokens)
            .mockResolvedValueOnce(2000)
            .mockResolvedValueOnce(2000)
            .mockResolvedValueOnce(2);

        const longDiff = 'd'.repeat(10000);
        await request.addDiff('file1.ts', longDiff);

        expect(request.files).toEqual(['file1.ts']);
        //change description truncated first
        expect(request.getPrompt()).not.toContain('<Change description>');
        expect(request.getPrompt()).not.toContain('Various refactorings');
        //diff was truncated
        expect(request.getPrompt()).toContain('d'.repeat(100));
        expect(request.getPrompt()).not.toContain(longDiff);

        expect(model.countTokens).toHaveBeenCalledTimes(3);
    });

    it('throws if first diff cannot be truncated to fit token limit', async () => {
        vi.mocked(model.countTokens)
            .mockResolvedValueOnce(2000)
            .mockResolvedValueOnce(2000);

        await expect(async () => {
            await request.addDiff('file1.ts', 'DIFF');
        }).rejects.toThrow(
            'prompt size 2000 exceeds limit. Prompt itself too long?'
        );

        expect(request.files).toEqual([]);
        expect(model.countTokens).toHaveBeenCalledTimes(2);
    });

    it('adds second diff to request', async () => {
        await request.addDiff('file1.ts', 'DIFF1');
        await request.addDiff('file2.ts', 'DIFF2');

        expect(request.files).toEqual(['file1.ts', 'file2.ts']);
        expect(request.getPrompt()).toContain('DIFF1\nDIFF2');
    });

    it('throws if prompt for second diff exceeds token limit', async () => {
        await request.addDiff('file1.ts', 'DIFF1');
        vi.mocked(model.countTokens).mockResolvedValueOnce(100000);

        await expect(async () => {
            await request.addDiff('file2.ts', 'DIFF2');
        }).rejects.toThrow(
            'Cannot add diff to request, prompt size 100000 exceeds limit'
        );

        expect(request.files).toEqual(['file1.ts']);
        expect(request.getPrompt()).toContain('DIFF1');
        expect(request.getPrompt()).not.toContain('DIFF2');
    });

    it('gets review response', async () => {
        await request.addDiff('file1.ts', 'DIFF1');
        vi.mocked(model.sendRequest).mockResolvedValueOnce('RESPONSE');
        const cancellationToken = {
            isCancellationRequested: false,
        } as CancellationToken;

        const response = await request.sendRequest(cancellationToken);
        expect(response).toEqual({
            response: 'RESPONSE',
            promptTokens: 4,
            responseTokens: 4,
        });
        expect(model.sendRequest).toHaveBeenCalledWith(
            expect.stringContaining('DIFF1'),
            cancellationToken
        );
    });
});

function createMockConfig() {
    const model = {
        sendRequest: vi.fn(() => {
            return Promise.resolve('Some review comment\n3/5');
        }),
        countTokens: vi.fn(() => Promise.resolve(4)),
        maxInputTokens: 1000,
    } as unknown as Model;

    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        setEnableDebug: vi.fn(),
        isDebugEnabled: vi.fn(() => false),
    } as Logger;

    const config = {
        getModel: async () => model,
        getOptions: () =>
            ({
                minSeverity: 3,
                customPrompt: 'custom prompt',
                excludeGlobs: [] as string[],
                enableDebugOutput: false,
                chatModel: 'test-model',
                mergeFileReviewRequests: true,
                maxInputTokensFraction: 0.8,
            }) as Options,
        logger,
    } as Config;
    return { config, model, logger };
}
