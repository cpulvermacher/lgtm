import type { ReviewComment } from './ReviewComment';
import type { ReviewResult } from './ReviewResult';

export type ModelSelection = string | string[];

export type ReviewChangesCommandOptions = {
    target?: string;
    topic?: string;
    base?: string;
    scope?: 'staged' | 'unstaged';
    staged?: boolean;
    unstaged?: boolean;
    models?: ModelSelection;
    modelIds?: ModelSelection;
    reviewProviderIds?: ModelSelection;
};

export type ReviewChangesComment = ReviewComment & {
    modelId: string;
    modelName: string;
};

export type ReviewChangesError = {
    modelId?: string;
    modelName?: string;
    name: string;
    message: string;
    stack?: string;
};

export type ReviewChangesResult = {
    message: string;
    cancelled: boolean;
    comments: ReviewChangesComment[];
    errors: ReviewChangesError[];
    results: {
        modelId: string;
        modelName: string;
        result: ReviewResult;
    }[];
};
