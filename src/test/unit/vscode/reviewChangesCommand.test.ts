import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

import { reviewDiff } from '@/review/review';
import type { Config, Options } from '@/types/Config';
import { UncommittedRef } from '@/types/Ref';
import type { ReviewRequest } from '@/types/ReviewRequest';
import type { ReviewResult } from '@/types/ReviewResult';
import type { Git } from '@/utils/git';
import { getConfig } from '@/vscode/config';
import {
    type ReviewChangesCommandOptions,
    reviewChangesCommand,
} from '@/vscode/reviewChangesCommand';

const progressReport = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
    ProgressLocation: { Notification: 15 },
    lm: { selectChatModels: vi.fn() },
    window: {
        withProgress: vi.fn((_options, task) =>
            task({ report: progressReport }, { isCancellationRequested: false })
        ),
    },
    chat: { createChatParticipant: vi.fn() },
    Uri: { joinPath: vi.fn() },
}));

vi.mock('@/review/review', () => ({ reviewDiff: vi.fn() }));
vi.mock('@/vscode/config', () => ({ getConfig: vi.fn() }));
vi.mock('@/vscode/ui', () => ({
    pickRef: vi.fn(),
    pickRefs: vi.fn(),
    promptToCheckout: vi.fn(),
}));
vi.mock('@/vscode/uri', () => ({
    toCommandLink: vi.fn(),
    toUri: vi.fn(),
}));

function createReviewResult(
    request: ReviewRequest,
    providerId = 'copilot:gpt-4.1'
): ReviewResult {
    return {
        request,
        files: [{ file: `${providerId}.ts`, status: 'M' }],
        fileComments: [
            {
                target: 'src/file.ts',
                comments: [
                    {
                        file: 'src/file.ts',
                        line: 10,
                        comment: `Issue from ${providerId}`,
                        severity: 4,
                    },
                    {
                        file: 'src/file.ts',
                        line: 11,
                        comment: 'Below threshold',
                        severity: 2,
                    },
                    {
                        file: 'src/file.ts',
                        line: 0,
                        comment: 'Invalid line',
                        severity: 5,
                    },
                ],
                maxSeverity: 5,
            },
        ],
        errors: [new Error(`Recoverable ${providerId} error`)],
    };
}

function createConfig(): Config {
    const git = {
        getCommitRef: vi.fn(async (ref: string) => ref),
        isUncommitted: vi.fn(
            (ref) =>
                ref === UncommittedRef.Staged || ref === UncommittedRef.Unstaged
        ),
        isValidRefPair: vi.fn((refs) => Boolean(refs?.target)),
        isInitialCommit: vi.fn(async () => false),
        isBranch: vi.fn(async (ref: string) => ref === 'feature-branch'),
        getReviewScope: vi.fn(async (target, base) => {
            if (
                target === UncommittedRef.Staged ||
                target === UncommittedRef.Unstaged
            ) {
                return {
                    target,
                    isCommitted: false,
                    isTargetCheckedOut: true,
                    changeDescription: undefined,
                };
            }

            return {
                target,
                base,
                isCommitted: true,
                isTargetCheckedOut: true,
                revisionRangeDiff: `${base}...${target}`,
                revisionRangeLog: `${base}..${target}`,
                changeDescription: 'Commit messages',
            };
        }),
    } as unknown as Git;

    return {
        git,
        getModel: vi.fn(),
        getOptions: vi.fn(() => createOptions()),
        logger: {
            debug: vi.fn(),
            info: vi.fn(),
            setEnableDebug: vi.fn(),
            isDebugEnabled: vi.fn(),
        },
    } as unknown as Config;
}

function createOptions(overrides: Partial<Options> = {}): Options {
    return {
        minSeverity: 3,
        customPrompt: '',
        contextFiles: [],
        excludeGlobs: [],
        enableDebugOutput: false,
        chatModel: 'copilot:gpt-4.1',
        preferredModels: ['copilot:claude', 'copilot-code-review'],
        selectChatModelForReview: 'Use default',
        outputModeWithMultipleModels: 'Separate sections',
        maxInputTokensFraction: 0.95,
        maxConcurrentModelRequests: 2,
        saveOutputToFile: false,
        autoCheckoutTarget: 'never',
        includeDeletedFiles: true,
        ...overrides,
    };
}

