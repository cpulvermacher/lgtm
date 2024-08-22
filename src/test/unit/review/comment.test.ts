import { describe, expect, it } from 'vitest';

import {
    parseComment,
    splitResponseIntoComments,
} from '../../../review/comment';

describe('comment', () => {
    it('parseComment', () => {
        const result = parseComment('Some review comment\n4/5');

        expect(result).toEqual({
            comment: 'Some review comment',
            severity: 4,
        });
    });

    it('parseComment with no severity', () => {
        const result = parseComment('Some review comment');

        expect(result).toEqual({
            comment: 'Some review comment',
            severity: 3,
        });
    });

    it('splitResponseIntoComments', () => {
        const response = ' - Some comment\n - Another comment\n  continued';
        const result = splitResponseIntoComments(response);

        expect(result).toEqual([
            ' - Some comment',
            ' - Another comment\n  continued',
        ]);
    });

    it('splitResponseIntoComments with no comments', () => {
        const response = '';
        const result = splitResponseIntoComments(response);

        expect(result).toEqual([]);
    });
});
