import { describe, expect, it } from 'vitest';

import { parallelLimit } from '@/utils/async';

describe('parallelLimit', () => {
    it('handles empty task array', async () => {
        const result = await parallelLimit([], 3);
        expect(result).toEqual([]);
    });

    it('throws on invalid maxWorkers', async () => {
        await expect(
            parallelLimit([() => Promise.resolve(1)], 0)
        ).rejects.toThrow();
        await expect(
            parallelLimit([() => Promise.resolve(1)], -1)
        ).rejects.toThrow();
    });

    it('executes all tasks and returns results in order', async () => {
        const tasks = [
            () => Promise.resolve(1),
            () => Promise.resolve(2),
            () => Promise.resolve(3),
        ];

        const result = await parallelLimit(tasks, 2);
        expect(result).toEqual([1, 2, 3]);
    });

    it('limits concurrent execution to maxWorkers', async () => {
        const completionOrder: number[] = [];
        const tasks = [
            () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        completionOrder.push(1);
                        resolve(1);
                    }, 100);
                }),
            () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        completionOrder.push(2);

                        resolve(2);
                    }, 50);
                }),
            () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        completionOrder.push(3);
                        resolve(3);
                    }, 25);
                }),
        ];

        const result = await parallelLimit(tasks, 2);
        expect(result).toEqual([1, 2, 3]);
        expect(completionOrder).toEqual([2, 3, 1]);
    });

    it('handles maxWorkers greater than task count', async () => {
        const tasks = [() => Promise.resolve('a'), () => Promise.resolve('b')];

        const result = await parallelLimit(tasks, 5);
        expect(result).toEqual(['a', 'b']);
    });

    it('handles rejected promises', async () => {
        const tasks = [
            () => Promise.resolve(1),
            () => Promise.reject(new Error('test error')),
            () => Promise.resolve(3),
        ];

        await expect(parallelLimit(tasks, 2)).rejects.toThrow('test error');
    });

    it('preserves result order even with different execution times', async () => {
        const tasks = [
            () =>
                new Promise((resolve) => setTimeout(() => resolve('slow'), 40)),
            () => Promise.resolve('fast'),
            () =>
                new Promise((resolve) =>
                    setTimeout(() => resolve('medium'), 20)
                ),
        ];

        const result = await parallelLimit(tasks, 3);
        expect(result).toEqual(['slow', 'fast', 'medium']);
    });
});
