import type { PromptType } from '../types/PromptType';
import { createReviewPromptV2 } from './promptV2';
import { createReviewPromptV2Think } from './promptV2Think';

export const defaultPromptType: PromptType = 'v2think';
const promptTypes: PromptType[] = ['v2', 'v2think'];

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
    promptType?: PromptType
): string {
    switch (promptType) {
        case 'v2':
            return createReviewPromptV2(changeDescription, diff, customPrompt);
        case 'v2think':
        default:
            return createReviewPromptV2Think(
                changeDescription,
                diff,
                customPrompt
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
