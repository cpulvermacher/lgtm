import { reasoningTag } from './prompt';
import { createReviewPromptV2 } from './promptV2';

export function createReviewPromptV2Think(
    changeDescription: string | undefined,
    diff: string,
    customPrompt: string,
    userPrompt?: string
): string {
    const promptv2 = createReviewPromptV2(
        changeDescription,
        diff,
        customPrompt,
        userPrompt
    );

    const thinking = `
Before providing your final output, wrap your thought process in <${reasoningTag}> tags to show your reasoning and ensure a comprehensive review. In this process:
1. List out the files changed in the diff.
2. For each file, summarize the changes and their potential impact.
3. Identify potential issues across different categories (different from change description, bugs, security vulnerabilities, typos).
4. Consider the severity of each issue.
It's OK for this section to be quite long.
`;

    return `
${promptv2}

${thinking.trim()}
`.trim();
}
