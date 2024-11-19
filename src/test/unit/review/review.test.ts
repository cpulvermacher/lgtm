import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CancellationToken, ChatResponseStream } from 'vscode';

import { parseResponse } from '../../../review/comment';
import { getReviewResponse, reviewDiff } from '../../../review/review';
import { Config } from '../../../types/Config';
import { Model } from '../../../types/Model';
import { ModelError } from '../../../types/ModelError';
import { ReviewScope } from '../../../types/ReviewScope';
import { getChangedFiles } from '../../../utils/git';

describe('review', () => {
    const model = {
        sendRequest: vi.fn(async () => {
            return 'Some review comment\n3/5';
        }),
        limitTokens: vi.fn(async (text: string) => text),
        countTokens: vi.fn(async () => 4),
    } as Model;

    const config = {
        model,
        getOptions: () => ({
            customPrompt: '',
            minSeverity: 3,
            excludeGlobs: [] as string[],
            enableDebugOutput: false,
        }),
    } as Config;

    const diff = 'Some diff content';
    const cancellationToken = {
        isCancellationRequested: false,
    } as CancellationToken;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getReviewResponse', () => {
        it('should return a comment and severity', async () => {
            const result = await getReviewResponse(
                config,
                'chore: dummy change',
                diff,
                cancellationToken
            );

            expect(result.response).toBe('Some review comment\n3/5');
            expect(result.promptTokens).toBe(4);
            expect(result.responseTokens).toBe(4);
            expect(model.limitTokens).toHaveBeenCalledWith(diff);
            expect(model.sendRequest).toHaveBeenCalledWith(
                expect.stringMatching(/^\nYou are a senior software engineer/),
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
                    cancellationToken
                );
            }).rejects.toThrow('Stream error');
        });
    });

    describe('reviewDiff', () => {
        vi.mock('../../../utils/git', () => ({
            getChangedFiles: vi.fn(),
            getFileDiff: vi.fn((_, __, path) => `diff for ${path}`),
        }));
        vi.mock('../../../review/comment', () => ({
            parseResponse: vi.fn(),
            sortFileCommentsBySeverity: vi.fn((comments) => comments),
        }));

        const stream = {
            markdown: vi.fn(),
            anchor: vi.fn(),
            progress: vi.fn(),
        } as unknown as ChatResponseStream;

        const scope = {
            changeDescription: 'chore: dummy change',
            revisionRangeDiff: 'base...target',
        } as ReviewScope;

        it('should return a review result', async () => {
            vi.mocked(getChangedFiles).mockResolvedValue(['file1', 'file2']);
            vi.mocked(model.sendRequest).mockResolvedValue('model response');
            vi.mocked(parseResponse).mockReturnValue([
                {
                    comment: 'Some review comment',
                    line: 1,
                    severity: 3,
                },
            ]);

            const result = await reviewDiff(
                config,
                stream,
                scope,
                cancellationToken
            );

            expect(result.scope).toBe(scope);
            expect(result.fileComments).toHaveLength(2);
            expect(result.errors).toHaveLength(0);

            expect(stream.markdown).toHaveBeenCalledWith(' Found 2 files.\n\n');
            expect(stream.progress).toHaveBeenCalledWith(
                'Reviewing file file1 (1/2)'
            );
            expect(stream.progress).toHaveBeenCalledWith(
                'Reviewing file file2 (2/2)'
            );
            expect(model.sendRequest).toHaveBeenCalledTimes(2);
            expect(parseResponse).toHaveBeenCalledWith('model response');
        });

        it('should abort and return errors if a ModelError occurs', async () => {
            vi.mocked(getChangedFiles).mockResolvedValue(['file1', 'file2']);
            vi.mocked(model.sendRequest)
                .mockRejectedValueOnce(new ModelError('Blocked', 'Model error'))
                .mockResolvedValueOnce('model response');

            const result = await reviewDiff(
                config,
                stream,
                scope,
                cancellationToken
            );

            expect(result.scope).toBe(scope);
            expect(result.fileComments).toHaveLength(0);
            expect(result.errors).toHaveLength(1);

            expect(stream.markdown).toHaveBeenCalledWith(' Found 2 files.\n\n');
            expect(stream.progress).toHaveBeenCalledTimes(1);
            expect(model.sendRequest).toHaveBeenCalledTimes(1);
        });

        it('should continue and return errors if a non-ModelError occurs', async () => {
            vi.mocked(getChangedFiles).mockResolvedValue(['file1', 'file2']);
            vi.mocked(model.sendRequest)
                .mockRejectedValueOnce(new Error("Couldn't parse response"))
                .mockResolvedValueOnce('model response');

            const result = await reviewDiff(
                config,
                stream,
                scope,
                cancellationToken
            );

            expect(result.scope).toBe(scope);
            expect(result.fileComments).toHaveLength(1);
            expect(result.errors).toHaveLength(1);

            expect(stream.markdown).toHaveBeenCalledWith(' Found 2 files.\n\n');
            expect(stream.progress).toHaveBeenCalledTimes(2);
            expect(model.sendRequest).toHaveBeenCalledTimes(2);
        });
    });
});
