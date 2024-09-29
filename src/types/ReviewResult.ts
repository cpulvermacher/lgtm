import { FileComments } from './FileComments';
import { ReviewRequest } from './ReviewRequest';

export type ReviewResult = {
    request: ReviewRequest;
    fileComments: FileComments[];
};
