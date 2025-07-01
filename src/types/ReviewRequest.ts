import type { UncommittedRef } from './Ref';

export type ReviewRequest = {
    scope: ReviewScope;
};

/** scope of changes in version control for a given review request  */
export type ReviewScope = RefReviewScope | UncommittedReviewScope;

export type RefReviewScope = {
    target: string; // target ref (branch, tag, commit, ...)
    base: string; // base ref (branch, tag, commit, ...)
    isCommitted: true;
    isTargetCheckedOut: boolean;
    revisionRangeDiff: string; // revision range for `git diff`, starting at common ancestor (old...new)
    revisionRangeLog: string; // revision range for `git log`, starting at common ancestor (old..new with two dots)
    changeDescription: string;
};

export type UncommittedReviewScope = {
    target: UncommittedRef;
    isCommitted: false;
    isTargetCheckedOut: true;
    changeDescription?: string;
};
