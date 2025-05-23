import { FileComments } from '../types/FileComments';
import { ReviewComment } from '../types/ReviewComment';

/** Parse model response into individual comments  */
export function parseResponse(response: string): ReviewComment[] {
    return parseAsJsonArray(response).map(parseComment);
}

/** Parse JSON string from model into array */
function parseAsJsonArray(response: string): unknown[] {
    // remove additional text before parsing (most responses are wrapped in markup code blocks)
    const start = response.indexOf('[');
    const end = response.lastIndexOf(']');
    if (start === -1 || end === -1) {
        return [];
    }

    try {
        const rawComments: unknown = JSON.parse(response.slice(start, end + 1));
        if (!Array.isArray(rawComments)) {
            return [];
        }
        return rawComments;
    } catch {
        return [];
    }
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
        throw new Error('Missing `file` field');
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
