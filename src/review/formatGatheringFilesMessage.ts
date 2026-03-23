import type { DiffFile } from '@/types/DiffFile';

export function formatGatheringFilesMessage(
    files: DiffFile[],
    numFileNamesShown = 4
): string {
    const fileNames = files
        .slice(0, numFileNamesShown)
        .map((f) => f.file.split('/').pop() || f.file)
        .join(', ');
    const remainingCount = files.length - numFileNamesShown;

    if (remainingCount <= 0) {
        return `Gathering changes for ${fileNames}...`;
    }

    return `Gathering changes for ${fileNames}, and ${remainingCount} other ${remainingCount === 1 ? 'file' : 'files'}...`;
}
