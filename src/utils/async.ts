/** run the given lists of tasks in parallel, but limit the number of concurrent tasks to `maxWorkers` */
export async function parallelLimit<R>(
    tasks: (() => Promise<R>)[],
    maxWorkers: number
): Promise<R[]> {
    const results: R[] = [];
    let iTask = 0;

    // workers process the next task from the list
    async function worker() {
        while (iTask < tasks.length) {
            const i = iTask++;
            results[i] = await tasks[i]();
        }
    }

    const numWorkers = Math.min(maxWorkers, tasks.length);
    await Promise.all(Array.from({ length: numWorkers }, worker));

    return results;
}
