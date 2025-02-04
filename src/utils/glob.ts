import { minimatch } from 'minimatch';

const matchOptions = { matchBase: true };

/** Return true if the path does NOT match any of the exclude globs */
export function isPathNotExcluded(
    path: string,
    excludeGlobs: string[]
): boolean {
    return !excludeGlobs.some((exclude) => {
        return minimatch(path, exclude, matchOptions);
    });
}
