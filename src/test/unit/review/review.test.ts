import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CancellationToken, ChatResponseStream } from 'vscode';

import { parseResponse } from '../../../review/comment';
import {
    getReviewResponse,
    removeExcludedFiles,
    reviewDiff,
} from '../../../review/review';
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

    describe('removeExcludedFiles', () => {
        it('does not filter for empty exclude list', () => {
            const files = ['file1', 'file2', 'file3'];

            const result = removeExcludedFiles(files, []);

            expect(result).toEqual(files);
        });

        it('filters by basename for non-globs', () => {
            const files = ['path/file1', 'path/file2', 'path'];

            const result = removeExcludedFiles(files, ['file1', '2', 'path']);

            expect(result).toEqual(['path/file2']);
        });

        it('filters path by wildcard', () => {
            const files = ['path/file1', 'path/file2', 'path'];

            const result = removeExcludedFiles(files, ['*2', 'path*']);

            expect(result).toEqual(['path/file1']);
        });

        it('filters path by globstar', () => {
            const files = ['path/file1', 'path/file2', 'path'];

            const result = removeExcludedFiles(files, ['path/**']);

            expect(result).toEqual(['path']);
        });

        it('filters filenames by globstar', () => {
            const files = ['path/file.txt', 'file.txt', 'otherfile.txt'];

            expect(removeExcludedFiles(files, ['**file.txt'])).toEqual([]);
            expect(removeExcludedFiles(files, ['**/file.txt'])).toEqual([
                'otherfile.txt',
            ]);
        });

        it('filters filenames by ?', () => {
            const files = ['file1.txt', 'file2.txt', 'file99.txt'];

            const result = removeExcludedFiles(files, ['file?.txt']);

            expect(result).toEqual(['file99.txt']);
        });

        it('filters with group conditions', () => {
            const files = [
                'abc.ts',
                'path/def.ts',
                'path/ghi.js',
                'jkl.js',
                'nested/path/mno.ts',
                'some.json',
                'dir.ts/foo',
            ];

            const result = removeExcludedFiles(files, ['**/*.{ts,js}']);

            expect(result).toEqual(['some.json', 'dir.ts/foo']);
        });

        it('filters with character range', () => {
            const files = ['file1.txt', 'file2.txt', 'file99.txt'];

            const result = removeExcludedFiles(files, ['file[2-9].txt']);

            expect(result).toEqual(['file1.txt', 'file99.txt']);
        });

        it('filters with negated character range', () => {
            const files = ['file1.txt', 'file2.txt', 'file9.txt'];

            const result = removeExcludedFiles(files, ['file[^2].txt']);

            expect(result).toEqual(['file2.txt']);
        });
    });
});
