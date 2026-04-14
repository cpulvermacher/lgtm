import {
    mkdirSync,
    mkdtempSync,
    readlinkSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadReviewContextFiles } from '@/review/contextFiles';
import type { Logger } from '@/types/Logger';
import { getConfig } from '@/vscode/config';

vi.mock('@/vscode/config', () => ({
    getConfig: vi.fn(),
}));

vi.mock('node:fs/promises', async () => {
    const actual =
        await vi.importActual<typeof import('node:fs/promises')>(
            'node:fs/promises'
        );
    return { ...actual, readFile: vi.fn(actual.readFile) };
});

describe('loadReviewContextFiles', () => {
    const tempDirs: string[] = [];
    const logger = {
        info: vi.fn(),
        debug: vi.fn(),
        setEnableDebug: vi.fn(),
        isDebugEnabled: vi.fn(() => false),
    } as Logger;

    afterEach(() => {
        for (const dir of tempDirs) {
            rmSync(dir, { recursive: true, force: true });
        }
        tempDirs.length = 0;
    });

    it('loads configured files relative to the workspace root', async () => {
        const workspaceRoot = mkdtempSync(join(tmpdir(), 'lgtm-context-'));
        tempDirs.push(workspaceRoot);
        mkdirSync(join(workspaceRoot, 'docs'), { recursive: true });
        writeFileSync(join(workspaceRoot, 'AGENTS.md'), 'Repo guidance\n');
        writeFileSync(join(workspaceRoot, 'docs', 'README.md'), 'Nested docs');

        vi.mocked(getConfig, { partial: true }).mockResolvedValue({
            workspaceRoot,
            logger,
        });

        const result = await loadReviewContextFiles([
            'AGENTS.md',
            'docs/README.md',
        ]);

        expect(result).toEqual([
            { path: 'AGENTS.md', content: 'Repo guidance' },
            { path: 'docs/README.md', content: 'Nested docs' },
        ]);
    });

    it('skips missing, empty, and out-of-workspace files', async () => {
        const workspaceRoot = mkdtempSync(join(tmpdir(), 'lgtm-context-'));
        tempDirs.push(workspaceRoot);
        writeFileSync(join(workspaceRoot, 'README.md'), '');

        vi.mocked(getConfig, { partial: true }).mockResolvedValue({
            workspaceRoot,
            logger,
        });

        const result = await loadReviewContextFiles([
            'README.md',
            'missing.md',
            '../outside.md',
        ]);

        expect(result).toEqual([]);
        expect(logger.debug).toHaveBeenCalledWith(
            'Skipping empty context file: "README.md"'
        );
        expect(logger.debug).toHaveBeenCalledWith(
            'Skipping missing context file: "missing.md"'
        );
        expect(logger.debug).toHaveBeenCalledWith(
            'Skipping context file outside workspace: "../outside.md"'
        );
    });

    it('logs empty configured paths and blocks symlinks escaping the workspace', async () => {
        const workspaceRoot = mkdtempSync(join(tmpdir(), 'lgtm-context-'));
        const outsideRoot = mkdtempSync(
            join(tmpdir(), 'lgtm-context-outside-')
        );
        tempDirs.push(workspaceRoot, outsideRoot);

        writeFileSync(join(outsideRoot, 'secret.md'), 'outside');
        const symlinkPath = join(workspaceRoot, 'linked-secret.md');
        symlinkSync(join(outsideRoot, 'secret.md'), symlinkPath);
        expect(readlinkSync(symlinkPath)).toBe(join(outsideRoot, 'secret.md'));

        vi.mocked(getConfig, { partial: true }).mockResolvedValue({
            workspaceRoot,
            logger,
        });

        const result = await loadReviewContextFiles([
            '   ',
            'linked-secret.md',
        ]);

        expect(result).toEqual([]);
        expect(logger.debug).toHaveBeenCalledWith(
            'Skipping empty context file path.'
        );
        expect(logger.debug).toHaveBeenCalledWith(
            'Skipping context file outside workspace: "linked-secret.md"'
        );
    });

    it('treats the workspace root path as outside the workspace', async () => {
        const workspaceRoot = mkdtempSync(join(tmpdir(), 'lgtm-context-'));
        tempDirs.push(workspaceRoot);

        vi.mocked(getConfig, { partial: true }).mockResolvedValue({
            workspaceRoot,
            logger,
        });

        const result = await loadReviewContextFiles(['.']);

        expect(result).toEqual([]);
        expect(logger.debug).toHaveBeenCalledWith(
            'Skipping context file outside workspace: "."'
        );
    });

    it('logs read failures when a configured path resolves to a directory', async () => {
        const workspaceRoot = mkdtempSync(join(tmpdir(), 'lgtm-context-'));
        tempDirs.push(workspaceRoot);
        mkdirSync(join(workspaceRoot, 'docs'));

        vi.mocked(getConfig, { partial: true }).mockResolvedValue({
            workspaceRoot,
            logger,
        });

        const result = await loadReviewContextFiles(['docs']);

        expect(result).toEqual([]);
        expect(logger.info).toHaveBeenCalledTimes(1);
        expect(vi.mocked(logger.info).mock.calls[0]?.[0]).toMatch(
            /^Failed to load context file "docs": /
        );
    });

    it('stringifies non-Error failures when reading context files', async () => {
        const workspaceRoot = mkdtempSync(join(tmpdir(), 'lgtm-context-'));
        tempDirs.push(workspaceRoot);
        writeFileSync(join(workspaceRoot, 'README.md'), 'Repo guidance');

        vi.mocked(getConfig, { partial: true }).mockResolvedValue({
            workspaceRoot,
            logger,
        });
        vi.mocked(readFile).mockRejectedValueOnce('boom');

        const result = await loadReviewContextFiles(['README.md']);

        expect(result).toEqual([]);
        expect(logger.info).toHaveBeenCalledWith(
            'Failed to load context file "README.md": boom'
        );
    });
});
