import { readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import type { Logger } from '@/types/Logger';
import type { ReviewContextFile } from '@/types/ReviewContextFile';

export async function loadReviewContextFiles(
    workspaceRoot: string,
    configuredPaths: string[],
    logger: Logger
): Promise<ReviewContextFile[]> {
    const contextFiles: ReviewContextFile[] = [];

    for (const configuredPath of configuredPaths) {
        const trimmedPath = configuredPath.trim();
        if (trimmedPath.length === 0) {
            continue;
        }

        const absolutePath = resolve(workspaceRoot, trimmedPath);
        const relativePath = relative(workspaceRoot, absolutePath);
        if (
            relativePath.length === 0 ||
            relativePath === '..' ||
            relativePath.startsWith(`..${sep}`)
        ) {
            logger.info(
                `Skipping context file outside workspace: "${trimmedPath}"`
            );
            continue;
        }

        try {
            const content = (await readFile(absolutePath, 'utf8')).trim();
            if (content.length === 0) {
                logger.info(`Skipping empty context file: "${trimmedPath}"`);
                continue;
            }

            contextFiles.push({
                path: relativePath.split(sep).join('/'),
                content,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            logger.info(
                `Failed to load context file "${trimmedPath}": ${message}`
            );
        }
    }

    return contextFiles;
}
