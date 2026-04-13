import type { PromptType } from '../types/PromptType';
import type { ReviewContextFile } from '../types/ReviewContextFile';
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
    promptType?: PromptType,
    contextFiles: ReviewContextFile[] = []
): string {
    switch (promptType) {
        case 'v2':
            return createReviewPromptV2(
                changeDescription,
                diff,
                customPrompt,
                contextFiles
            );
        // case 'v2think': // fallthrough to default
        default:
            return createReviewPromptV2Think(
                changeDescription,
                diff,
                customPrompt,
                contextFiles
            );
    }
}

export function renderContextFiles(contextFiles: ReviewContextFile[]): string {
    if (contextFiles.length === 0) {
        return '';
    }

    const renderedFiles = contextFiles
        .map(({ path, content }) => {
            const tagName = toContextTagName(path);
            return `<${tagName}>\n${content.trim()}\n</${tagName}>`;
        })
        .join('\n\n');

    return `
Here is project-wide documentation and context for the codebase where the diff applies:
${renderedFiles}`;
}

export function buildOptionalPromptContext(
    changeDescription: string | undefined,
    contextFiles: ReviewContextFile[]
): string {
    const wrappedChangeDescription = changeDescription?.trim()
        ? `
Here's the change description for context:
<change_description>
${changeDescription.trim()}
</change_description>`
        : '';
    const wrappedContextFiles = renderContextFiles(contextFiles);

    return [wrappedChangeDescription, wrappedContextFiles]
        .filter(Boolean)
        .join('\n');
}

function toContextTagName(filePath: string): string {
    const tag = Array.from(filePath)
        .map((char) => {
            if (/^[a-zA-Z0-9]$/.test(char)) {
                return char;
            }

            const hexCode = char.codePointAt(0)?.toString(16).padStart(4, '0');
            return `_x${hexCode}_`;
        })
        .join('')
        .replace(/^_+|_+$/g, '');
    return tag.length > 0 ? `context_file_${tag}` : 'context_file';
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
