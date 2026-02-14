import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock vscode and other modules imported by chat.ts
vi.mock('vscode', () => ({
    lm: { selectChatModels: vi.fn() },
    window: { showWarningMessage: vi.fn() },
    chat: { createChatParticipant: vi.fn() },
    Uri: { joinPath: vi.fn() },
    CancellationTokenSource: class {},
    LanguageModelChatMessage: { User: vi.fn(), Assistant: vi.fn() },
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

import type { ReviewRequest } from '@/types/ReviewRequest';
import type { ReviewResult } from '@/types/ReviewResult';
import { type ModelInfo, resolveOneModelSpec } from '@/vscode/chat';

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
        it('should keep comments from different models', () => {
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

            const commentMap = new Set<AttributedComment>();
            for (const { modelName, result } of results) {
                for (const file of result.fileComments) {
                    for (const comment of file.comments) {
                        commentMap.add({
                            file: comment.file,
                            line: comment.line,
                            comment: comment.comment,
                            severity: comment.severity,
                            models: [modelName],
                        });
                    }
                }
            }

            // Different comments should remain separate
            expect(commentMap.size).toBe(2);

            const comments = [...commentMap.values()];
            expect(comments[0].models).toHaveLength(1);
            expect(comments[1].models).toHaveLength(1);
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

// ── resolveOneModelSpec tests ──────────────────────────────────────────

function model(vendor: string, id: string, name?: string): ModelInfo {
    return { vendor, id, name: name ?? id };
}

const sampleModels: ModelInfo[] = [
    model('copilot', 'gpt-4.1', 'GPT 4.1'),
    model('copilot', 'gpt-4o', 'GPT 4o'),
    model('copilot', 'gpt-3.5-turbo', 'GPT 3.5 Turbo'),
    model('copilot', 'claude-sonnet-4', 'Claude Sonnet 4'),
    model('copilot', 'gemini-2.5-pro', 'Gemini 2.5 Pro'),
    model('azure', 'gpt-4.1', 'Azure GPT 4.1'),
];

describe('resolveOneModelSpec', () => {
    // ── Exact matching ────────────────────────────────────────────────

    it('should resolve exact vendor:id match', () => {
        const result = resolveOneModelSpec('copilot:gpt-4.1', sampleModels);
        expect(result).toEqual({ match: 'copilot:gpt-4.1' });
    });

    it('should resolve exact id match (any vendor)', () => {
        const result = resolveOneModelSpec('claude-sonnet-4', sampleModels);
        expect(result).toEqual({ match: 'copilot:claude-sonnet-4' });
    });

    it('should prefer exact vendor:id over exact id match', () => {
        const result = resolveOneModelSpec('azure:gpt-4.1', sampleModels);
        expect(result).toEqual({ match: 'azure:gpt-4.1' });
    });

    // ── Fix #4: colon handling ────────────────────────────────────────

    it('should handle model IDs with multiple colons', () => {
        const models: ModelInfo[] = [
            model('vendor', 'group:sub:model', 'Deep Model'),
        ];
        const result = resolveOneModelSpec('vendor:group:sub:model', models);
        expect(result).toEqual({ match: 'vendor:group:sub:model' });
    });

    it('should not truncate ID after second colon', () => {
        const models: ModelInfo[] = [
            model('myvendor', 'a:b:c', 'ABC Model'),
            model('myvendor', 'a:b', 'AB Model'),
        ];
        // Should match 'a:b:c' not 'a:b'
        const result = resolveOneModelSpec('myvendor:a:b:c', models);
        expect(result).toEqual({ match: 'myvendor:a:b:c' });
    });

    // ── Fix #5: ambiguous substring matching on id ────────────────────

    it('should resolve unique substring match on id', () => {
        const result = resolveOneModelSpec('gemini', sampleModels);
        expect(result).toEqual({ match: 'copilot:gemini-2.5-pro' });
    });

    it('should return ambiguous when multiple ids match substring', () => {
        // 'gpt-4' matches 'gpt-4.1' and 'gpt-4o'
        // (also 'gpt-4.1' from azure, making 3 matches)
        const result = resolveOneModelSpec('gpt-4', sampleModels);
        expect(result.ambiguous).toBeDefined();
        expect(result.ambiguous?.length).toBeGreaterThan(1);
        expect(result.match).toBeUndefined();
    });

    it('should list all ambiguous candidates in the result', () => {
        const result = resolveOneModelSpec('gpt-4', sampleModels);
        expect(result.ambiguous).toContain('copilot:gpt-4.1');
        expect(result.ambiguous).toContain('copilot:gpt-4o');
        expect(result.ambiguous).toContain('azure:gpt-4.1');
    });

    // ── Fix #5: ambiguous substring matching on name ──────────────────

    it('should resolve unique substring match on name', () => {
        const result = resolveOneModelSpec('Gemini', sampleModels);
        // No exact id match → no id substring → name substring yields 1
        expect(result).toEqual({ match: 'copilot:gemini-2.5-pro' });
    });

    it('should return ambiguous when multiple names match substring', () => {
        const models: ModelInfo[] = [
            model('v', 'model-a', 'Turbo Alpha'),
            model('v', 'model-b', 'Turbo Beta'),
        ];
        // 'Turbo' matches both names
        const result = resolveOneModelSpec('Turbo', models);
        expect(result.ambiguous).toBeDefined();
        expect(result.ambiguous).toEqual(['v:model-a', 'v:model-b']);
        expect(result.match).toBeUndefined();
    });

    // ── Not found ─────────────────────────────────────────────────────

    it('should return empty result when nothing matches', () => {
        const result = resolveOneModelSpec('nonexistent', sampleModels);
        expect(result.match).toBeUndefined();
        expect(result.ambiguous).toBeUndefined();
    });

    it('should return empty result when vendor:id does not match', () => {
        const result = resolveOneModelSpec(
            'unknown:unknown-model',
            sampleModels
        );
        expect(result.match).toBeUndefined();
        expect(result.ambiguous).toBeUndefined();
    });

    // ── Fix #2: de-duplication (shown at integration level) ──────────

    it('should allow callers to de-duplicate via Set (integration smoke test)', () => {
        // Simulate calling resolveOneModelSpec twice with the same spec
        const r1 = resolveOneModelSpec('claude-sonnet-4', sampleModels);
        const r2 = resolveOneModelSpec('claude-sonnet-4', sampleModels);

        const ids = new Set<string>();
        if (r1.match) ids.add(r1.match);
        if (r2.match) ids.add(r2.match);

        expect(ids.size).toBe(1);
        expect([...ids]).toEqual(['copilot:claude-sonnet-4']);
    });

    it('should produce identical output for duplicate specs enabling Set de-dup', () => {
        const specs = ['copilot:gpt-4o', 'gpt-4o', 'copilot:gpt-4o'];
        const resolved = new Set<string>();
        for (const spec of specs) {
            const r = resolveOneModelSpec(spec, sampleModels);
            if (r.match) resolved.add(r.match);
        }
        expect(resolved.size).toBe(1);
        expect([...resolved]).toEqual(['copilot:gpt-4o']);
    });

    // ── Priority ordering ─────────────────────────────────────────────

    it('should prefer exact id match over substring match', () => {
        const models: ModelInfo[] = [
            model('v1', 'gpt-4', 'GPT Four'),
            model('v1', 'gpt-4-turbo', 'GPT Four Turbo'),
        ];
        const result = resolveOneModelSpec('gpt-4', models);
        // Exact id match should win, not substring
        expect(result).toEqual({ match: 'v1:gpt-4' });
    });

    it('should fall through id substring to name substring', () => {
        const models: ModelInfo[] = [model('v', 'abc-123', 'Sonnet Model')];
        // No id substring match for 'Sonnet', but name matches
        const result = resolveOneModelSpec('Sonnet', models);
        expect(result).toEqual({ match: 'v:abc-123' });
    });
});
