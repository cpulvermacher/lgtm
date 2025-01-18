import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CancellationToken } from 'vscode';

import { parseResponse } from '../../../review/comment';
import {
    createReviewPrompt,
    getReviewResponse,
    reviewDiff,
} from '../../../review/review';
import { Config } from '../../../types/Config';
import { FileComments } from '../../../types/FileComments';
import { Logger } from '../../../types/Logger';
import { Model } from '../../../types/Model';
import { ModelError } from '../../../types/ModelError';
import { ReviewScope } from '../../../types/ReviewRequest';
import { Git } from '../../../utils/git';

function createMockConfig() {
    const model = {
        sendRequest: vi.fn(async () => {
            return Promise.resolve('Some review comment\n3/5');
        }),
        limitTokens: vi.fn(async (text: string) => Promise.resolve(text)),
        countTokens: vi.fn(async () => Promise.resolve(4)),
    } as unknown as Model;

    const git = {
        getChangedFiles: vi.fn(),
        getFileDiff: vi.fn((_, __, path) => `diff for ${path}`),
    } as unknown as Git;

    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        setEnableDebug: vi.fn(),
    } as Logger;

    const config = {
        git,
        model,
        getOptions: () => ({
            customPrompt: 'custom prompt',
            minSeverity: 3,
            excludeGlobs: [] as string[],
            enableDebugOutput: false,
        }),
        logger,
    } as Config;
    return { config, model, git, logger };
}

const diff = 'Some diff content';
const cancellationToken = {
    isCancellationRequested: false,
} as CancellationToken;

describe('getReviewResponse', () => {
    let config: Config;
    let model: Model;
    beforeEach(() => {
        ({ config, model } = createMockConfig());
    });

    it('should return a comment and severity', async () => {
        const result = await getReviewResponse(
            config,
            'chore: dummy change',
            diff,
            undefined,
            cancellationToken
        );

        expect(result.response).toBe('Some review comment\n3/5');
        expect(result.promptTokens).toBe(4);
        expect(result.responseTokens).toBe(4);
        expect(model.limitTokens).toHaveBeenCalledWith(diff);
        expect(model.sendRequest).toHaveBeenCalledWith(
            expect.stringMatching(/^You are /),
            cancellationToken
        );
    });

    it('should throw an error if there is a stream error', async () => {
        vi.mocked(model.sendRequest).mockRejectedValue(
            new Error('Stream error')
        );

        await expect(async () => {
            await getReviewResponse(
                config,
                'chore: dummy change',
                diff,
                undefined,
                cancellationToken
            );
        }).rejects.toThrow('Stream error');
    });

    it('should pass the custom prompt to the model', async () => {
        const userPrompt = 'prompt for this request';

        const result = await getReviewResponse(
            config,
            'chore: dummy change',
            diff,
            userPrompt,
            cancellationToken
        );

        expect(result.response).toBe('Some review comment\n3/5');
        expect(result.promptTokens).toBe(4);
        expect(result.responseTokens).toBe(4);

        expect(model.sendRequest).toHaveBeenCalledWith(
            expect.stringContaining(`Review rules:\n${userPrompt}`),
            cancellationToken
        );

        const customPrompt = config.getOptions().customPrompt;
        expect(customPrompt.length).toBeGreaterThan(0);

        // check usual custom prompt is NOT included in the model request
        expect(model.sendRequest).not.toHaveBeenCalledWith(
            expect.stringContaining(customPrompt),
            cancellationToken
        );
    });
});

describe('reviewDiff', () => {
    vi.mock('../../../review/comment', () => ({
        parseResponse: vi.fn(),
        sortFileCommentsBySeverity: vi.fn(
            (comments: Omit<FileComments, 'maxSeverity'>[]) => comments
        ),
    }));

    let config: Config;
    let git: Git;
    let model: Model;
    beforeEach(() => {
        ({ config, git, model } = createMockConfig());
    });

    const progress = {
        report: vi.fn(),
    } as const;

    const scope = {
        changeDescription: 'chore: dummy change',
        revisionRangeDiff: 'base...target',
    } as ReviewScope;

    it('should return a review result', async () => {
        vi.mocked(git.getChangedFiles).mockResolvedValue(['file1', 'file2']);
        vi.mocked(model.sendRequest).mockResolvedValue('model response');
        vi.mocked(parseResponse).mockReturnValue([
            {
                file: 'file1',
                comment: 'Some review comment',
                line: 1,
                severity: 3,
            },
        ]);

        const result = await reviewDiff(
            config,
            { scope },
            progress,
            cancellationToken
        );

        expect(result.request.scope).toBe(scope);
        expect(result.fileComments).toHaveLength(2);
        expect(result.errors).toHaveLength(0);

        expect(progress.report).toHaveBeenCalledWith({
            message: 'file1...',
            increment: 50,
        });
        expect(progress.report).toHaveBeenCalledWith({
            message: 'file2...',
            increment: 50,
        });
        expect(model.sendRequest).toHaveBeenCalledTimes(2);
        expect(parseResponse).toHaveBeenCalledWith('model response');
    });

    it('aborts when cancelled', async () => {
        vi.mocked(git.getChangedFiles).mockResolvedValue(['file1', 'file2']);

        const cancellationToken = {
            isCancellationRequested: true,
        } as CancellationToken;

        const result = await reviewDiff(
            config,
            { scope },
            progress,
            cancellationToken
        );

        expect(model.sendRequest).not.toHaveBeenCalled();
        expect(result.request.scope).toBe(scope);
        expect(result.fileComments).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
    });

    it('should abort and return errors if a ModelError occurs', async () => {
        vi.mocked(git.getChangedFiles).mockResolvedValue(['file1', 'file2']);
        vi.mocked(model.sendRequest)
            .mockRejectedValueOnce(new ModelError('Blocked', 'Model error'))
            .mockResolvedValueOnce('model response');

        const result = await reviewDiff(
            config,
            { scope },
            progress,
            cancellationToken
        );

        expect(result.request.scope).toBe(scope);
        expect(result.fileComments).toHaveLength(0);
        expect(result.errors).toHaveLength(1);

        expect(progress.report).toHaveBeenCalledTimes(1);
        expect(model.sendRequest).toHaveBeenCalledTimes(1);
    });

    it('should continue and return errors if a non-ModelError occurs', async () => {
        vi.mocked(git.getChangedFiles).mockResolvedValue(['file1', 'file2']);
        vi.mocked(model.sendRequest)
            .mockRejectedValueOnce(new Error("Couldn't parse response"))
            .mockResolvedValueOnce('model response');

        const result = await reviewDiff(
            config,
            { scope },
            progress,
            cancellationToken
        );

        expect(result.request.scope).toBe(scope);
        expect(result.fileComments).toHaveLength(1);
        expect(result.errors).toHaveLength(1);

        expect(progress.report).toHaveBeenCalledTimes(2);
        expect(model.sendRequest).toHaveBeenCalledTimes(2);
    });
});

describe('createReviewPrompt', () => {
    it('creates prompt with custom prompt', async () => {
        const prompt = createReviewPrompt(
            'Various refactorings',
            'diff\nhere',
            'A CUSTOM PROMPT'
        );

        await expect(prompt).toMatchFileSnapshot('review-prompt.snap');
    });
});
