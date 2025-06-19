import type { PromptType } from '../types/PromptType';
import { createReviewPromptV1 } from './promptV1';
import { createReviewPromptV2 } from './promptV2';

export const defaultPromptType: PromptType = 'v1';
const promptTypes: PromptType[] = ['v1', 'v2'];

export function toPromptType(type: string | undefined): PromptType | undefined {
    if (promptTypes.includes(type as PromptType)) {
        return type as PromptType;
    }
    return undefined;
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
