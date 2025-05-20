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
                lines: 98.39,
                functions: 100,
                autoUpdate: true,
            },
            reporter: ['text', 'lcov'],
        },
    },
});