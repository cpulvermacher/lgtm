import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reviewDiffWithCopilotCodeReview } from '@/review/copilotCodeReview';
import type { Config } from '@/types/Config';
import { UncommittedRef } from '@/types/Ref';
import { GIT_EMPTY_TREE_HASH } from '@/utils/git';

type TestGit = {
    getFileContentAtRef: ReturnType<typeof vi.fn>;
    getFileContentAtIndex: ReturnType<typeof vi.fn>;
    getMergeBase: ReturnType<typeof vi.fn>;
};

type TestConfig = {
    gitRoot: string;
    git: TestGit;
};

const vscodeMocks = vi.hoisted(() => ({
    getExtension: vi.fn(),
    executeCommand: vi.fn(),
    getConfiguration: vi.fn(),
}));

vi.mock('vscode', () => ({
    Uri: {
        file: (fsPath: string) => ({
            fsPath,
            toString: () => `file://${fsPath}`,
        }),
    },
    commands: {
        executeCommand: vscodeMocks.executeCommand,
    },
    extensions: {
        getExtension: vscodeMocks.getExtension,
    },
    workspace: {
        getConfiguration: vscodeMocks.getConfiguration,
    },
}));

describe('reviewDiffWithCopilotCodeReview', () => {
    const tempDirs: string[] = [];

    function createWorkspaceFile(relativePath: string, content: string) {
        const gitRoot = tempDirs.at(-1);
        if (!gitRoot) {
            throw new Error('Expected a temporary git root to exist.');
        }
        const fullPath = join(gitRoot, relativePath);
        writeFileSync(fullPath, content, 'utf8');
        return fullPath;
    }

    function createConfig(overrides?: Partial<TestConfig>): TestConfig {
        const gitRoot = mkdtempSync(join(tmpdir(), 'lgtm-copilot-test-'));
        tempDirs.push(gitRoot);

        return {
            gitRoot,
            git: {
                getFileContentAtRef: vi.fn(),
                getFileContentAtIndex: vi.fn(),
                getMergeBase: vi.fn(),
            },
            ...overrides,
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vscodeMocks.getConfiguration.mockReturnValue({
            get: vi.fn((_key: string, fallback?: boolean) => fallback),
        });
    });

    afterEach(() => {
        for (const dir of tempDirs) {
            rmSync(dir, { recursive: true, force: true });
        }
        tempDirs.length = 0;
    });

    it('reviews staged files using HEAD and index snapshots and maps results back to files', async () => {
        const config = createConfig();
        const activate = vi.fn();
        vscodeMocks.getExtension.mockReturnValue({ activate });
        vscodeMocks.executeCommand.mockImplementation(
            async (
                _command: string,
                args: {
                    files: Array<{
                        currentUri: { fsPath: string; toString(): string };
                        baseUri?: { fsPath: string; toString(): string };
                    }>;
                }
            ) => {
                const firstFile = args.files[0];
                const secondFile = args.files[1];
                if (!firstFile?.baseUri || !secondFile) {
                    throw new Error(
                        'Expected prepared files with base snapshots.'
                    );
                }

                expect(readFileSync(firstFile.baseUri.fsPath, 'utf8')).toBe(
                    'head content'
                );
                expect(readFileSync(firstFile.currentUri.fsPath, 'utf8')).toBe(
                    'index content'
                );
                expect(readFileSync(secondFile.currentUri.fsPath, 'utf8')).toBe(
                    ''
                );

                return {
                    type: 'success',
                    comments: [
                        {
                            uri: firstFile.currentUri,
                            range: { start: { line: 2 } },
                            body: 'Found an issue',
                            severity: 5,
                        },
                        {
                            uri: secondFile.baseUri,
                            range: { start: { line: 0 } },
                            severity: 'warning',
                        },
                        {
                            uri: firstFile.currentUri,
                            severity: 'high',
                        },
                        {
                            uri: firstFile.currentUri,
                            severity: 'low',
                        },
                        {
                            uri: firstFile.currentUri,
                            severity: { unexpected: true },
                        },
                        {
                            uri: firstFile.currentUri,
                            severity: 'unexpected-value',
                        },
                        {
                            body: 'ignored because it has no uri',
                        },
                    ],
                };
            }
        );

        vi.mocked(config.git.getFileContentAtRef)
            .mockResolvedValueOnce('head content')
            .mockResolvedValueOnce('deleted content');
        vi.mocked(config.git.getFileContentAtIndex).mockResolvedValueOnce(
            'index content'
        );

        const progress = { report: vi.fn() };
        const result = await reviewDiffWithCopilotCodeReview(
            config as unknown as Config,
            {
                scope: {
                    target: UncommittedRef.Staged,
                    isCommitted: false,
                    isTargetCheckedOut: true,
                },
            } as never,
            [
                { file: 'src/file.ts', status: 'M' },
                { file: 'src/deleted.ts', status: 'D' },
            ],
            progress
        );

        expect(activate).toHaveBeenCalledOnce();
        expect(vscodeMocks.executeCommand).toHaveBeenCalledOnce();

        expect(result.errors).toEqual([]);
        expect(result.fileComments).toHaveLength(2);
        expect(result.fileComments[0].target).toBe('src/file.ts');
        expect(result.fileComments[0].comments[0]).toMatchObject({
            comment: 'Found an issue',
            line: 3,
            severity: 5,
        });
        expect(
            result.fileComments[0].comments.map((comment) => comment.severity)
        ).toEqual(expect.arrayContaining([5, 5, 3, 3, 2]));
        expect(result.fileComments[1].comments[0]).toMatchObject({
            comment: 'Copilot Code Review flagged an issue.',
            line: 1,
            severity: 4,
        });
        expect(progress.report).toHaveBeenCalledWith({
            message: 'Gathering changes for file.ts, deleted.ts...',
            increment: 50,
        });
        expect(progress.report).toHaveBeenCalledWith({
            message: 'Reviewing...',
            increment: -100,
        });
    });

    it('uses workspace files for unstaged changes and returns cancellation as an error result', async () => {
        const config = createConfig();
        createWorkspaceFile('file1.ts', 'workspace 1');
        createWorkspaceFile('file2.ts', 'workspace 2');
        createWorkspaceFile('file3.ts', 'workspace 3');
        createWorkspaceFile('file4.ts', 'workspace 4');
        createWorkspaceFile('file5.ts', 'workspace 5');
        const activate = vi.fn();
        vscodeMocks.getExtension.mockReturnValue({ activate });
        vscodeMocks.executeCommand.mockImplementation(
            async (
                _command: string,
                args: { files: Array<{ currentUri: { fsPath: string } }> }
            ) => {
                expect(args.files[0].currentUri.fsPath).toBe(
                    join(config.gitRoot, 'file1.ts')
                );
                return { type: 'cancelled' };
            }
        );
        vi.mocked(config.git.getFileContentAtIndex).mockResolvedValue('index');

        const progress = { report: vi.fn() };
        const result = await reviewDiffWithCopilotCodeReview(
            config as unknown as Config,
            {
                scope: {
                    target: UncommittedRef.Unstaged,
                    isCommitted: false,
                    isTargetCheckedOut: true,
                },
            } as never,
            [
                { file: 'file1.ts', status: 'M' },
                { file: 'file2.ts', status: 'M' },
                { file: 'file3.ts', status: 'M' },
                { file: 'file4.ts', status: 'M' },
                { file: 'file5.ts', status: 'M' },
            ],
            progress
        );

        expect(result.fileComments).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toBe('Copilot Code Review cancelled.');
        expect(progress.report).toHaveBeenCalledWith({
            message:
                'Gathering changes for file1.ts, file2.ts, file3.ts, file4.ts, and 1 other file...',
            increment: 20,
        });
    });

    it('uses merge-base snapshots for committed reviews and supports added files with no base uri', async () => {
        const config = createConfig();
        const activate = vi.fn();
        vscodeMocks.getExtension.mockReturnValue({ activate });
        vi.mocked(config.git.getMergeBase).mockResolvedValue('merge-base');
        vi.mocked(config.git.getFileContentAtRef)
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce('target content');
        vscodeMocks.executeCommand.mockImplementation(
            async (
                _command: string,
                args: {
                    files: Array<{
                        currentUri: { fsPath: string };
                        baseUri?: { fsPath: string };
                    }>;
                }
            ) => {
                expect(args.files[0].baseUri).toBeUndefined();
                expect(
                    readFileSync(args.files[0].currentUri.fsPath, 'utf8')
                ).toBe('target content');
                return {
                    type: 'success',
                    comments: [
                        {
                            uri: args.files[0].currentUri,
                            severity: 'notice',
                        },
                    ],
                };
            }
        );

        const result = await reviewDiffWithCopilotCodeReview(
            config as unknown as Config,
            {
                scope: {
                    target: 'feature',
                    base: 'main',
                    isCommitted: true,
                    isTargetCheckedOut: true,
                },
            } as never,
            [{ file: 'src/new.ts', status: 'A' }],
            { report: vi.fn() }
        );

        expect(config.git.getMergeBase).toHaveBeenCalledWith('main', 'feature');
        expect(result.fileComments[0].comments[0]).toMatchObject({
            line: 0,
            severity: 3,
        });
    });

    it('does not calculate merge-base for initial-commit style reviews and surfaces missing results as errors', async () => {
        const config = createConfig();
        const activate = vi.fn();
        vscodeMocks.getExtension.mockReturnValue({ activate });
        vi.mocked(config.git.getFileContentAtRef).mockResolvedValue('target');
        vscodeMocks.executeCommand.mockResolvedValue(undefined);

        const result = await reviewDiffWithCopilotCodeReview(
            config as unknown as Config,
            {
                scope: {
                    target: 'feature',
                    base: GIT_EMPTY_TREE_HASH,
                    isCommitted: true,
                    isTargetCheckedOut: true,
                },
            } as never,
            [{ file: 'src/new.ts', status: 'A' }],
            { report: vi.fn() }
        );

        expect(config.git.getMergeBase).not.toHaveBeenCalled();
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toBe(
            'No result returned from GitHub Copilot Chat.'
        );
    });

    it('returns an error when the Copilot Chat extension is unavailable', async () => {
        const config = createConfig();
        vscodeMocks.getExtension.mockReturnValue(undefined);
        vi.mocked(config.git.getFileContentAtRef).mockResolvedValue('target');

        const result = await reviewDiffWithCopilotCodeReview(
            config as unknown as Config,
            {
                scope: {
                    target: 'feature',
                    base: GIT_EMPTY_TREE_HASH,
                    isCommitted: true,
                    isTargetCheckedOut: true,
                },
            } as never,
            [{ file: 'src/new.ts', status: 'A' }]
        );

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toBe(
            'GitHub Copilot Chat is not installed.'
        );
    });

    it('returns an error when Copilot review is disabled in settings', async () => {
        const config = createConfig();
        vscodeMocks.getExtension.mockReturnValue({ activate: vi.fn() });
        vscodeMocks.getConfiguration.mockReturnValue({
            get: vi.fn(() => false),
        });
        vi.mocked(config.git.getFileContentAtRef).mockResolvedValue('target');

        const result = await reviewDiffWithCopilotCodeReview(
            config as unknown as Config,
            {
                scope: {
                    target: 'feature',
                    base: GIT_EMPTY_TREE_HASH,
                    isCommitted: true,
                    isTargetCheckedOut: true,
                },
            } as never,
            [{ file: 'src/new.ts', status: 'A' }]
        );

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toBe(
            'GitHub Copilot Chat code review is disabled in settings.'
        );
        expect(vscodeMocks.executeCommand).not.toHaveBeenCalled();
    });

    it('returns early when already cancelled', async () => {
        const config = createConfig();

        const result = await reviewDiffWithCopilotCodeReview(
            config as unknown as Config,
            {
                scope: {
                    target: UncommittedRef.Staged,
                    isCommitted: false,
                    isTargetCheckedOut: true,
                },
            } as never,
            [{ file: 'src/file.ts', status: 'M' }],
            { report: vi.fn() },
            { isCancellationRequested: true } as never
        );

        expect(result.fileComments).toEqual([]);
        expect(result.errors).toEqual([]);
        expect(vscodeMocks.executeCommand).not.toHaveBeenCalled();
    });

    it('returns early after cancellation occurs during file preparation', async () => {
        const config = createConfig();
        vi.mocked(config.git.getFileContentAtRef).mockResolvedValue('head');
        vi.mocked(config.git.getFileContentAtIndex).mockResolvedValue('index');
        const cancellationToken = { isCancellationRequested: false };
        const progress = {
            report: vi.fn(() => {
                cancellationToken.isCancellationRequested = true;
            }),
        };

        const result = await reviewDiffWithCopilotCodeReview(
            config as unknown as Config,
            {
                scope: {
                    target: UncommittedRef.Staged,
                    isCommitted: false,
                    isTargetCheckedOut: true,
                },
            } as never,
            [
                { file: 'src/file1.ts', status: 'M' },
                { file: 'src/file2.ts', status: 'M' },
            ],
            progress,
            cancellationToken as never
        );

        expect(result.fileComments).toEqual([]);
        expect(result.errors).toEqual([]);
        expect(vscodeMocks.executeCommand).not.toHaveBeenCalled();
    });

    it('handles edge-case gathering messages and falls back to empty staged snapshots', async () => {
        const config = createConfig();
        const activate = vi.fn();
        vscodeMocks.getExtension.mockReturnValue({ activate });
        vi.mocked(config.git.getFileContentAtRef).mockResolvedValue('head');
        vi.mocked(config.git.getFileContentAtIndex).mockResolvedValue(
            undefined
        );

        const files = {
            slice: vi.fn(() => [
                { file: '/', status: 'M' },
                { file: 'two.ts', status: 'M' },
                { file: 'three.ts', status: 'M' },
                { file: 'four.ts', status: 'M' },
            ]),
            [Symbol.iterator]: function* () {
                yield { file: 'src/file.ts', status: 'M' };
            },
        } as unknown as {
            readonly slice: (
                start: number,
                end?: number
            ) => Array<{
                file: string;
                status: string;
            }>;
            readonly [Symbol.iterator]: () => Iterator<{
                file: string;
                status: string;
            }>;
            readonly length: number;
        };

        let lengthReads = 0;
        Object.defineProperty(files, 'length', {
            get() {
                lengthReads += 1;
                return lengthReads === 1 ? 6 : 0;
            },
        });

        vscodeMocks.executeCommand.mockImplementation(
            async (
                _command: string,
                args: {
                    files: Array<{
                        currentUri: { fsPath: string; toString(): string };
                        baseUri?: { fsPath: string; toString(): string };
                    }>;
                }
            ) => {
                const preparedFile = args.files[0];
                if (!preparedFile?.baseUri) {
                    throw new Error(
                        'Expected a base snapshot for staged review.'
                    );
                }

                expect(readFileSync(preparedFile.baseUri.fsPath, 'utf8')).toBe(
                    'head'
                );
                expect(
                    readFileSync(preparedFile.currentUri.fsPath, 'utf8')
                ).toBe('');

                return {
                    type: 'success',
                    comments: [
                        {
                            uri: preparedFile.currentUri,
                            severity: 'critical',
                        },
                        {
                            uri: preparedFile.currentUri,
                            severity: 'error',
                        },
                        {
                            uri: preparedFile.currentUri,
                            severity: 'medium',
                        },
                    ],
                };
            }
        );

        const progress = { report: vi.fn() };
        const result = await reviewDiffWithCopilotCodeReview(
            config as unknown as Config,
            {
                scope: {
                    target: UncommittedRef.Staged,
                    isCommitted: false,
                    isTargetCheckedOut: true,
                },
            } as never,
            files as never,
            progress
        );

        expect(result.errors).toEqual([]);
        expect(result.fileComments[0]?.target).toBe('src/file.ts');
        expect(
            result.fileComments[0]?.comments.map((comment) => comment.severity)
        ).toEqual([5, 5, 4]);
        expect(progress.report).toHaveBeenCalledWith({
            message:
                'Gathering changes for /, two.ts, three.ts, four.ts, and 2 other files...',
            increment: 0,
        });
    });

    it('creates empty snapshots for deleted unstaged files and preserves renamed base paths', async () => {
        const config = createConfig();
        const activate = vi.fn();
        vscodeMocks.getExtension.mockReturnValue({ activate });
        vi.mocked(config.git.getFileContentAtIndex).mockResolvedValue('index');

        vscodeMocks.executeCommand.mockImplementation(
            async (
                _command: string,
                args: {
                    files: Array<{
                        currentUri: { fsPath: string };
                        baseUri?: { fsPath: string };
                    }>;
                }
            ) => {
                const preparedFile = args.files[0];
                if (!preparedFile?.baseUri) {
                    throw new Error(
                        'Expected a base snapshot for deleted unstaged review.'
                    );
                }

                expect(preparedFile.currentUri.fsPath).not.toBe(
                    join(config.gitRoot, 'src/new-name.ts')
                );
                expect(readFileSync(preparedFile.baseUri.fsPath, 'utf8')).toBe(
                    'index'
                );
                expect(
                    readFileSync(preparedFile.currentUri.fsPath, 'utf8')
                ).toBe('');
                expect(preparedFile.baseUri.fsPath).toContain(
                    'src/old-name.ts'
                );

                return {
                    type: 'success',
                    comments: [
                        {
                            uri: preparedFile.currentUri,
                            severity: 'info',
                        },
                        {
                            uri: preparedFile.currentUri,
                            severity: 'hint',
                        },
                    ],
                };
            }
        );

        const result = await reviewDiffWithCopilotCodeReview(
            config as unknown as Config,
            {
                scope: {
                    target: UncommittedRef.Unstaged,
                    isCommitted: false,
                    isTargetCheckedOut: true,
                },
            } as never,
            [{ file: 'src/new-name.ts', from: 'src/old-name.ts', status: 'D' }]
        );

        expect(result.errors).toEqual([]);
        expect(
            result.fileComments[0]?.comments.map((comment) => comment.severity)
        ).toEqual([3, 2]);
    });

    it('uses an empty current snapshot when the committed target content is missing', async () => {
        const config = createConfig();
        const activate = vi.fn();
        vscodeMocks.getExtension.mockReturnValue({ activate });
        vi.mocked(config.git.getMergeBase).mockResolvedValue('merge-base');
        vi.mocked(config.git.getFileContentAtRef)
            .mockResolvedValueOnce('base content')
            .mockResolvedValueOnce(undefined);

        vscodeMocks.executeCommand.mockImplementation(
            async (
                _command: string,
                args: {
                    files: Array<{
                        currentUri: { fsPath: string };
                        baseUri?: { fsPath: string };
                    }>;
                }
            ) => {
                const preparedFile = args.files[0];
                if (!preparedFile?.baseUri) {
                    throw new Error(
                        'Expected committed review to include baseUri.'
                    );
                }

                expect(readFileSync(preparedFile.baseUri.fsPath, 'utf8')).toBe(
                    'base content'
                );
                expect(
                    readFileSync(preparedFile.currentUri.fsPath, 'utf8')
                ).toBe('');

                return {
                    type: 'success',
                    comments: [
                        {
                            uri: preparedFile.baseUri,
                            severity: 1,
                        },
                    ],
                };
            }
        );

        const result = await reviewDiffWithCopilotCodeReview(
            config as unknown as Config,
            {
                scope: {
                    target: 'feature',
                    base: 'main',
                    isCommitted: true,
                    isTargetCheckedOut: true,
                },
            } as never,
            [{ file: 'src/file.ts', status: 'D' }]
        );

        expect(result.errors).toEqual([]);
        expect(result.fileComments[0]?.comments[0]).toMatchObject({
            severity: 1,
        });
    });
});
