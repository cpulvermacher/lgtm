import { describe, expect, it } from 'vitest';

import {
    parseComment,
    parseResponse,
    sortFileCommentsBySeverity,
} from '@/review/comment';
import { responseExample } from '@/review/ModelRequest';
import type { FileComments } from '@/types/FileComments';

describe('parseComment', () => {
    it('normal', () => {
        const result = parseComment({
            file: 'a.js',
            comment: 'Some review comment',
            line: 123,
            severity: 4,
        });

        expect(result).toEqual({
            file: 'a.js',
            comment: 'Some review comment',
            line: 123,
            severity: 4,
        });
    });

    it('uses default for line/severity', () => {
        const result = parseComment({
            file: 'a.js',
            comment: 'Some review comment',
        });

        expect(result).toEqual({
            file: 'a.js',
            comment: 'Some review comment',
            line: 1,
            severity: 1,
        });
    });

    it('uses default for out-of-range line', () => {
        const result = parseComment({
            file: 'a.js',
            comment: 'Some review comment',
            line: -1,
            severity: 4,
        });

        expect(result).toEqual({
            file: 'a.js',
            comment: 'Some review comment',
            line: 1,
            severity: 4,
        });
    });

    it('uses default for out-of-range severity', () => {
        const result = parseComment({
            file: 'a.js',
            comment: 'Some review comment',
            line: 123,
            severity: 6,
        });

        expect(result).toEqual({
            file: 'a.js',
            comment: 'Some review comment',
            line: 123,
            severity: 1,
        });
    });

    it('throws on invalid comment', () => {
        expect(() => parseComment('abc' as unknown as object)).toThrow();
    });

    it('throws on missing file field', () => {
        expect(() =>
            parseComment({ comment: ' text ', line: 123, severity: 4 })
        ).toThrow();
    });

    it('throws on empty file field', () => {
        expect(() =>
            parseComment({
                file: '',
                comment: ' text ',
                line: 123,
                severity: 4,
            })
        ).toThrow();
    });

    it('throws on missing comment field', () => {
        expect(() =>
            parseComment({ file: 'abc', line: 123, severity: 4 })
        ).toThrow();
    });
});

describe('parseResponse', () => {
    const responseJsonString = JSON.stringify(responseExample, undefined, 2);

    it('normal', () => {
        const result = parseResponse(responseJsonString);

        expect(result).toEqual(responseExample);
    });

    it('handles extra bits around JSON', () => {
        const wrappedJson = '```json\n' + responseJsonString + '\n```';

        const result = parseResponse(wrappedJson);

        expect(result).toEqual(responseExample);
    });

    it('returns empty list with no comments', () => {
        const result = parseResponse('[]');

        expect(result).toEqual([]);
    });

    it('returns empty list if no JSON array found ', () => {
        expect(parseResponse('abc')).toEqual([]);
        expect(parseResponse('{}')).toEqual([]);
    });

    it('returns empty list on invalid JSON inside JSON array', () => {
        expect(parseResponse('[abc]')).toEqual([]);
        expect(parseResponse('[{abc}]')).toEqual([]);
    });

    it('returns partial results if part of the JSON array is invalid', () => {
        const json = `[
            ${JSON.stringify(responseExample[0])},
            {"something that's not a comment"}
    ]`;

        const result = parseResponse(json);

        expect(result).toEqual([responseExample[0]]);
    });
});

describe('sortFileCommentsBySeverity', () => {
    it('normal', () => {
        const fileComments: FileComments[] = [
            {
                target: 'file2',
                comments: [
                    {
                        file: 'file2',
                        comment: 'Yet another review comment',
                        line: 1,
                        severity: 3,
                    },
                    {
                        file: 'file2',
                        comment: 'Another review comment',
                        line: 2,
                        severity: 5,
                    },
                ],
                maxSeverity: 5,
            },
            {
                target: 'file1',
                comments: [
                    {
                        file: 'file1',
                        comment: 'Another review comment',
                        line: 3,
                        severity: 2,
                    },
                    {
                        file: 'file1',
                        comment: 'Some review comment',
                        line: 4,
                        severity: 4,
                    },
                ],
                maxSeverity: 4,
            },
        ];

        const result = sortFileCommentsBySeverity(fileComments);
        const expectedFileComments: FileComments[] = [
            {
                target: 'file2',
                comments: [
                    {
                        file: 'file2',
                        comment: 'Another review comment',
                        line: 2,
                        severity: 5,
                    },
                    {
                        file: 'file2',
                        comment: 'Yet another review comment',
                        line: 1,
                        severity: 3,
                    },
                ],
                maxSeverity: 5,
            },
            {
                target: 'file1',
                comments: [
                    {
                        file: 'file1',
                        comment: 'Some review comment',
                        line: 4,
                        severity: 4,
                    },
                    {
                        file: 'file1',
                        comment: 'Another review comment',
                        line: 3,
                        severity: 2,
                    },
                ],
                maxSeverity: 4,
            },
        ];
        expect(result).toEqual(expectedFileComments);
    });

    it('with no comments', () => {
        const result = sortFileCommentsBySeverity([]);

        expect(result).toEqual([]);
    });

    it('skips files with no comments', () => {
        const fileComments: FileComments[] = [
            {
                target: 'file2',
                comments: [],
                maxSeverity: 5, // nonsense, but should be ignored
            },
            {
                target: 'file1',
                comments: [
                    {
                        file: 'file1',
                        comment: 'Another review comment',
                        line: 3,
                        severity: 2,
                    },
                    {
                        file: 'file1',
                        comment: 'Some review comment',
                        line: 4,
                        severity: 4,
                    },
                ],
                maxSeverity: 4,
            },
        ];

        const result = sortFileCommentsBySeverity(fileComments);
        const expectedFileComments: FileComments[] = [
            {
                target: 'file1',
                comments: [
                    {
                        file: 'file1',
                        comment: 'Some review comment',
                        line: 4,
                        severity: 4,
                    },
                    {
                        file: 'file1',
                        comment: 'Another review comment',
                        line: 3,
                        severity: 2,
                    },
                ],
                maxSeverity: 4,
            },
        ];
        expect(result).toEqual(expectedFileComments);
    });
});
