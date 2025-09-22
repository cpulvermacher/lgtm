import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CancellationToken } from 'vscode';

import { parseResponse } from '@/review/comment';
import { ModelRequest } from '@/review/ModelRequest';
import { reviewDiff } from '@/review/review';
import { Config } from '@/types/Config';
import { FileComments } from '@/types/FileComments';
import { Logger } from '@/types/Logger';
import { ModelError } from '@/types/ModelError';
import { ReviewScope } from '@/types/ReviewRequest';
import { Git } from '@/utils/git';

function createMockConfig() {
    const git = {
        getChangedFiles: vi.fn(),
        getFileDiff: vi.fn((_, __, path) => `diff for ${path}`),
    } as unknown as Git;

    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        setEnableDebug: vi.fn(),
        isDebugEnabled: vi.fn(() => false),
    } as Logger;

    const config = {
        git,
        getOptions: vi.fn(() => ({
            customPrompt: 'custom prompt',
            minSeverity: 3,
            excludeGlobs: [] as string[],
            enableDebugOutput: false,
            mergeFileReviewRequests: true,
            maxConcurrentModelRequests: 1,
        })),
        getModel: async () => 'model',
        logger,
    } as unknown as Config;
    return { config, git, logger };
}

const cancellationToken = {
    isCancellationRequested: false,
} as CancellationToken;

