import { describe, expect, it } from 'vitest';

import {
    groupByFile,
    parseComment,
    splitResponseIntoComments,
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

describe('splitResponseIntoComments', () => {
    it('normal', () => {
        const response =
            ' - Some comment\n - Another comment\n  continued\n- Without leading space';
        const result = splitResponseIntoComments(response);

        expect(result).toEqual([
            'Some comment',
            'Another comment\n  continued',
            'Without leading space',
        ]);
    });

    it('with no comments', () => {
        const response = '';
        const result = splitResponseIntoComments(response);

        expect(result).toEqual([]);
    });

    it('skips lines that do not match comment format', () => {
        const response = 'Here is the review you asked for\n- Comment';
        const result = splitResponseIntoComments(response);

        expect(result).toEqual(['Comment']);
    });
});

describe('groupByFile', () => {
    it('normal', () => {
        const reviewComments = [
            {
                target: 'file2',
                comment: 'Yet another review comment',
                severity: 3,
            },
            {
                target: 'file1',
                comment: 'Another review comment',
                severity: 2,
            },
            {
                target: 'file1',
                comment: 'Some review comment',
                severity: 4,
            },
            {
                target: 'file2',
                comment: 'Another review comment',
                severity: 5,
            },
        ];

        const result = groupByFile(reviewComments);

        expect(result).toEqual([
            {
                target: 'file2',
                comments: [
                    {
                        target: 'file2',
                        comment: 'Another review comment',
                        severity: 5,
                    },
                    {
                        target: 'file2',
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
                        target: 'file1',
                        comment: 'Some review comment',
                        severity: 4,
                    },
                    {
                        target: 'file1',
                        comment: 'Another review comment',
                        severity: 2,
                    },
                ],
                maxSeverity: 4,
            },
        ]);
    });

    it('with no comments', () => {
        const reviewComments = [];
        const result = groupByFile(reviewComments);

        expect(result).toEqual([]);
    });
});
