import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import * as vscode from 'vscode';

import { sortFileCommentsBySeverity } from '@/review/comment';
import { formatGatheringFilesMessage } from '@/review/formatGatheringFilesMessage';
import type { Config } from '@/types/Config';
import type { DiffFile } from '@/types/DiffFile';
import type { FileComments } from '@/types/FileComments';
import { UncommittedRef } from '@/types/Ref';
import type { ReviewComment } from '@/types/ReviewComment';
import type { ReviewRequest, ReviewScope } from '@/types/ReviewRequest';
import type { ReviewResult } from '@/types/ReviewResult';
import { GIT_EMPTY_TREE_HASH } from '@/utils/git';

type Progress = {
    report: (value: { message?: string; increment?: number }) => void;
};

type CodeReviewFileInput = {
    readonly currentUri: vscode.Uri;
    readonly baseUri?: vscode.Uri;
};

type CopilotCodeReviewSuccess = {
    readonly type: 'success';
    readonly comments: readonly CopilotCodeReviewComment[];
};

type CopilotCodeReviewError = {
    readonly type: 'error';
    readonly reason: string;
};

type CopilotCodeReviewCancelled = {
    readonly type: 'cancelled';
};

type CommandExecutionResult =
    | {
          readonly type: 'command';
          readonly result: CopilotCodeReviewResult | undefined;
      }
    | {
          readonly type: 'error';
          readonly error: unknown;
      }
    | {
          readonly type: 'cancelled';
      };

type CopilotCodeReviewResult =
    | CopilotCodeReviewSuccess
    | CopilotCodeReviewError
    | CopilotCodeReviewCancelled;

type CopilotCodeReviewComment = {
    readonly uri?: vscode.Uri;
    readonly range?: vscode.Range | { start?: { line?: number } };
    readonly body?: string;
    readonly severity?: unknown;
};

type PreparedFile = {
    readonly file: DiffFile;
    readonly input: CodeReviewFileInput;
};

type SkippedPreparedFile = {
    readonly type: 'skipped';
    readonly message: string;
};

type PreparedFileResult =
    | {
          readonly type: 'prepared';
          readonly preparedFile: PreparedFile;
      }
    | SkippedPreparedFile;

type FileSnapshotPair =
    | {
          readonly currentContent?: undefined;
          readonly baseContent?: string;
          readonly useWorkspaceFileForCurrent: true;
      }
    | {
          readonly currentContent: string;
          readonly baseContent?: string;
          readonly useWorkspaceFileForCurrent: false;
      };

/**
 * Run GitHub Copilot Chat's code review command for the prepared diff files.
 *
 * Failures and cancellations are returned in `ReviewResult.errors` so callers
 * can keep a normal review result shape and surface problems without aborting
 * the overall review flow.
 */
export async function reviewDiffWithCopilotCodeReview(
    config: Config,
    request: ReviewRequest,
    files: DiffFile[],
    progress?: Progress,
    cancellationToken?: vscode.CancellationToken
): Promise<ReviewResult> {
    const errors: Error[] = [];
    const fileComments: FileComments[] = [];
    let tempDir: string | undefined;

    try {
        if (cancellationToken?.isCancellationRequested) {
            return {
                request,
                files,
                fileComments,
                errors,
            };
        }

        const reviewTempDir = await mkdtemp(
            join(tmpdir(), 'lgtm-copilot-review-')
        );
        tempDir = reviewTempDir;
        const preparedFiles: PreparedFile[] = [];
        const gatheringMessage = formatGatheringFilesMessage(files);
        const gatheringIncrement = files.length > 0 ? 100 / files.length : 0;

        for (const file of files) {
            if (cancellationToken?.isCancellationRequested) {
                break;
            }

            progress?.report({
                message: gatheringMessage,
                increment: gatheringIncrement,
            });

            const preparedFile = await prepareFileForReview(
                config,
                request.scope,
                file,
                reviewTempDir
            );

            if (preparedFile.type === 'skipped') {
                config.logger.debug(preparedFile.message);
                continue;
            }

            preparedFiles.push(preparedFile.preparedFile);
        }

        if (
            preparedFiles.length === 0 ||
            cancellationToken?.isCancellationRequested
        ) {
            return {
                request,
                files,
                fileComments,
                errors,
            };
        }

        progress?.report({ message: 'Reviewing...' });

        const result = await runCopilotCodeReview(
            preparedFiles.map((preparedFile) => preparedFile.input),
            cancellationToken
        );

        if (result.type === 'error') {
            errors.push(new Error(result.reason));
        } else if (result.type === 'cancelled') {
            errors.push(new Error('Copilot Code Review cancelled.'));
        } else {
            const commentsByFile = new Map<string, ReviewComment[]>();
            const pathByUri = new Map<string, string>();

            for (const preparedFile of preparedFiles) {
                pathByUri.set(
                    preparedFile.input.currentUri.toString(),
                    preparedFile.file.file
                );
                if (preparedFile.input.baseUri) {
                    pathByUri.set(
                        preparedFile.input.baseUri.toString(),
                        preparedFile.file.file
                    );
                }
            }

            for (const comment of result.comments) {
                const filePath = resolveCommentFilePath(comment, pathByUri);
                if (!filePath) {
                    continue;
                }

                const normalized: ReviewComment = {
                    file: filePath,
                    comment:
                        comment.body?.trim() ||
                        'Copilot Code Review flagged an issue.',
                    line: getCommentLine(comment),
                    severity: normalizeSeverity(comment.severity),
                };

                const existing = commentsByFile.get(filePath) ?? [];
                existing.push(normalized);
                commentsByFile.set(filePath, existing);
            }

            fileComments.push(
                ...sortFileCommentsBySeverity(
                    Array.from(commentsByFile, ([target, comments]) => ({
                        target,
                        comments,
                    }))
                )
            );
        }
    } finally {
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true }).catch(
                (error: unknown) => {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    errors.push(
                        new Error(
                            `Failed to remove temporary Copilot review files: ${message}`
                        )
                    );
                }
            );
        }
    }

    return {
        request,
        files,
        fileComments,
        errors,
    };
}

