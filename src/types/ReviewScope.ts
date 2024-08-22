import { ReviewRequest } from './ReviewRequest';

/** describes the scope of changes in version control for a given ReviewRequest  */
export type ReviewScope = {
    request: ReviewRequest;
    revisionRange: string;
    changeDescription: string;
};
