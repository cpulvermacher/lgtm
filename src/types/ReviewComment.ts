export type ReviewComment = {
    file: string; // file path
    comment: string; // review comment
    line: number; // first affected line number (1-based, to-side of diff)
    severity: number; // in 0..5
};
