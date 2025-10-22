import { responseExample } from './prompt';

export function createReviewPromptV2(
    changeDescription: string | undefined,
    diff: string,
    customPrompt: string
): string {
    customPrompt = customPrompt.length > 0 ? `${customPrompt.trim()}\n` : '';

    let wrappedChangeDescription = '';
    if (changeDescription?.trim()) {
        wrappedChangeDescription = `
Here's the change description for context:
<change_description>
${changeDescription.trim()}
</change_description>`;
    }

    return `
You are a senior software engineer tasked with reviewing a pull request. Your goal is to analyze the provided git diff and offer insightful, actionable comments on code issues. Focus on identifying bugs, security vulnerabilities, unreadable code, possible refactorings, and typos while considering the changeset as a whole.

Here is the git diff to analyze:
<git_diff>
${diff}
</git_diff>
${wrappedChangeDescription}

<review_instructions>
- Analyze the entire git diff provided.
- Consider how the changes as a whole implement the described feature or fix.
- Focus on providing comments for added lines.
- Ensure all comments are actionable and specific.
- Avoid comments on formatting or purely positive feedback.
- Do not make assumptions about code not included in the diff.
- Consider the context of changes across different functions, classes, and files.
- Don't suggest issues that would be caught by compilations or running tests.
- Do not suggest reverting to previous logic (removed lines) without a compelling reason.
${customPrompt}</review_instructions>

<diff_format>
- The diff starts with a diff header, followed by diff lines.
- Diff lines have the format \`<LINE NUMBER><TAB><DIFF TYPE><LINE>\`.
- Lines with DIFF TYPE \`+\` are added.
- Lines with DIFF TYPE \`-\` are removed. (LINE NUMBER will be 0)
- Lines with DIFF TYPE \` \` are unchanged and provided for context.
</diff_format>

<output_format>
Respond with a JSON array of comment objects. Each object should contain:
- \`file\`: The path of the file (from the diff header)
- \`line\`: The first affected LINE NUMBER
- \`comment\`: A string describing the issue
- \`severity\`: An integer from 1 (likely irrelevant) to 5 (critical)
</output_format>

<output_example>
\`\`\`json
${JSON.stringify(responseExample, undefined, 2)}
\`\`\`
</output_example>
`.trim();
}
