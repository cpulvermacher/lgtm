import * as fs from 'fs';
import * as path from 'path';

import type { Config } from '@/types/Config';
import type { ReviewResult } from '@/types/ReviewResult';

export function saveToFile(config: Config, result: ReviewResult): void {
    try {
        const debugDir = path.join(config.workspaceRoot, '.lgtm-debug');

        if (!fs.existsSync(debugDir)) {
            fs.mkdirSync(debugDir, { recursive: true });
        }

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `review-result-${timestamp}.json`;
        const filePath = path.join(debugDir, filename);

        const info = {
            options: config.getOptions(),
            ...result,
        };
        const jsonData = JSON.stringify(info, null, 2);
        fs.writeFileSync(filePath, jsonData, 'utf8');

        config.logger.debug(`ReviewResult saved to: ${filePath}`);
    } catch (error) {
        config.logger.info(
            `Failed to save ReviewResult to file: ${
                error instanceof Error ? error.message : 'Unknown error'
            }`
        );
    }
}
