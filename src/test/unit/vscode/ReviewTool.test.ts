import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    CancellationToken,
    LanguageModelToolInvocationOptions,
    LanguageModelToolInvocationPrepareOptions,
} from 'vscode';

import { reviewDiff } from '@/review/review';
import type { Config } from '@/types/Config';
import { UncommittedRef } from '@/types/Ref';
import type { ReviewRequest } from '@/types/ReviewRequest';
import type { Git } from '@/utils/git';
import { getConfig } from '@/vscode/config';
import { ReviewTool, type ReviewInput } from '@/vscode/ReviewTool';

// Mock for getConfig and related functions
vi.mock('@/vscode/config', () => ({
    getConfig: vi.fn(),
}));

// Mock for reviewDiff function
vi.mock('@/review/review', () => ({
    reviewDiff: vi.fn(),
}));

// Mock vscode namespace
vi.mock('vscode', () => {
    return {
        LanguageModelToolResult: class {
            constructor(public parts: unknown[]) {}
        },
        LanguageModelTextPart: class {
            constructor(public text: string) {}
        },
    };
});

describe('ReviewTool', () => {
    const cancelToken: CancellationToken = {
        isCancellationRequested: false,
    } as CancellationToken;
    beforeEach(() => {
        vi.mocked(reviewDiff).mockResolvedValue({
            request: { scope: {} } as ReviewRequest,
            fileComments: [
                {
                    target: 'test-file.ts',
                    comments: [
                        {
                            file: 'test-file.ts',
                            line: 42,
                            comment: 'Test comment',
                            severity: 3,
                        },
                    ],
                    maxSeverity: 3,
                },
            ],
            errors: [],
        });

        vi.mocked(getConfig).mockResolvedValue({
            git: {
                getReviewScope: vi.fn().mockImplementation((target, base) => {
                    if (target === UncommittedRef.Staged) {
                        return {
                            target: UncommittedRef.Staged,
                            isCommitted: false,
                            isTargetCheckedOut: true,
                            changeDescription: undefined,
                        };
                    } else if (target === UncommittedRef.Unstaged) {
                        return {
                            target: UncommittedRef.Unstaged,
                            isCommitted: false,
                            isTargetCheckedOut: true,
                            changeDescription: undefined,
                        };
                    } else {
                        return {
                            target: String(target),
                            base: String(base),
                            isCommitted: true,
                            isTargetCheckedOut: true,
                            revisionRangeDiff: `${base}...${target}`,
                            revisionRangeLog: `${base}..${target}`,
                            changeDescription: `Changes from ${base} to ${target}`,
                        };
                    }
                }),
            } as unknown as Git,
            logger: {
                debug: vi.fn(),
                info: vi.fn(),
                setEnableDebug: vi.fn(),
                isDebugEnabled: vi.fn(),
            },
        } as unknown as Config);
    });

    it('should review committed changes', async () => {
        const tool = new ReviewTool();
        const options = {
            input: { target: 'main', base: 'develop' },
        } as LanguageModelToolInvocationOptions<ReviewInput>;

        const result = await tool.invoke(options, cancelToken);

        const toolResult = result as unknown as { parts: { text: string }[] };
        expect(toolResult.parts.length).toBe(1);
        expect(toolResult.parts[0].text).toContain('test-file.ts:42');
        expect(toolResult.parts[0].text).toContain('Test comment');
    });

    it('should prepare invocation with correct message', () => {
        const tool = new ReviewTool();
        const options = {
            input: { target: 'main', base: 'develop' },
        } as LanguageModelToolInvocationPrepareOptions<ReviewInput>;

        const prepared = tool.prepareInvocation(options);

        expect(prepared.invocationMessage).toContain('main');
        expect(prepared.invocationMessage).toContain('develop');
    });

    it('#reviewStaged', async () => {
        const tool = new ReviewTool({ defaultTarget: UncommittedRef.Staged });
        const options = {
            input: {},
        } as LanguageModelToolInvocationOptions<ReviewInput>;

        const result = await tool.invoke(options, cancelToken);

        const toolResult = result as unknown as { parts: { text: string }[] };
        expect(toolResult.parts.length).toBe(1);
    });

    it('#reviewUnstaged', async () => {
        const tool = new ReviewTool({ defaultTarget: UncommittedRef.Unstaged });
        const options = {
            input: {},
        } as LanguageModelToolInvocationOptions<ReviewInput>;

        const result = await tool.invoke(options, cancelToken);

        const toolResult = result as unknown as { parts: { text: string }[] };
        expect(toolResult.parts.length).toBe(1);
    });

    it('should generate correct message for staged changes', () => {
        const tool = new ReviewTool({ defaultTarget: UncommittedRef.Staged });
        const options = {
            input: {},
        } as LanguageModelToolInvocationPrepareOptions<ReviewInput>;

        const prepared = tool.prepareInvocation(options);

        expect(prepared.invocationMessage).toContain('staged changes');
    });

    it('should generate correct message for unstaged changes', () => {
        const tool = new ReviewTool({ defaultTarget: UncommittedRef.Unstaged });
        const options = {
            input: {},
        } as LanguageModelToolInvocationPrepareOptions<ReviewInput>;

        const prepared = tool.prepareInvocation(options);

        expect(prepared.invocationMessage).toContain('unstaged changes');
    });

    it('should throw error if target is missing in committed review', async () => {
        const tool = new ReviewTool();
        const options = {
            input: { base: 'develop' } as Partial<ReviewInput>,
        } as LanguageModelToolInvocationOptions<ReviewInput>;

        await expect(tool.invoke(options, cancelToken)).rejects.toThrow(
            "Missing required parameter 'target'"
        );
    });

    it('should throw error if base is missing in committed review', async () => {
        const tool = new ReviewTool();
        const options = {
            input: { target: 'main' } as Partial<ReviewInput>,
        } as LanguageModelToolInvocationOptions<ReviewInput>;

        await expect(tool.invoke(options, cancelToken)).rejects.toThrow(
            "Missing required parameter 'base'"
        );
    });
});
