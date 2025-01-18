import { describe, expect, it } from 'vitest';

import {
    parseComment,
    parseResponse,
    sortFileCommentsBySeverity,
} from '../../../review/comment';
import { responseExample } from '../../../review/review';

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
    });
});

describe('sortFileCommentsBySeverity', () => {
    it('normal', () => {
        const fileComments = [
            {
                target: 'file2',
                comments: [
                    {
                        comment: 'Yet another review comment',
                        line: 1,
                        severity: 3,
                    },
                    {
                        comment: 'Another review comment',
                        line: 2,
                        severity: 5,
                    },
                ],
            },
            {
                target: 'file1',
                comments: [
                    {
                        comment: 'Another review comment',
                        line: 3,
                        severity: 2,
                    },
                    {
                        comment: 'Some review comment',
                        line: 4,
                        severity: 4,
                    },
                ],
            },
        ];

        const result = sortFileCommentsBySeverity(fileComments);

        expect(result).toEqual([
            {
                target: 'file2',
                comments: [
                    {
                        comment: 'Another review comment',
                        line: 2,
                        severity: 5,
                    },
                    {
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
                        comment: 'Some review comment',
                        line: 4,
                        severity: 4,
                    },
                    {
                        comment: 'Another review comment',
                        line: 3,
                        severity: 2,
                    },
                ],
                maxSeverity: 4,
            },
        ]);
    });

    it('with no comments', () => {
        const result = sortFileCommentsBySeverity([]);

        expect(result).toEqual([]);
    });
});
