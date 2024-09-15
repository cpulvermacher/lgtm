import { FileComments } from '../types/FileComments';
import { ReviewComment } from '../types/ReviewComment';

export function parseComment(comment: object): ReviewComment {
    if (!('comment' in comment) || typeof comment['comment'] !== 'string') {
        throw new Error('Expected comment');
    }

    let line = 1;
    if ('line' in comment && typeof comment['line'] === 'number') {
        line = comment['line'];
    }

    let severity = 3;
    if ('severity' in comment && typeof comment['severity'] === 'number') {
        severity = comment['severity'];
    }

    return {
        comment: comment['comment'].trim(),
        line,
        severity,
    };
}

/** Parse model response into individual comments  */
export function parseResponse(response: string): ReviewComment[] {
    let rawComments = [];
    try {
        rawComments = JSON.parse(response);
    } catch {
        // try removing additional text before parsing
        const start = response.indexOf('[');
        const end = response.lastIndexOf(']');
        if (start === -1 || end === -1) {
            console.error('Failed to find comments:', response, start, end);
            return [];
        }

        try {
            rawComments = JSON.parse(response.slice(start, end + 1));
        } catch (error) {
            console.error('Failed to parse response:', error);
            return [];
        }
    }

    if (!Array.isArray(rawComments)) {
        console.error('response is not a list:', response);
        return [];
    }

    return rawComments.map(parseComment);
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
