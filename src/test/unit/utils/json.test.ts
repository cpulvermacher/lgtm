import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseAsJsonArray } from '@/utils/json';

describe('parseAsJsonArray', () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        // mock console.warn before each test
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
    });
    afterEach(() => {
        consoleWarnSpy.mockRestore();
    });

    it('parses valid JSON array', () => {
        const input =
            '[{"name": "test", "value": 123}, {"name": "example", "value": 456}]';
        const result = parseAsJsonArray(input);

        expect(result).toEqual([
            { name: 'test', value: 123 },
            { name: 'example', value: 456 },
        ]);
    });

    it('extracts JSON array from text with surrounding content', () => {
        const input =
            'Here is an array: [{"name": "test", "value": 123}] and some more text';
        const result = parseAsJsonArray(input);

        expect(result).toEqual([{ name: 'test', value: 123 }]);
    });

    it('returns empty array when no JSON array found', () => {
        const input = 'No array here';
        const result = parseAsJsonArray(input);

        expect(result).toEqual([]);
    });

    it('falls back to jsonc-parser for invalid JSON', () => {
        // JSON with comments and trailing comma, which standard JSON.parse would reject
        const input = `[
            {
                "name": "test", // with comment
                "value": 123,   // trailing comma
            },
            {
                "name": "example",
                "value": 456
            }
        ]`;

        const result = parseAsJsonArray(input);

        // Verify the fallback warning was logged
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            'LGTM: Failed to parse JSON, falling back to jsonc-parser for more tolerant parsing'
        );

        // Verify the correct result despite JSON issues
        expect(result).toEqual([
            { name: 'test', value: 123 },
            { name: 'example', value: 456 },
        ]);
    });

    it('throws error when JSON.parse returns a non-array', () => {
        // Mock the JSON.parse to return an object instead of an array
        const originalJSONParse = JSON.parse;
        JSON.parse = vi.fn().mockReturnValue({ notAnArray: true });

        try {
            expect(() => parseAsJsonArray('[1,2,3]')).toThrow(
                'Expected an array of comments, got type: object'
            );
        } finally {
            // Restore the original function
            JSON.parse = originalJSONParse;
        }
    });

    it('handles arrays with invalid elements', () => {
        // An array with some invalid JSON inside the elements
        const input = '[{"valid": true}, {"invalid": undefined}]';

        // We expect the jsonc-parser to handle this better than JSON.parse
        const result = parseAsJsonArray(input);

        // The result should contain at least the valid part
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ valid: true });
    });

    it('handles JSON with invalid escapes', () => {
        // ` does not need to be escaped in JSON
        const input = '[{"name": "test\\`", "value": 123}]';

        const result = parseAsJsonArray(input);

        expect(result).toEqual([{ name: 'test', value: 123 }]);
    });
});
