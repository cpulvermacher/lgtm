import { minimatch } from 'minimatch';

/** Return all file paths that do NOT match any of the exclude globs */
export function filterExcludedFiles(
    files: string[],
    excludeGlobs: string[]
): string[] {
    const matchOptions = { matchBase: true };
    return files.filter((path) => {
        return !excludeGlobs.some((exclude) => {
            return minimatch(path, exclude, matchOptions);
        });
    });
}
