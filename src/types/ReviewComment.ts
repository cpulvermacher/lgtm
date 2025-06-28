import type { PromptType } from './PromptType';

export type ReviewComment = {
    file: string; // file path
    comment: string; // review comment
    line: number; // first affected line number (1-based, to-side of diff)
    severity: number; // in 0..5
    promptType?: PromptType; // which prompt was used to generate this comment (if overridden)
};