describe('reviewChangesCommand', () => {
    let config: Config;

    beforeEach(() => {
        vi.clearAllMocks();
        config = createConfig();
        vi.mocked(getConfig).mockResolvedValue(config);
        vi.mocked(vscode.lm.selectChatModels).mockResolvedValue([
            {
                vendor: 'copilot',
                id: 'gpt-4.1',
                name: 'GPT 4.1',
            },
            {
                vendor: 'copilot',
                id: 'claude',
                name: 'Claude',
            },
        ] as vscode.LanguageModelChat[]);
        vi.mocked(reviewDiff).mockImplementation(
            async (_config, request, options) =>
                createReviewResult(
                    request,
                    options?.providerId ?? 'copilot:gpt-4.1'
                )
        );
    });

    it('should review staged changes with the configured chat model by default', async () => {
        const result = await reviewChangesCommand('staged');

        expect(config.git.getReviewScope).toHaveBeenCalledWith(
            UncommittedRef.Staged,
            undefined
        );
        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({
                location: vscode.ProgressLocation.Notification,
                title: 'Reviewing staged changes using GPT 4.1...',
                cancellable: true,
            }),
            expect.any(Function)
        );
        expect(reviewDiff).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({
                scope: expect.objectContaining({
                    target: UncommittedRef.Staged,
                }),
            }),
            expect.objectContaining({ providerId: 'copilot:gpt-4.1' })
        );
        expect(result.cancelled).toBe(false);
        expect(result.comments).toEqual([
            expect.objectContaining({
                comment: 'Issue from copilot:gpt-4.1',
                modelId: 'copilot:gpt-4.1',
                modelName: 'GPT 4.1',
            }),
        ]);
        expect(result.errors).toEqual([
            expect.objectContaining({
                modelId: 'copilot:gpt-4.1',
                message: 'Recoverable copilot:gpt-4.1 error',
            }),
        ]);
        expect(config.logger.info).toHaveBeenCalledWith(
            'lgtm.reviewChanges called',
            { args: ['staged'] }
        );
        expect(config.logger.info).toHaveBeenCalledWith(
            'lgtm.reviewChanges prepared',
            expect.objectContaining({
                prompt: 'staged',
                scope: {
                    kind: 'staged',
                    target: UncommittedRef.Staged,
                },
                models: [
                    {
                        id: 'copilot:gpt-4.1',
                        name: 'GPT 4.1',
                    },
                ],
            })
        );
    });

    it('should review unstaged changes from object-style arguments', async () => {
        await reviewChangesCommand({ unstaged: true });

        expect(config.git.getReviewScope).toHaveBeenCalledWith(
            UncommittedRef.Unstaged,
            undefined
        );
    });

    it('should review topic/base refs and expand preferred models', async () => {
        const options: ReviewChangesCommandOptions = {
            topic: 'feature-branch',
            base: 'main',
            models: 'preferred',
        };

        const result = await reviewChangesCommand(options);

        expect(config.git.getReviewScope).toHaveBeenCalledWith(
            'feature-branch',
            'main'
        );
        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Reviewing changes on feature-branch compared to main using GPT 4.1, Claude, Copilot Code Review...',
            }),
            expect.any(Function)
        );
        expect(reviewDiff).toHaveBeenCalledTimes(3);
        expect(result.results.map((item) => item.modelId)).toEqual([
            'copilot:gpt-4.1',
            'copilot:claude',
            'copilot-code-review',
        ]);
        expect(config.logger.info).toHaveBeenCalledWith(
            'lgtm.reviewChanges prepared',
            expect.objectContaining({
                prompt: 'feature-branch main',
                scope: expect.objectContaining({
                    kind: 'branch',
                    target: 'feature-branch',
                    base: 'main',
                    revisionRangeDiff: 'main...feature-branch',
                    revisionRangeLog: 'main..feature-branch',
                    isTargetCheckedOut: true,
                }),
                models: [
                    { id: 'copilot:gpt-4.1', name: 'GPT 4.1' },
                    { id: 'copilot:claude', name: 'Claude' },
                    { id: 'copilot-code-review', name: 'Copilot Code Review' },
                ],
            })
        );
    });

    it('should accept positional topic/base refs and explicit models', async () => {
        await reviewChangesCommand('feature-branch', 'main', [
            'copilot:gpt-4.1',
            'copilot:claude',
        ]);

        expect(reviewDiff).toHaveBeenCalledTimes(2);
        expect(reviewDiff).toHaveBeenNthCalledWith(
            2,
            expect.any(Object),
            expect.any(Object),
            expect.objectContaining({ providerId: 'copilot:claude' })
        );
    });

    it('should accept string provider aliases from object-style arguments', async () => {
        const options: ReviewChangesCommandOptions = {
            staged: true,
            reviewProviderIds: 'copilot:claude',
        };

        const result = await reviewChangesCommand(options);

        expect(result.results.map((item) => item.modelId)).toEqual([
            'copilot:claude',
        ]);
    });

    it('should treat staged and unstaged option targets as refs when base is provided', async () => {
        await reviewChangesCommand({ target: 'staged', base: 'main' });

        expect(config.git.getReviewScope).toHaveBeenCalledWith(
            'staged',
            'main'
        );
    });

    it('should forward notification increments without duplicating progress messages', async () => {
        vi.mocked(reviewDiff).mockImplementation(
            async (_config, request, options) => {
                options?.progress?.report({
                    message: 'Gathering changes...',
                    increment: 10,
                });
                options?.progress?.report({
                    message: 'Gathering changes...',
                    increment: 15,
                });
                options?.progress?.report({
                    message: '',
                    increment: 5,
                });
                return createReviewResult(
                    request,
                    options?.providerId ?? 'copilot:gpt-4.1'
                );
            }
        );

        await reviewChangesCommand('staged');

        expect(progressReport).toHaveBeenCalledWith({
            message: 'Gathering changes...',
            increment: 10,
        });
        expect(progressReport).toHaveBeenCalledWith({ increment: 15 });
        expect(progressReport).toHaveBeenCalledWith({ increment: 5 });
    });

    it('should return command-level model failures with successful results', async () => {
        const failure = new Error('hard model failure');
        vi.mocked(reviewDiff)
            .mockResolvedValueOnce(
                createReviewResult(
                    {
                        scope: {
                            target: UncommittedRef.Staged,
                            isCommitted: false,
                            isTargetCheckedOut: true,
                        },
                    } as ReviewRequest,
                    'copilot:gpt-4.1'
                )
            )
            .mockRejectedValueOnce(failure);

        const result = await reviewChangesCommand('staged', [
            'copilot:gpt-4.1',
            'copilot:claude',
        ]);

        expect(result.results).toHaveLength(1);
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    modelId: 'copilot:claude',
                    modelName: 'Claude',
                    message: 'hard model failure',
                }),
            ])
        );
    });

    it('should reject invalid command argument shapes', async () => {
        await expect(
            reviewChangesCommand({ target: 'feature' })
        ).rejects.toThrow(
            "Expected 'staged', 'unstaged', or both target/topic and base refs."
        );
        await expect(reviewChangesCommand('feature')).rejects.toThrow(
            'Expected a base ref after the target ref.'
        );
        await expect(reviewChangesCommand('staged', 123)).rejects.toThrow(
            "Expected models to be omitted, 'preferred', a model ID, or an array of model IDs."
        );
        await expect(
            reviewChangesCommand({ staged: true, unstaged: true })
        ).rejects.toThrow(
            "Expected exactly one change scope: 'staged' or 'unstaged'."
        );
        await expect(
            reviewChangesCommand({
                staged: true,
                models: [123] as unknown as string[],
            })
        ).rejects.toThrow(
            "Expected models to be omitted, 'preferred', a model ID, or an array of model IDs."
        );
    });

    it('should use the default model when model arguments normalize to empty', async () => {
        const resultFromEmptyList = await reviewChangesCommand({
            staged: true,
            models: [],
        });
        const resultFromBlankValues = await reviewChangesCommand({
            staged: true,
            models: [' ', '\t'],
        });

        expect(resultFromEmptyList.results.map((item) => item.modelId)).toEqual(
            ['copilot:gpt-4.1']
        );
        expect(
            resultFromBlankValues.results.map((item) => item.modelId)
        ).toEqual(['copilot:gpt-4.1']);
    });

    it('should use the default model when preferred model configuration is empty', async () => {
        vi.mocked(config.getOptions).mockReturnValue(
            createOptions({
                preferredModels: [],
            })
        );

        const result = await reviewChangesCommand({
            staged: true,
            models: 'preferred',
        });

        expect(result.results.map((item) => item.modelId)).toEqual([
            'copilot:gpt-4.1',
        ]);
    });
});
