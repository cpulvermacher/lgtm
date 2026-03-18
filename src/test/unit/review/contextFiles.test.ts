import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadReviewContextFiles } from '@/review/contextFiles';
import type { Logger } from '@/types/Logger';

describe('loadReviewContextFiles', () => {
    const tempDirs: string[] = [];
    const logger = {
        info: vi.fn(),
        debug: vi.fn(),
        setEnableDebug: vi.fn(),
        isDebugEnabled: vi.fn(() => false),
    } as Logger;

    afterEach(() => {
        vi.clearAllMocks();
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

        const result = await loadReviewContextFiles(
            workspaceRoot,
            ['AGENTS.md', 'docs/README.md'],
            logger
        );

        expect(result).toEqual([
            { path: 'AGENTS.md', content: 'Repo guidance' },
            { path: 'docs/README.md', content: 'Nested docs' },
        ]);
    });

    it('skips missing, empty, and out-of-workspace files', async () => {
        const workspaceRoot = mkdtempSync(join(tmpdir(), 'lgtm-context-'));
        tempDirs.push(workspaceRoot);
        writeFileSync(join(workspaceRoot, 'README.md'), '');

        const result = await loadReviewContextFiles(
            workspaceRoot,
            ['README.md', 'missing.md', '../outside.md'],
            logger
        );

        expect(result).toEqual([]);
        expect(logger.info).toHaveBeenCalledWith(
            'Skipping empty context file: "README.md"'
        );
        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining('Failed to load context file "missing.md"')
        );
        expect(logger.info).toHaveBeenCalledWith(
            'Skipping context file outside workspace: "../outside.md"'
        );
    });
});