/**
 * Build the file pair that Copilot Chat expects for review.
 *
 * Workspace files are used directly when the current side exists on disk.
 * Otherwise we materialize temporary snapshots for staged, committed, deleted,
 * or renamed content so both sides can be reviewed through stable URIs.
 */
async function prepareFileForReview(
    config: Config,
    scope: ReviewScope,
    file: DiffFile,
    tempDir: string
): Promise<PreparedFileResult> {
    const snapshot = await getFileSnapshotPair(config, scope, file);

    const currentUri = snapshot.useWorkspaceFileForCurrent
        ? getWorkspaceFileUri(config, file.file)
        : await writeSnapshotFile(
              tempDir,
              'current',
              file.file,
              snapshot.currentContent
          );

    const baseUri =
        snapshot.baseContent === undefined
            ? undefined
            : await writeSnapshotFile(
                  tempDir,
                  'base',
                  file.from ?? file.file,
                  snapshot.baseContent
              );

    const unreadableInput = await findUnreadableReviewInput([
        {
            uri: currentUri,
            path: file.file,
        },
        ...(baseUri
            ? [
                  {
                      uri: baseUri,
                      path: file.from ?? file.file,
                  },
              ]
            : []),
    ]);

    if (unreadableInput) {
        return {
            type: 'skipped',
            message: formatUnreadableReviewInputMessage(
                file.file,
                unreadableInput
            ),
        };
    }

    return {
        type: 'prepared',
        preparedFile: {
            file,
            input: {
                currentUri,
                baseUri,
            },
        },
    };
}

async function findUnreadableReviewInput(
    inputs: ReadonlyArray<{
        uri: vscode.Uri;
        path: string;
    }>
): Promise<{ path: string; reason: string } | undefined> {
    for (const input of inputs) {
        try {
            // Match the downstream review command's ability to open the input
            // as text instead of relying on a separate binary-file heuristic.
            await vscode.workspace.openTextDocument(input.uri);
        } catch (error) {
            const reason =
                error instanceof Error ? error.message : String(error);
            return {
                path: input.path,
                reason,
            };
        }
    }

    return undefined;
}

function formatUnreadableReviewInputMessage(
    filePath: string,
    unreadableInput: { path: string; reason: string }
): string {
    const normalizedReason = normalizeUnreadableReviewInputReason(
        unreadableInput.reason
    );

    if (unreadableInput.path === filePath) {
        return `Skipping Copilot Code Review file "${filePath}": ${normalizedReason}.`;
    }

    return `Skipping Copilot Code Review file "${filePath}" because input "${unreadableInput.path}" failed the text-readability check: ${normalizedReason}.`;
}

function normalizeUnreadableReviewInputReason(reason: string): string {
    const detailMessage = /^cannot open .*?\. Detail: (.*)$/i.exec(reason)?.[1];
    const normalizedReason = (detailMessage ?? reason).trim();

    if (/cannot be opened as text|binary/i.test(normalizedReason)) {
        return 'not readable as text';
    }

    return normalizedReason;
}

async function getFileSnapshotPair(
    config: Config,
    scope: ReviewScope,
    file: DiffFile
): Promise<FileSnapshotPair> {
    const previousPath = file.from ?? file.file;

    if (!scope.isCommitted) {
        if (scope.target === UncommittedRef.Staged) {
            return {
                baseContent: await config.git.getFileContentAtRef(
                    'HEAD',
                    previousPath
                ),
                currentContent:
                    file.status === 'D'
                        ? ''
                        : ((await config.git.getFileContentAtIndex(
                              file.file
                          )) ?? ''),
                useWorkspaceFileForCurrent: false,
            };
        }

        if (file.status === 'D') {
            return {
                baseContent:
                    await config.git.getFileContentAtIndex(previousPath),
                currentContent: '',
                useWorkspaceFileForCurrent: false,
            };
        }

        return {
            baseContent: await config.git.getFileContentAtIndex(previousPath),
            useWorkspaceFileForCurrent: true,
        };
    }

    const baseRef =
        scope.base === GIT_EMPTY_TREE_HASH
            ? undefined
            : await config.git.getMergeBase(scope.base, scope.target);

    return {
        baseContent:
            baseRef === undefined
                ? undefined
                : await config.git.getFileContentAtRef(baseRef, previousPath),
        currentContent:
            (await config.git.getFileContentAtRef(scope.target, file.file)) ??
            '',
        useWorkspaceFileForCurrent: false,
    };
}

