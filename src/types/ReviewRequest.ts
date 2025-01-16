/** describes a review request */
export type ReviewRequest = {
    scope: ReviewScope;
    userPrompt?: string; // optional replacement prompt for this review
};

/** describes the scope of changes in version control for a given review request  */
export type ReviewScope = {
    target: string; // target ref (branch, tag, commit, ...)
    base: string; // base ref (branch, tag, commit, ...)
    isTargetCheckedOut: boolean;
    revisionRangeDiff: string; // revision range for `git diff`, starting at common ancestor (old...new)
    revisionRangeLog: string; // revision range for `git log`, starting at common ancestor (old..new with two dots)
    changeDescription: string;
};
