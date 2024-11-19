import { describe, expect, it } from 'vitest';

import { removeExcludedFiles } from '../../../utils/glob';

describe('removeExcludedFiles', () => {
    it('does not filter for empty exclude list', () => {
        const files = ['file1', 'file2', 'file3'];

        const result = removeExcludedFiles(files, []);

        expect(result).toEqual(files);
    });

    it('filters by basename for non-globs', () => {
        const files = ['path/file1', 'path/file2', 'path'];

        const result = removeExcludedFiles(files, ['file1', '2', 'path']);

        expect(result).toEqual(['path/file2']);
    });

    it('filters path by wildcard', () => {
        const files = ['path/file1', 'path/file2', 'path'];

        const result = removeExcludedFiles(files, ['*2', 'path*']);

        expect(result).toEqual(['path/file1']);
    });

    it('filters path by globstar', () => {
        const files = ['path/file1', 'path/file2', 'path'];

        const result = removeExcludedFiles(files, ['path/**']);

        expect(result).toEqual(['path']);
    });

    it('filters filenames by globstar', () => {
        const files = ['path/file.txt', 'file.txt', 'otherfile.txt'];

        expect(removeExcludedFiles(files, ['**file.txt'])).toEqual([]);
        expect(removeExcludedFiles(files, ['**/file.txt'])).toEqual([
            'otherfile.txt',
        ]);
    });

    it('filters filenames by ?', () => {
        const files = ['file1.txt', 'file2.txt', 'file99.txt'];

        const result = removeExcludedFiles(files, ['file?.txt']);

        expect(result).toEqual(['file99.txt']);
    });

    it('filters with group conditions', () => {
        const files = [
            'abc.ts',
            'path/def.ts',
            'path/ghi.js',
            'jkl.js',
            'nested/path/mno.ts',
            'some.json',
            'dir.ts/foo',
        ];

        const result = removeExcludedFiles(files, ['**/*.{ts,js}']);

        expect(result).toEqual(['some.json', 'dir.ts/foo']);
    });

    it('filters with character range', () => {
        const files = ['file1.txt', 'file2.txt', 'file99.txt'];

        const result = removeExcludedFiles(files, ['file[2-9].txt']);

        expect(result).toEqual(['file1.txt', 'file99.txt']);
    });

    it('filters with negated character range', () => {
        const files = ['file1.txt', 'file2.txt', 'file9.txt'];

        const result = removeExcludedFiles(files, ['file[^2].txt']);

        expect(result).toEqual(['file2.txt']);
    });
});
