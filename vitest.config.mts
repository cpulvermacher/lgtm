/// <reference types="vitest" />

import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
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
                lines: 86.32,
                functions: 88.09,
                autoUpdate: true,
            },
            reporter: ['text', 'lcov'],
        },
    },
});