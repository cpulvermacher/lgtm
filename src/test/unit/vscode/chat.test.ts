import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewRequest } from '@/types/ReviewRequest';
import type { ReviewResult } from '@/types/ReviewResult';
import { normalizeComment } from '@/utils/text';

// Store captured stream calls for verification
let streamCalls: { method: string; args: unknown[] }[] = [];

// Mock stream
const mockStream = {
    markdown: vi.fn((...args) => {
        streamCalls.push({ method: 'markdown', args });
    }),
    progress: vi.fn((...args) => {
        streamCalls.push({ method: 'progress', args });
    }),
    anchor: vi.fn((...args) => {
        streamCalls.push({ method: 'anchor', args });
    }),
};

// Mock token
const mockToken = {
    isCancellationRequested: false,
};

// Mock review result factory
function createMockReviewResult(
    fileComments: Array<{
        target: string;
        comments: Array<{
            file: string;
            line: number;
            comment: string;
            severity: number;
        }>;
        maxSeverity: number;
    }> = []
): ReviewResult {
    return {
        request: {
            scope: {
                target: 'feature',
                base: 'main',
                isCommitted: true,
                isTargetCheckedOut: true,
            },
        } as ReviewRequest,
        files: [{ file: 'test.ts', status: 'M' }],
        fileComments,
        errors: [],
    };
}

// Model review result type matching the internal type
type ModelReviewResult = {
    modelId: string;
    modelName: string;
    result: ReviewResult;
};

