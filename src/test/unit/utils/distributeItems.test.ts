import { describe, expect, it } from 'vitest';

import { distributeItems } from '../../../utils/distributeItems';

describe('distributeItems', () => {
    it('handles empty input', () => {
        expect(distributeItems(10, [])).toEqual([]);
    });

    it('hnadles total available items < maxItems', () => {
        expect(distributeItems(10, [1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('still returns the same size array with maxItems=0', () => {
        expect(distributeItems(0, [1, 2, 3])).toEqual([0, 0, 0]);
    });

    it('still returns the same size array with maxItems<0', () => {
        expect(distributeItems(-2124, [1, 2, 3])).toEqual([0, 0, 0]);
    });

    it('handles maxItems > totalItems', () => {
        expect(distributeItems(10, [1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('handles maxItems < totalItems', () => {
        expect(distributeItems(6, [10, 20, 30])).toEqual([2, 2, 2]);
    });

    it('handles maxItems < totalItems, with few items in one category', () => {
        expect(distributeItems(10, [2, 20, 30])).toEqual([2, 4, 4]);
        expect(distributeItems(10, [20, 2, 30])).toEqual([4, 2, 4]);
        expect(distributeItems(10, [20, 30, 2])).toEqual([4, 4, 2]);
    });

    it('handles single category', () => {
        expect(distributeItems(10, [5])).toEqual([5]);
        expect(distributeItems(5, [10])).toEqual([5]);
        expect(distributeItems(10, [0])).toEqual([0]);
    });
});
