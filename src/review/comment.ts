import { FileComments } from '../types/FileComments';

export function parseComment(comment: string) {
    comment = comment.trim();
    const severityRegex = /(\d)\/5$/;
    const severityMatch = comment.match(severityRegex);

    return {
        comment: comment.replace(severityRegex, '').trim(),
        severity: severityMatch ? parseInt(severityMatch[1]) : 3,
    };
}

/** Parse model response into individual comments  */
export function parseResponse(response: string): string[] {
    const rawComments: string[] = [];
    const lines = response.split('\n');
    const commentStartRegex = /^\s*- /;

    let comment = '';
    for (const line of lines) {
        if (line.match(commentStartRegex)) {
            if (comment) {
                rawComments.push(comment);
            }
            comment = line.replace(commentStartRegex, '');
        } else if (comment === '') {
            console.warn('Line does not match comment format, skipping:', line);
        } else {
            comment += '\n' + line;
        }
    }
    if (comment.trim() !== '') {
        rawComments.push(comment);
    }

    return rawComments;
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
