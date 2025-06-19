export function createReviewPrompt(
    changeDescription: string | undefined,
    diff: string,
    customPrompt: string,
    userPrompt?: string
): string {
    const defaultRules = `
- Provide comments on bugs, security vulnerabilities, code smells, and typos.
- Only provide comments for added lines.
- All comments must be actionable. Do not provide comments that are only positive feedback.
- Do not provide comments on formatting.
- Avoid repetitive comments.
- Do not make assumptions about code that is not included in the diff.
${customPrompt}
`;
    const reviewRules = userPrompt ? userPrompt.trim() : defaultRules.trim();

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

<Diff Format>
- The diff starts with a diff header, followed by diff lines.
- Diff lines have the format \`<LINE NUMBER><TAB><DIFF TYPE><LINE>\`.
- Lines with DIFF TYPE \`+\` are added.
- Lines with DIFF TYPE \`-\` are removed. (LINE NUMBER will be 0)
- Lines with DIFF TYPE \` \` are unchanged and provided for context.
</Diff Format>

<Review Rules>
${reviewRules}
</Review Rules>

<Output Rules>
- Respond with a JSON list of comments objects, which contain the fields \`file\`, \`line\`, \`comment\`, and \`severity\`.
\`file\` is the path of the file, taken from the diff header.
\`comment\` is a string describing the issue.
\`line\` is the first affected LINE NUMBER.
\`severity\` is the severity of the issue as an integer from 1 (likely irrelevant) to 5 (critical).
- Respond with only JSON, do NOT include other text or markdown.
</Output Rules>

<Output Example>
\`\`\`json
${JSON.stringify(responseExample, undefined, 2)}
\`\`\`
</Output Example>


`;
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
