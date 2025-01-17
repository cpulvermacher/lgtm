/** for the given array of item counts, distribute items evenly up to a total of maxItems.
 *
 * E.g.
 * distributeItems(6, [10, 20, 30]) => [2, 2, 2]
 * distributeItems(10, [2, 20, 30]) => [2, 4, 4]
 *
 */
export function distributeItems(
    maxItems: number,
    availableItems: number[]
): number[] {
    const totalItems = Math.min(
        maxItems,
        availableItems.reduce((a, b) => a + b, 0)
    );
    const distribution = Array<number>(availableItems.length).fill(0);
    let nextItemType = 0;
    for (let i = 0; i < totalItems; i++) {
        while (distribution[nextItemType] >= availableItems[nextItemType]) {
            nextItemType = (nextItemType + 1) % availableItems.length;
        }
        distribution[nextItemType]++;
        nextItemType = (nextItemType + 1) % availableItems.length;
    }

    return distribution;
}
