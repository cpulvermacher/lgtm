import { ReviewRequest } from './ReviewRequest';

/** describes the scope of changes in version control for a given ReviewRequest  */
export type ReviewScope = {
    request: ReviewRequest;
    revisionRangeDiff: string; // revision range for `git diff`
    revisionRangeLog: string; // revision range for `git log` (... and .. are swapped)
    changeDescription: string;
};
