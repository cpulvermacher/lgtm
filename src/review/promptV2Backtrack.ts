import { reasoningTag, responseExample } from './prompt';

export function createReviewPromptV2Backtrack(
    changeDescription: string | undefined,
    diff: string,
    customPrompt: string,
    userPrompt?: string
): string {
    let reviewInstructions = `
- Analyze the entire git diff provided.
- Consider how the changes as a whole implement the described feature or fix.
- Focus on providing comments for added lines.
- Ensure all comments are actionable and specific.
- Avoid comments on formatting or purely positive feedback.
- Do not make assumptions about code not included in the diff.
- Consider the context of changes across different functions, classes, and files.
- Don't suggest issues that would be caught by compilations or running tests.
- Do not suggest reverting to previous logic (removed lines) without a compelling reason.
${customPrompt}
`;
    if (userPrompt && userPrompt.trim()) {
        reviewInstructions = userPrompt;
    }

    let wrappedChangeDescription = '';
    if (changeDescription && changeDescription.trim()) {
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
${reviewInstructions.trim()}
</review_instructions>

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

Before providing your final output, wrap your thought process in <${reasoningTag}> tags to show your reasoning and ensure a comprehensive review. In this process:
1. List out the files changed in the diff.
2. For each file, summarize the changes and their potential impact.
3. Identify potential issues across different categories (different from change description, bugs, security vulnerabilities, typos).
4. Consider the severity of each issue.
5. If necessary, backtrack to previous steps to refine your analysis.

<output_example>
<code_review_process>
1. Files Changed:
- src/index.html
- src/js/main.js

2. Change Summary:
- Adds a script tag including src/js/main.js in index.html
- Contains logic in main.js that duplicates calculateTotal from util.js
- Uses eval() on a possibly user-supplied string in main.js

3. Potential Issues:

Typos:
- The <script> tag is misspelled as <scirpt> in index.html

Code Quality:
- Logic in main.js duplicates calculateTotal from util.js; consider refactoring

Security:
- Using eval() with user-supplied input in main.js may result in code injection

4. Severity Assessment:
- The typo in the script tag is a moderate issue (4)
- Code duplication is a medium issue (3)
- Use of eval() with user input is a critical issue (5)
</code_review_process>

${JSON.stringify(responseExample, undefined, 2)}
</output_example>
`.trim();
}
