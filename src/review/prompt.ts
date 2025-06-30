import type { PromptType } from '../types/PromptType';
import { createReviewPromptV1 } from './promptV1';
import { createReviewPromptV2 } from './promptV2';
import { createReviewPromptV2Backtrack } from './promptV2Backtrack';
import { createReviewPromptV2Think } from './promptV2Think';

export const defaultPromptType: PromptType = 'v2think';
const promptTypes: PromptType[] = ['v1', 'v2', 'v2think', 'v2backtrack'];

export const reasoningTag = 'code_review_process';

function toPromptType(type: string): PromptType {
    if (!promptTypes.includes(type as PromptType)) {
        throw new Error(
            `Invalid prompt type: ${type}. Valid types are: ${promptTypes.join(', ')}`
        );
    }
    return type as PromptType;
}

export function toPromptTypes(
    types: string | undefined
): (PromptType | undefined)[] {
    if (!types) {
        return [undefined]; // same as default prompt type, but comments are not marked with it
    }
    return types.split(',').map((type) => toPromptType(type.trim()));
}

export function createReviewPrompt(
    changeDescription: string | undefined,
    diff: string,
    customPrompt: string,
    userPrompt?: string,
    promptType?: PromptType
): string {
    const type = promptType || defaultPromptType;
    if (type === 'v2') {
        return createReviewPromptV2(
            changeDescription,
            diff,
            customPrompt,
            userPrompt
        );
    } else if (type === 'v2think') {
        return createReviewPromptV2Think(
            changeDescription,
            diff,
            customPrompt,
            userPrompt
        );
    } else if (type === 'v2backtrack') {
        return createReviewPromptV2Backtrack(
            changeDescription,
            diff,
            customPrompt,
            userPrompt
        );
    } else {
        return createReviewPromptV1(
            changeDescription,
            diff,
            customPrompt,
            userPrompt
        );
    }
}

export const responseExample = [
    {
        file: 'src/index.html',
        line: 23,
        comment: 'The <script> tag is misspelled as <scirpt>.',
        severity: 4,
    },
    {
        file: 'src/js/main.js',
        line: 43,
        comment:
            'This method duplicates some of the logic defined in `calculateTotal` inside `src/js/util.js`. Consider refactoring this into a separate helper function to improve readability and reduce duplication.',
        severity: 3,
    },
    {
        file: 'src/js/main.js',
        line: 55,
        comment:
            'Using `eval()` with a possibly user-supplied string may result in code injection.',
        severity: 5,
    },
];
