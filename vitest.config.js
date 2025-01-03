/// <reference types="vitest" />

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/test/unit/**/*.test.ts'],
        clearMocks: true
    },
});