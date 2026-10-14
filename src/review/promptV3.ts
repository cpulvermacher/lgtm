import type { ReviewContextFile } from '@/types/ReviewContextFile';
import { buildOptionalPromptContext, responseExample } from './prompt';

/**
 * v2think adapted for models with built-in reasoning:
 * - no request for visible reasoning (newer Claude models decline these as `reasoning_extraction`)
 * - outcome-focused instructions instead of a prescribed review process
 * - explains how comments are used, so the model reports everything and uses severity instead of self-filtering
 * - long inputs first, instructions last
 */
export function createReviewPromptV3(
    changeDescription: string | undefined,
    diff: string,
    customPrompt: string,
    contextFiles: ReviewContextFile[]
): string {
    customPrompt = customPrompt.length > 0 ? `${customPrompt.trim()}\n` : '';

    const optionalContext = buildOptionalPromptContext(
        changeDescription,
        contextFiles
    );

    return `
You are a senior software engineer reviewing a pull request.

Here is the line-number-annotated git diff to review:
<git_diff>
${diff}
</git_diff>
${optionalContext}

<diff_format>
- The diff starts with a diff header, followed by diff lines.
- Diff lines have the format \`<LINE NUMBER><TAB><DIFF TYPE><LINE>\`.
- Lines with DIFF TYPE \`+\` are added.
- Lines with DIFF TYPE \`-\` are removed. (LINE NUMBER will be 0)
- Lines with DIFF TYPE \` \` are unchanged and provided for context.
</diff_format>

<review_instructions>
Review the changes and report the issues a careful reviewer would raise: bugs, security vulnerabilities, behavior that differs from the change description, hard-to-read code, worthwhile refactorings, and typos. Consider the changeset as a whole, including how changes to different functions, classes, and files interact.

Your comments are shown to the author as comments attached to the referenced line, and comments below a user-configured severity are hidden. So:
- Report every issue you find, including minor or uncertain ones, and express impact and confidence through the severity instead of leaving issues out.
- Comment on added lines. Removed lines are context: suggest restoring old logic only when its removal causes a problem.
- Base comments on the diff and the provided context. If an issue depends on code you can't see, state your assumption in the comment.
- Make each comment specific and actionable: name the problem and, where it helps, the fix.
- Leave out praise, summaries of the change, formatting issues, and errors that a compiler or test run would catch, since the author already gets those elsewhere.
${customPrompt}</review_instructions>

<severity_scale>
- 5: Critical, such as a security vulnerability, data loss, or a crash on a common path.
- 4: A bug that causes incorrect behavior.
- 3: A likely bug in edge cases, or a significant maintainability problem.
- 2: A minor improvement, such as better readability or a small refactoring.
- 1: A nitpick, or an issue you're unsure is real.
</severity_scale>

<output_format>
Think the changes through before you answer. Respond with only a JSON array of comment objects, or an empty array if you find no issues. Each object contains:
- \`file\`: The path of the file (from the diff header)
- \`line\`: The first affected LINE NUMBER (for removed lines, use the next non-removed line; 0 if none)
- \`comment\`: A string describing the issue
- \`severity\`: An integer from 1 to 5, following the severity scale
</output_format>

<example>
\`\`\`json
${JSON.stringify(responseExample, undefined, 2)}
\`\`\`
</example>
`.trim();
}
