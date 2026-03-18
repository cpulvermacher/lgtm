import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import type { Logger } from '@/types/Logger';
import type { ReviewContextFile } from '@/types/ReviewContextFile';

export async function loadReviewContextFiles(
    workspaceRoot: string,
    configuredPaths: string[],
    logger: Logger
): Promise<ReviewContextFile[]> {
    const contextFiles: ReviewContextFile[] = [];
    const realWorkspaceRoot = await realpath(workspaceRoot);

    for (const configuredPath of configuredPaths) {
        const trimmedPath = configuredPath.trim();
        if (trimmedPath.length === 0) {
            logger.info('Skipping empty context file path.');
            continue;
        }

        const absolutePath = resolve(workspaceRoot, trimmedPath);
        if (isOutsideWorkspace(workspaceRoot, absolutePath)) {
            logger.info(
                `Skipping context file outside workspace: "${trimmedPath}"`
            );
            continue;
        }

        try {
            const realAbsolutePath = await realpath(absolutePath);
            if (isOutsideWorkspace(realWorkspaceRoot, realAbsolutePath)) {
                logger.info(
                    `Skipping context file outside workspace: "${trimmedPath}"`
                );
                continue;
            }
            const relativePath = relative(realWorkspaceRoot, realAbsolutePath);

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

function isOutsideWorkspace(workspaceRoot: string, absolutePath: string) {
    const relativePath = relative(workspaceRoot, absolutePath);
    return (
        relativePath.length === 0 ||
        relativePath === '..' ||
        relativePath.startsWith(`..${sep}`) ||
        isAbsolute(relativePath)
    );
}
