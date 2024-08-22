import { FileComments } from '../types/FileComments';
import { ReviewComment } from '../types/ReviewComment';

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
export function splitResponseIntoComments(response: string): string[] {
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

/** Returns array of review comments grouped by file path, sorted by descending severity */
export function groupByFile(reviewComments: ReviewComment[]): FileComments[] {
    const commentsByFile = new Map<string, FileComments>();
    reviewComments.forEach((review) => {
        let fileComment = commentsByFile.get(review.target);
        if (!fileComment) {
            fileComment = {
                target: review.target,
                comments: [],
                maxSeverity: 0,
            };
            commentsByFile.set(review.target, fileComment);
        }
        fileComment.comments.push(review);
        if (review.severity > fileComment.maxSeverity) {
            fileComment.maxSeverity = review.severity;
        }
    });

    //sort each file by descending severity
    for (const fileComments of commentsByFile.values()) {
        fileComments.comments.sort((a, b) => b.severity - a.severity);
    }

    //sort all files by descending max severity
    const sortedFiles = Array.from(commentsByFile.values()).sort(
        (a, b) => b.maxSeverity - a.maxSeverity
    );

    return sortedFiles;
}
