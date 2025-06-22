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
        clearMocks: true,
        coverage: {
            include: ['src/**/*.ts'],
            exclude: [
                'src/test/**',
                'src/vscode/**',
                'src/extension.ts',
                ...coverageConfigDefaults.exclude,
            ],
            thresholds: {
                lines: 93.45,
                functions: 98.3,
                autoUpdate: true,
            },
            reporter: ['text', 'lcov'],
        },
    },
});