function getWorkspaceFileUri(config: Config, filePath: string): vscode.Uri {
    return vscode.Uri.file(join(config.gitRoot, filePath));
}

async function writeSnapshotFile(
    tempDir: string,
    directory: 'base' | 'current',
    filePath: string,
    content: string
): Promise<vscode.Uri> {
    const snapshotRoot = resolve(tempDir, directory);
    const fullPath = resolve(snapshotRoot, filePath);
    const relativePath = relative(snapshotRoot, fullPath);

    if (
        !relativePath ||
        relativePath === '..' ||
        relativePath.startsWith(`..${sep}`)
    ) {
        throw new Error(
            `Refusing to write Copilot review snapshot outside the temporary directory: ${filePath}`
        );
    }

    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
    return vscode.Uri.file(fullPath);
}

function resolveCommentFilePath(
    comment: CopilotCodeReviewComment,
    pathByUri: Map<string, string>
): string | undefined {
    if (!comment.uri) {
        return;
    }

    return pathByUri.get(comment.uri.toString());
}

function getCommentLine(comment: CopilotCodeReviewComment): number {
    const line = comment.range?.start?.line;
    return typeof line === 'number' && line >= 0 ? line + 1 : 0;
}

/**
 * Normalize Copilot severities to LGTM's 1..5 severity scale where 5 is high.
 */
function normalizeSeverity(severity: unknown): number {
    if (typeof severity === 'number' && severity >= 1 && severity <= 5) {
        return severity;
    }

    if (typeof severity !== 'string') {
        return 3;
    }

    switch (severity.toLowerCase()) {
        case 'critical':
        case 'error':
        case 'high':
            return 5;
        case 'warning':
        case 'medium':
            return 4;
        case 'info':
        case 'notice':
            return 3;
        case 'low':
        case 'hint':
            return 2;
        default:
            return 3;
    }
}

async function runCopilotCodeReview(
    files: readonly CodeReviewFileInput[],
    cancellationToken?: vscode.CancellationToken
): Promise<CopilotCodeReviewResult> {
    const extension = vscode.extensions.getExtension('GitHub.copilot-chat');
    if (!extension) {
        return {
            type: 'error',
            reason: 'GitHub Copilot Chat is not installed.',
        };
    }

    // This setting belongs to the Copilot Chat extension. Defaulting to true
    // preserves existing behavior if the setting is absent or renamed.
    const reviewEnabled = vscode.workspace
        .getConfiguration('github.copilot.chat')
        .get<boolean>('reviewAgent.enabled', true);
    if (!reviewEnabled) {
        return {
            type: 'error',
            reason: 'GitHub Copilot Chat code review is disabled in settings.',
        };
    }

    await extension.activate();

    if (cancellationToken?.isCancellationRequested) {
        return { type: 'cancelled' };
    }

    const command = vscode.commands.executeCommand<CopilotCodeReviewResult>(
        'github.copilot.chat.codeReview.run',
        { files }
    );
    const result = await raceCommandWithCancellation(
        command,
        cancellationToken
    );

    if (result.type === 'cancelled') {
        return result;
    }

    if (result.type === 'error') {
        return {
            type: 'error',
            reason: formatCommandError(result.error),
        };
    }

    if (!result.result) {
        return {
            type: 'error',
            reason: 'No result returned from GitHub Copilot Chat.',
        };
    }

    return result.result;
}

function formatCommandError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `GitHub Copilot Chat code review failed: ${message}`;
}

/**
 * Race the review command against cancellation and dispose the listener once
 * either side wins.
 */
async function raceCommandWithCancellation(
    command: PromiseLike<CopilotCodeReviewResult | undefined>,
    cancellationToken?: vscode.CancellationToken
): Promise<CommandExecutionResult> {
    if (!cancellationToken) {
        try {
            return {
                type: 'command',
                result: await command,
            };
        } catch (error) {
            return {
                type: 'error',
                error,
            };
        }
    }

    let disposeCancellation: (() => void) | undefined;
    const cancellation = new Promise<CommandExecutionResult>((resolve) => {
        const subscription = cancellationToken.onCancellationRequested(() => {
            resolve({ type: 'cancelled' });
        });
        disposeCancellation = () => subscription.dispose();
    });

    try {
        return await Promise.race([
            command.then(
                (result) =>
                    ({
                        type: 'command',
                        result,
                    }) as const,
                (error) =>
                    ({
                        type: 'error',
                        error,
                    }) as const
            ),
            cancellation,
        ]);
    } finally {
        disposeCancellation?.();
    }
}
