import { DiffFile } from './DiffFile';
import { FileComments } from './FileComments';
import { ReviewRequest } from './ReviewRequest';

export type ReviewResult = {
    request: ReviewRequest;
    files: DiffFile[];
    fileComments: FileComments[];
    errors: Error[];
};
