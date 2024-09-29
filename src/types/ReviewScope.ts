/** describes the scope of changes in version control for a given ReviewRequest  */
export type ReviewScope = {
    target: string; // target ref (branch, tag, commit, ...)
    base: string; // base ref (branch, tag, commit, ...)
    isTargetCheckedOut: boolean;
    revisionRangeDiff: string; // revision range for `git diff`, starting at common ancestor (old...new)
    revisionRangeLog: string; // revision range for `git log`, starting at common ancestor (old..new with two dots)
    changeDescription: string;
};