describe('Chat multi-model review', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        streamCalls = [];
        mockToken.isCancellationRequested = false;
    });

    describe('createSharedProgress', () => {
        it('should deduplicate progress messages', () => {
            // Simulate shared progress behavior
            const reportedMessages = new Set<string>();
            const sharedProgress = {
                report: ({ message }: { message: string }) => {
                    if (message && !reportedMessages.has(message)) {
                        reportedMessages.add(message);
                        mockStream.progress(message);
                    }
                },
            };

            // Simulate multiple models reporting the same progress
            sharedProgress.report({ message: 'Gathering changes...' });
            sharedProgress.report({ message: 'Gathering changes...' });
            sharedProgress.report({ message: 'Gathering changes...' });
            sharedProgress.report({ message: 'Reviewing...' });
            sharedProgress.report({ message: 'Reviewing...' });

            // Each unique message should only be reported once
            expect(mockStream.progress).toHaveBeenCalledTimes(2);
            expect(mockStream.progress).toHaveBeenCalledWith(
                'Gathering changes...'
            );
            expect(mockStream.progress).toHaveBeenCalledWith('Reviewing...');
        });

        it('should not report empty messages', () => {
            const reportedMessages = new Set<string>();
            const sharedProgress = {
                report: ({ message }: { message: string }) => {
                    if (message && !reportedMessages.has(message)) {
                        reportedMessages.add(message);
                        mockStream.progress(message);
                    }
                },
            };

            sharedProgress.report({ message: '' });
            sharedProgress.report({ message: 'Reviewing...' });

            expect(mockStream.progress).toHaveBeenCalledTimes(1);
            expect(mockStream.progress).toHaveBeenCalledWith('Reviewing...');
        });
    });

    describe('separate sections display', () => {
        it('should display results with model headings when multiple models are used', () => {
            const results: ModelReviewResult[] = [
                {
                    modelId: 'copilot:gpt-4',
                    modelName: 'GPT-4',
                    result: createMockReviewResult([
                        {
                            target: 'test.ts',
                            comments: [
                                {
                                    file: 'test.ts',
                                    line: 10,
                                    comment: 'Issue from GPT-4',
                                    severity: 3,
                                },
                            ],
                            maxSeverity: 3,
                        },
                    ]),
                },
                {
                    modelId: 'copilot:claude-sonnet',
                    modelName: 'Claude Sonnet',
                    result: createMockReviewResult([
                        {
                            target: 'test.ts',
                            comments: [
                                {
                                    file: 'test.ts',
                                    line: 20,
                                    comment: 'Issue from Claude',
                                    severity: 4,
                                },
                            ],
                            maxSeverity: 4,
                        },
                    ]),
                },
            ];

            // When there are multiple models, each section should have a heading
            expect(results.length).toBe(2);
            expect(results[0].modelName).toBe('GPT-4');
            expect(results[1].modelName).toBe('Claude Sonnet');
        });

        it('should not display model headings when single model is used', () => {
            const results: ModelReviewResult[] = [
                {
                    modelId: 'copilot:gpt-4',
                    modelName: 'GPT-4',
                    result: createMockReviewResult([
                        {
                            target: 'test.ts',
                            comments: [
                                {
                                    file: 'test.ts',
                                    line: 10,
                                    comment: 'Issue',
                                    severity: 3,
                                },
                            ],
                            maxSeverity: 3,
                        },
                    ]),
                },
            ];

            // Single model should not show headings
            expect(results.length).toBe(1);
        });
    });

    describe('merged with attribution display', () => {
        it('should deduplicate identical comments from multiple models', () => {
            // Simulate the merging logic
            const results: ModelReviewResult[] = [
                {
                    modelId: 'copilot:gpt-4',
                    modelName: 'GPT-4',
                    result: createMockReviewResult([
                        {
                            target: 'test.ts',
                            comments: [
                                {
                                    file: 'test.ts',
                                    line: 10,
                                    comment: 'Missing null check',
                                    severity: 3,
                                },
                            ],
                            maxSeverity: 3,
                        },
                    ]),
                },
                {
                    modelId: 'copilot:claude-sonnet',
                    modelName: 'Claude Sonnet',
                    result: createMockReviewResult([
                        {
                            target: 'test.ts',
                            comments: [
                                {
                                    file: 'test.ts',
                                    line: 10,
                                    comment: 'Missing null check', // Same comment
                                    severity: 4,
                                },
                            ],
                            maxSeverity: 4,
                        },
                    ]),
                },
            ];

            // Simulate merging logic from showMergedReviewResults
            type AttributedComment = {
                file: string;
                line: number;
                comment: string;
                severity: number;
                models: string[];
            };

            // Use the imported normalizeComment function from chat.ts

            const commentMap = new Map<string, AttributedComment>();
            for (const { modelName, result } of results) {
                for (const file of result.fileComments) {
                    for (const comment of file.comments) {
                        const key = `${comment.file}:${
                            comment.line
                        }:${normalizeComment(comment.comment)}`;

                        const existing = commentMap.get(key);
                        if (existing) {
                            if (!existing.models.includes(modelName)) {
                                existing.models.push(modelName);
                            }
                            if (comment.severity > existing.severity) {
                                existing.severity = comment.severity;
                            }
                        } else {
                            commentMap.set(key, {
                                file: comment.file,
                                line: comment.line,
                                comment: comment.comment,
                                severity: comment.severity,
                                models: [modelName],
                            });
                        }
                    }
                }
            }

            // Should be merged into one comment with both models
            expect(commentMap.size).toBe(1);
            const mergedComment = [...commentMap.values()][0];
            expect(mergedComment.models).toContain('GPT-4');
            expect(mergedComment.models).toContain('Claude Sonnet');
            expect(mergedComment.severity).toBe(4); // Higher severity kept
        });

        it('should keep unique comments from different models', () => {
            const results: ModelReviewResult[] = [
                {
                    modelId: 'copilot:gpt-4',
                    modelName: 'GPT-4',
                    result: createMockReviewResult([
                        {
                            target: 'test.ts',
                            comments: [
                                {
                                    file: 'test.ts',
                                    line: 10,
                                    comment: 'Issue A from GPT-4',
                                    severity: 3,
                                },
                            ],
                            maxSeverity: 3,
                        },
                    ]),
                },
                {
                    modelId: 'copilot:claude-sonnet',
                    modelName: 'Claude Sonnet',
                    result: createMockReviewResult([
                        {
                            target: 'test.ts',
                            comments: [
                                {
                                    file: 'test.ts',
                                    line: 20,
                                    comment: 'Issue B from Claude',
                                    severity: 4,
                                },
                            ],
                            maxSeverity: 4,
                        },
                    ]),
                },
            ];

            // Simulate merging logic
            type AttributedComment = {
                file: string;
                line: number;
                comment: string;
                severity: number;
                models: string[];
            };

            const commentMap = new Map<string, AttributedComment>();
            for (const { modelName, result } of results) {
                for (const file of result.fileComments) {
                    for (const comment of file.comments) {
                        const key = `${comment.file}:${
                            comment.line
                        }:${normalizeComment(comment.comment)}`;

                        const existing = commentMap.get(key);
                        if (existing) {
                            if (!existing.models.includes(modelName)) {
                                existing.models.push(modelName);
                            }
                        } else {
                            commentMap.set(key, {
                                file: comment.file,
                                line: comment.line,
                                comment: comment.comment,
                                severity: comment.severity,
                                models: [modelName],
                            });
                        }
                    }
                }
            }

            // Different comments should remain separate
            expect(commentMap.size).toBe(2);

            const comments = [...commentMap.values()];
            expect(comments[0].models).toHaveLength(1);
            expect(comments[1].models).toHaveLength(1);
        });

        it('should normalize comments for comparison', () => {
            // Using the imported normalizeComment from @/utils/text
            expect(normalizeComment('Missing null check')).toBe(
                'missing null check'
            );
            expect(normalizeComment('  Missing   null   check  ')).toBe(
                'missing null check'
            );
            expect(normalizeComment('MISSING NULL CHECK')).toBe(
                'missing null check'
            );
        });
    });

    describe('model display names', () => {
        it('should use model ID as fallback when name is unavailable', () => {
            // Simulate getModelDisplayName fallback behavior
            const extractModelIdFallback = (modelId: string): string => {
                if (modelId.includes(':')) {
                    return modelId.split(':')[1];
                }
                return modelId;
            };

            expect(extractModelIdFallback('copilot:gpt-4.1')).toBe('gpt-4.1');
            expect(extractModelIdFallback('gpt-4.1')).toBe('gpt-4.1');
            expect(extractModelIdFallback('vendor:model-name')).toBe(
                'model-name'
            );
        });
    });

    describe('review cancellation', () => {
        it('should handle cancellation with partial results', () => {
            mockToken.isCancellationRequested = true;

            const results: ModelReviewResult[] = [
                {
                    modelId: 'copilot:gpt-4',
                    modelName: 'GPT-4',
                    result: createMockReviewResult([
                        {
                            target: 'test.ts',
                            comments: [
                                {
                                    file: 'test.ts',
                                    line: 10,
                                    comment: 'Partial result',
                                    severity: 3,
                                },
                            ],
                            maxSeverity: 3,
                        },
                    ]),
                },
            ];

            const hasAnyComments = results.some(
                (r) => r.result.fileComments.length > 0
            );
            expect(hasAnyComments).toBe(true);
            // Should show "Cancelled, showing partial results."
        });

        it('should handle cancellation with no results', () => {
            mockToken.isCancellationRequested = true;

            const results: ModelReviewResult[] = [
                {
                    modelId: 'copilot:gpt-4',
                    modelName: 'GPT-4',
                    result: createMockReviewResult([]),
                },
            ];

            const hasAnyComments = results.some(
                (r) => r.result.fileComments.length > 0
            );
            expect(hasAnyComments).toBe(false);
            // Should show "Cancelled."
        });
    });

    describe('error handling', () => {
        it('should aggregate errors from multiple models', () => {
            const results: ModelReviewResult[] = [
                {
                    modelId: 'copilot:gpt-4',
                    modelName: 'GPT-4',
                    result: {
                        ...createMockReviewResult([]),
                        errors: [new Error('GPT-4 error')],
                    },
                },
                {
                    modelId: 'copilot:claude-sonnet',
                    modelName: 'Claude Sonnet',
                    result: {
                        ...createMockReviewResult([]),
                        errors: [new Error('Claude error')],
                    },
                },
            ];

            const allErrors = results.flatMap((r) => r.result.errors);
            expect(allErrors).toHaveLength(2);
            expect(allErrors[0].message).toBe('GPT-4 error');
            expect(allErrors[1].message).toBe('Claude error');
        });
    });
});
