import { describe, expect, it, vi } from 'vitest';

import { createReviewPrompt, ModelRequest } from '../../../review/ModelRequest';
import type { Config } from '../../../types/Config';
import type { Logger } from '../../../types/Logger';
import type { Model } from '../../../types/Model';

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

describe('ModelRequest', () => {
    it('constructs empty request', () => {
        const { config } = createMockConfig();
        const request = new ModelRequest(
            config,
            'Various refactorings',
            'user prompt'
        );

        expect(request.files).toEqual([]);
    });
});

function createMockConfig() {
    const model = {
        sendRequest: vi.fn(async () => {
            return Promise.resolve('Some review comment\n3/5');
        }),
        countTokens: vi.fn(async () => Promise.resolve(4)),
    } as unknown as Model;

    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        setEnableDebug: vi.fn(),
    } as Logger;

    const config = {
        model,
        getOptions: () => ({
            customPrompt: 'custom prompt',
            minSeverity: 3,
            excludeGlobs: [] as string[],
            enableDebugOutput: false,
        }),
        logger,
    } as Config;
    return { config, model, logger };
}
