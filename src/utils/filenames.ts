import { closest } from 'fastest-levenshtein';

/** return closest match using Levenshtein distance */
export function correctFilename(file: string, files: string[]): string {
    return closest(file, files);
}
