import { describe, expect, it } from 'vitest';

import { correctFilename } from '../../../utils/filenames';

describe('correctFilename', () => {
    it('returns exact match', () => {
        expect(correctFilename('a.js', ['a.js'])).toBe('a.js');
    });

    it('adjusts file name to closest match', () => {
        const files = ['a.ts', 'index.js', 'some/longer/path/config.json'];

        expect(correctFilename('a.js', files)).toBe('a.ts');
        expect(correctFilename('index.ts', files)).toBe('index.js');

        // TODO this isn't really nice.
        // Consider using a different algorithm (e.g. Smith-Waterman) once failure modes are clearer
        expect(correctFilename('config.json', files)).toBe('index.js');
    });

    it('returns undefined if no matching file found', () => {
        expect(correctFilename('a.js', [])).toBeUndefined();
    });
});
