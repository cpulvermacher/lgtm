import { FileComments } from './FileComments';
import { ReviewScope } from './ReviewScope';

export type ReviewResult = {
    scope: ReviewScope;
    fileComments: FileComments[];
    errors: { file: string; error: Error }[];
};