describe('reviewDiff', () => {
    vi.mock('@/review/comment', () => ({
        parseResponse: vi.fn(),
        sortFileCommentsBySeverity: vi.fn(
            (comments: Omit<FileComments, 'maxSeverity'>[]) => comments
        ),
    }));
    vi.mock('@/review/ModelRequest', () => ({
        ModelRequest: vi.fn(),
    }));

    let config: Config;
    let git: Git;
    const modelRequest = {
        addDiff: vi.fn(),
        sendRequest: vi.fn(),
        files: ['file1', 'file2'],
    } as Partial<ModelRequest> as ModelRequest;

    const progress = {
        report: vi.fn(),
    } as const;
    const scope = {
        changeDescription: 'chore: dummy change',
        revisionRangeDiff: 'base...target',
    } as ReviewScope;
    const reviewResponse = {
        response: 'model response',
        promptTokens: 4,
        responseTokens: 2,
    };
    const mockComments = [
        {
            file: 'file2',
            comment: 'Some review comment',
            line: 1,
            severity: 3,
        },
    ];

    const diffFiles = [
        {
            file: 'file1',
            status: 'A',
        },
        {
            file: 'file2',
            status: 'M',
        },
    ];

    beforeEach(() => {
        ({ config, git } = createMockConfig());

        vi.mocked(git.getChangedFiles).mockResolvedValue(diffFiles);
        vi.mocked(ModelRequest).mockImplementation(() => modelRequest);
    });
    it('should return a review result', async () => {
        vi.mocked(modelRequest.sendRequest).mockResolvedValueOnce(
            reviewResponse
        );
        vi.mocked(parseResponse).mockReturnValue(mockComments);

        const result = await reviewDiff(
            config,
            { scope },
            progress,
            cancellationToken
        );

        expect(result.request.scope).toBe(scope);
        expect(result.errors).toEqual([]);
        expect(result.fileComments).toHaveLength(1);

        expect(progress.report).toHaveBeenCalledWith({
            message: 'Gathering changes for 2 files...',
            increment: 50,
        });
        expect(progress.report).toHaveBeenCalledWith({
            message: 'Reviewing...',
            increment: -100,
        });
        expect(progress.report).toHaveBeenCalledTimes(3);

        expect(modelRequest.addDiff).toHaveBeenCalledTimes(2);
        expect(parseResponse).toHaveBeenCalledWith('model response');
    });

    it('skips deleted files', async () => {
        vi.mocked(git.getChangedFiles).mockResolvedValue([
            {
                file: 'file1',
                status: 'D',
            },
            {
                file: 'file2',
                status: 'M',
            },
        ]);

        vi.mocked(modelRequest.sendRequest).mockResolvedValueOnce(
            reviewResponse
        );
        vi.mocked(parseResponse).mockReturnValue(mockComments);

        const result = await reviewDiff(
            config,
            { scope },
            progress,
            cancellationToken
        );

        expect(result.request.scope).toBe(scope);
        expect(result.errors).toEqual([]);
        expect(result.fileComments).toHaveLength(1);

        expect(progress.report).toHaveBeenCalledWith({
            message: 'Gathering changes for 1 files...',
            increment: 100,
        });
        expect(progress.report).toHaveBeenCalledWith({
            message: 'Reviewing...',
            increment: -100,
        });
        expect(progress.report).toHaveBeenCalledTimes(2);

        expect(modelRequest.addDiff).toHaveBeenCalledTimes(1);
        expect(parseResponse).toHaveBeenCalledWith('model response');
    });

    it('merges file review requests if enabled', async () => {
        vi.mocked(modelRequest.sendRequest).mockResolvedValue(reviewResponse);
        vi.mocked(parseResponse).mockReturnValue(mockComments);

        const result = await reviewDiff(
            config,
            { scope },
            progress,
            cancellationToken
        );

        expect(modelRequest.addDiff).toHaveBeenCalledTimes(2);
        expect(modelRequest.sendRequest).toHaveBeenCalledTimes(1);
        expect(result.request.scope).toBe(scope);
        expect(result.fileComments).toHaveLength(1);
        expect(result.errors).toHaveLength(0);
        expect(progress.report).toHaveBeenCalledTimes(3);
    });

    it('does not merge file review requests if disabled', async () => {
        vi.mocked(modelRequest.sendRequest).mockResolvedValue(reviewResponse);
        vi.mocked(parseResponse).mockReturnValue(mockComments);
        vi.mocked(config.getOptions).mockReturnValue({
            customPrompt: 'custom prompt',
            minSeverity: 3,
            excludeGlobs: [] as string[],
            enableDebugOutput: false,
            chatModel: 'gpt-4.1',
            mergeFileReviewRequests: false,
            maxInputTokensFraction: 0.95,
            maxConcurrentModelRequests: 1,
        });

        const result = await reviewDiff(
            config,
            { scope },
            progress,
            cancellationToken
        );

        expect(modelRequest.addDiff).toHaveBeenCalledTimes(2);
        expect(modelRequest.sendRequest).toHaveBeenCalledTimes(2);
        expect(result.request.scope).toBe(scope);
        expect(result.fileComments).toHaveLength(1);
        expect(result.errors).toHaveLength(0);
        expect(progress.report).toHaveBeenCalledTimes(4);
    });

    it('corrects file names if there is a mismatch', async () => {
        vi.mocked(modelRequest.sendRequest).mockResolvedValue(reviewResponse);
        vi.mocked(parseResponse).mockReturnValue([
            {
                ...mockComments[0],
                file: 'ile1',
            },
        ]);

        const result = await reviewDiff(
            config,
            { scope },
            progress,
            cancellationToken
        );

        expect(result.request.scope).toBe(scope);
        expect(result.errors).toHaveLength(0);
        expect(result.fileComments).toHaveLength(1);
        expect(result.fileComments[0].target).toBe('file1');
        expect(config.logger.info).toHaveBeenCalledWith(
            'File name mismatch, correcting "ile1" to "file1"!'
        );
    });

    it('aborts when cancelled', async () => {
        const cancellationToken = {
            isCancellationRequested: true,
        } as CancellationToken;

        const result = await reviewDiff(
            config,
            { scope },
            progress,
            cancellationToken
        );

        expect(modelRequest.addDiff).not.toHaveBeenCalled();
        expect(modelRequest.sendRequest).not.toHaveBeenCalled();
        expect(result.request.scope).toBe(scope);
        expect(result.fileComments).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
        expect(progress.report).not.toHaveBeenCalled();
    });

    it('should abort and return errors if a ModelError occurs', async () => {
        vi.mocked(modelRequest.sendRequest).mockRejectedValueOnce(
            new ModelError('Blocked', 'Model error')
        );

        const result = await reviewDiff(
            config,
            { scope },
            progress,
            cancellationToken
        );

        expect(result.request.scope).toBe(scope);
        expect(result.fileComments).toHaveLength(0);
        expect(result.errors).toHaveLength(1);

        expect(progress.report).toHaveBeenCalledTimes(3);
        expect(modelRequest.sendRequest).toHaveBeenCalledTimes(1);
    });

    it('should continue and return errors if a non-ModelError occurs', async () => {
        vi.mocked(modelRequest.addDiff)
            .mockResolvedValueOnce()
            .mockRejectedValueOnce(new Error('modelrequest full'));

        vi.mocked(parseResponse).mockReturnValue(mockComments);
        const nonModelError = new Error('review failed');
        vi.mocked(modelRequest.sendRequest)
            .mockRejectedValueOnce(nonModelError)
            .mockResolvedValueOnce(reviewResponse);

        const result = await reviewDiff(
            config,
            { scope },
            progress,
            cancellationToken
        );

        expect(modelRequest.addDiff).toHaveBeenCalledTimes(3);
        expect(modelRequest.sendRequest).toHaveBeenCalledTimes(2);

        expect(result.request.scope).toBe(scope);
        expect(result.fileComments).toHaveLength(1);
        expect(result.errors).toEqual([nonModelError]);

        expect(progress.report).toHaveBeenCalledTimes(4);
        expect(parseResponse).toHaveBeenCalledOnce();
        expect(parseResponse).toHaveBeenCalledWith('model response');
    });

    it('skips files with empty diff', async () => {
        vi.mocked(git.getFileDiff).mockResolvedValueOnce('');
        vi.mocked(git.getFileDiff).mockResolvedValueOnce('diff for file2');

        vi.mocked(modelRequest.sendRequest).mockResolvedValueOnce(
            reviewResponse
        );
        vi.mocked(parseResponse).mockReturnValue(mockComments);

        const result = await reviewDiff(
            config,
            { scope },
            progress,
            cancellationToken
        );

        expect(result.request.scope).toBe(scope);
        expect(result.errors).toEqual([]);
        expect(result.fileComments).toHaveLength(1);

        expect(modelRequest.addDiff).toHaveBeenCalledTimes(1);
        expect(parseResponse).toHaveBeenCalledOnce();
    });
});
