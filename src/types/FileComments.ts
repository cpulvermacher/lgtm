import { ReviewComment } from './ReviewComment';

export type FileComments = {
    target: string; // target file
    comments: ReviewComment[];
    maxSeverity: number; // max comment severity in 0..5
};
