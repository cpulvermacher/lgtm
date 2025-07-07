/// <reference types="vitest" />

import { resolve } from 'path';
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
                'src/extension.ts',
                ...coverageConfigDefaults.exclude,
            ],
            thresholds: {
                lines: 94.5,
                functions: 96.82,
                autoUpdate: true,
            },
            reporter: ['text', 'lcov'],
        },
    },
});
