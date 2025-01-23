import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CancellationToken } from 'vscode';

import { parseResponse } from '../../../review/comment';
import { ModelRequest } from '../../../review/ModelRequest';
import { reviewDiff } from '../../../review/review';
import { Config } from '../../../types/Config';
import { FileComments } from '../../../types/FileComments';
import { Logger } from '../../../types/Logger';
import { ModelError } from '../../../types/ModelError';
import { ReviewScope } from '../../../types/ReviewRequest';
import { Git } from '../../../utils/git';

function createMockConfig() {
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
        getOptions: () => ({
            customPrompt: 'custom prompt',
            minSeverity: 3,
            excludeGlobs: [] as string[],
            enableDebugOutput: false,
        }),
        logger,
    } as Config;
    return { config, git, logger };
}

const cancellationToken = {
    isCancellationRequested: false,
} as CancellationToken;

describe('reviewDiff', () => {
    vi.mock('../../../review/comment', () => ({
        parseResponse: vi.fn(),
        sortFileCommentsBySeverity: vi.fn(
            (comments: Omit<FileComments, 'maxSeverity'>[]) => comments
        ),
    }));
    vi.mock('../../../review/ModelRequest', () => ({
        ModelRequest: vi.fn(),
    }));

    let config: Config;
    let git: Git;
    const modelRequest = {
        addDiff: vi.fn(),
        getReviewResponse: vi.fn(),
        files: ['file1', 'file2'],
    } as unknown as ModelRequest;
    beforeEach(() => {
        ({ config, git } = createMockConfig());

        vi.mocked(ModelRequest).mockImplementation(() => modelRequest);
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
        vi.mocked(modelRequest.getReviewResponse).mockResolvedValueOnce({
            response: 'model response',
            promptTokens: 4,
            responseTokens: 2,
        });
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
        expect(result.errors).toEqual([]);
        expect(result.fileComments).toHaveLength(1);

        expect(progress.report).toHaveBeenCalledWith({
            message: 'Gathering changes...',
            increment: 50,
        });
        expect(progress.report).toHaveBeenCalledWith({
            message: 'Reviewing...',
            increment: 0,
        });
        expect(progress.report).toHaveBeenCalledTimes(3);

        expect(modelRequest.addDiff).toHaveBeenCalledTimes(2);
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

        expect(modelRequest.addDiff).not.toHaveBeenCalled();
        expect(modelRequest.getReviewResponse).not.toHaveBeenCalled();
        expect(result.request.scope).toBe(scope);
        expect(result.fileComments).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
    });

    it('should abort and return errors if a ModelError occurs', async () => {
        vi.mocked(git.getChangedFiles).mockResolvedValue(['file1', 'file2']);
        vi.mocked(modelRequest.getReviewResponse).mockRejectedValueOnce(
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
        expect(modelRequest.getReviewResponse).toHaveBeenCalledTimes(1);
    });

    it('should continue and return errors if a non-ModelError occurs', async () => {
        vi.mocked(git.getChangedFiles).mockResolvedValue(['file1', 'file2']);
        vi.mocked(modelRequest.addDiff)
            .mockResolvedValueOnce()
            .mockRejectedValueOnce(new Error('modelrequest full'));

        vi.mocked(parseResponse).mockReturnValue([
            {
                file: 'file1',
                comment: 'Some review comment',
                line: 1,
                severity: 3,
            },
        ]);
        const nonModelError = new Error('review failed');
        vi.mocked(modelRequest.getReviewResponse)
            .mockRejectedValueOnce(nonModelError)
            .mockResolvedValueOnce({
                response: 'model response',
                promptTokens: 4,
                responseTokens: 2,
            });

        const result = await reviewDiff(
            config,
            { scope },
            progress,
            cancellationToken
        );

        expect(modelRequest.addDiff).toHaveBeenCalledTimes(3);
        expect(modelRequest.getReviewResponse).toHaveBeenCalledTimes(2);

        expect(result.request.scope).toBe(scope);
        expect(result.fileComments).toHaveLength(1);
        expect(result.errors).toEqual([nonModelError]);

        expect(progress.report).toHaveBeenCalledTimes(4);
        expect(parseResponse).toHaveBeenCalledOnce();
        expect(parseResponse).toHaveBeenCalledWith('model response');
    });
});
