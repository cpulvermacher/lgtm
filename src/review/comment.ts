import { FileComments } from '../types/FileComments';
import { ReviewComment } from '../types/ReviewComment';
import { parseAsJsonArray } from '../utils/json';

/** Parse model response into individual comments  */
export function parseResponse(response: string): ReviewComment[] {
    const parsedArray = parseAsJsonArray(response);
    const comments: ReviewComment[] = [];
    for (const item of parsedArray) {
        try {
            comments.push(parseComment(item));
        } catch (error) {
            console.warn(
                'Failed to parse comment:',
                error instanceof Error ? error.message : error
            );
        }
    }
    return comments;
}

/** Hopefully parse an object into a ReviewComment; throws if it's badly wrong */
export function parseComment(comment: unknown): ReviewComment {
    if (!comment || typeof comment !== 'object') {
        throw new Error('Expected comment');
    }
    if (
        !('file' in comment) ||
        typeof comment.file !== 'string' ||
        !comment.file
    ) {
        throw new Error('Missing `file` field in ' + JSON.stringify(comment));
    }
    if (!('comment' in comment) || typeof comment.comment !== 'string') {
        throw new Error('Missing `comment` field');
    }

    let line = 1;
    if (
        'line' in comment &&
        typeof comment.line === 'number' &&
        comment.line >= 0 // keep 0 to know if we got invalid values
    ) {
        line = comment.line;
    }

    let severity = 1; // fallback to lowest severity in case of invalid values
    if (
        'severity' in comment &&
        typeof comment.severity === 'number' &&
        comment.severity >= 1 &&
        comment.severity <= 5
    ) {
        severity = comment.severity;
    }

    return {
        file: comment.file,
        comment: comment.comment.trim(),
        line,
        severity,
    };
}

/** Returns comments in descending order of severity */
export function sortFileCommentsBySeverity(
    comments: Omit<FileComments, 'maxSeverity'>[]
): FileComments[] {
    const commentsByFile = new Map<string, FileComments>();
    for (const comment of comments) {
        //sort comments for this file by descending severity
        const sortedComments = Array.from(comment.comments);
        sortedComments.sort((a, b) => b.severity - a.severity);

        if (sortedComments.length === 0) {
            continue;
        }
        const maxSeverity = sortedComments[0].severity;

        commentsByFile.set(comment.target, {
            ...comment,
            comments: sortedComments,
            maxSeverity,
        });
    }

    //sort all files by descending max severity
    const sortedFiles = Array.from(commentsByFile.values()).sort(
        (a, b) => b.maxSeverity - a.maxSeverity
    );

    return sortedFiles;
}
