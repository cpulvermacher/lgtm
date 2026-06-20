/// <reference types="vitest" />

import { resolve } from 'node:path';
import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        },
    },
    test: {
        include: ['src/test/unit/**/*.test.ts'],
        mockReset: true,
        coverage: {
            include: ['src/**/*.ts'],
            exclude: [
                'src/test/**',
                'src/vscode/**',
                'src/types/**',
                'src/extension.ts',
                ...coverageConfigDefaults.exclude,
            ],
            thresholds: {
                lines: 98.86,
                functions: 98.58,
                autoUpdate: true,
            },
            reporter: ['text', 'lcov'],
        },
    },
});
