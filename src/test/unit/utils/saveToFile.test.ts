import type { Config } from '@/types/Config';
import type { Logger } from '@/types/Logger';
import type { ReviewResult } from '@/types/ReviewResult';
import { saveToFile } from '@/utils/saveToFile';
import * as fs from 'fs';
import { describe, expect, it, vi } from 'vitest';

describe('saveToFile', () => {
    vi.mock('fs', () => ({
        existsSync: vi.fn(),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
    }));

    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
    } as unknown as Logger;
    const config = {
        workspaceRoot: '/test/workspace',
        getOptions: vi.fn(),
        logger,
    } as unknown as Config;

    it('saves review result to file when saveOutputToFile is enabled', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);

        saveToFile(config, { result: 'content' } as unknown as ReviewResult);

        expect(fs.mkdirSync).toHaveBeenCalledWith(
            '/test/workspace/.lgtm-debug',
            { recursive: true }
        );
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            expect.stringMatching(
                /\/test\/workspace\/\.lgtm-debug\/review-result-.*\.json/
            ),
            expect.stringContaining('"content"'),
            'utf8'
        );
        expect(config.logger.debug).toHaveBeenCalledWith(
            expect.stringMatching(
                /ReviewResult saved to: \/test\/workspace\/\.lgtm-debug\/review-result-.*\.json/
            )
        );
    });

    it('handles file saving errors gracefully', () => {
        vi.mocked(fs.existsSync).mockReturnValue(false);
        vi.mocked(fs.writeFileSync).mockImplementation(() => {
            throw new Error('Permission denied');
        });
        saveToFile(config, { result: 'content' } as unknown as ReviewResult);

        expect(config.logger.info).toHaveBeenCalledWith(
            'Failed to save ReviewResult to file: Permission denied'
        );
    });
});
