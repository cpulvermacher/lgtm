export type ReviewComment = {
    comment: string; // review comment
    line: number; // first line number (to-side of diff)
    severity: number; // in 0..5
};
