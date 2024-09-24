import { ReviewRequest } from './ReviewRequest';

/** describes the scope of changes in version control for a given ReviewRequest  */
export type ReviewScope = {
    request: ReviewRequest;
    revisionRangeDiff: string; // revision range for `git diff`, starting at common ancestor (old...new)
    revisionRangeLog: string; // revision range for `git log`, starting at common ancestor (old..new with two dots)
    changeDescription: string;
};
