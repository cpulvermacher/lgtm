import { describe, expect, it } from 'vitest';

import {
    parseComment,
    parseResponse,
    sortFileCommentsBySeverity,
} from '../../../review/comment';

describe('parseComment', () => {
    it('normal', () => {
        const result = parseComment('Some review comment\n4/5');

        expect(result).toEqual({
            comment: 'Some review comment',
            severity: 4,
        });
    });

    it('with no severity', () => {
        const result = parseComment('Some review comment');

        expect(result).toEqual({
            comment: 'Some review comment',
            severity: 3,
        });
    });
});

describe('parseResponse', () => {
    it('normal', () => {
        const response =
            ' - Some comment\n - Another comment\n  continued\n- Without leading space';
        const result = parseResponse(response);

        expect(result).toEqual([
            'Some comment',
            'Another comment\n  continued',
            'Without leading space',
        ]);
    });

    it('with no comments', () => {
        const response = '';
        const result = parseResponse(response);

        expect(result).toEqual([]);
    });

    it('skips lines that do not match comment format', () => {
        const response = 'Here is the review you asked for\n- Comment';
        const result = parseResponse(response);

        expect(result).toEqual(['Comment']);
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
                        severity: 3,
                    },
                    {
                        comment: 'Another review comment',
                        severity: 5,
                    },
                ],
            },
            {
                target: 'file1',
                comments: [
                    {
                        comment: 'Another review comment',
                        severity: 2,
                    },
                    {
                        comment: 'Some review comment',
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
                        severity: 5,
                    },
                    {
                        comment: 'Yet another review comment',
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
                        severity: 4,
                    },
                    {
                        comment: 'Another review comment',
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
