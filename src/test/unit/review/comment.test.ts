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
            comment: 'Some review comment',
            line: 123,
            severity: 4,
        });

        expect(result).toEqual({
            comment: 'Some review comment',
            line: 123,
            severity: 4,
        });
    });

    it('adds default for line/severity', () => {
        const result = parseComment({ comment: 'Some review comment' });

        expect(result).toEqual({
            comment: 'Some review comment',
            line: 1,
            severity: 3,
        });
    });

    it('throws on missing comment', () => {
        expect(() => parseComment({ line: 123, severity: 4 })).toThrow();
    });
});

describe('parseResponse', () => {
    it('normal', () => {
        const response = JSON.stringify(responseExample, undefined, 2);
        const result = parseResponse(response);

        expect(result).toEqual(responseExample);
    });

    it('with no comments', () => {
        const response = '[]';
        const result = parseResponse(response);

        expect(result).toEqual([]);
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
