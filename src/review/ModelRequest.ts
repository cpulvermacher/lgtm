import type { CancellationToken } from 'vscode';

import type { Config } from '../types/Config';

export class ModelRequest {
    public files: string[] = [];
    private diffs: string[] = [];
    private customPrompt: string;

    constructor(
        private readonly config: Config,
        private changeDescription: string | undefined,
        private userPrompt?: string
    ) {
        this.customPrompt = config.getOptions().customPrompt;
    }

    /** add diff for one file, throw if we cannot fit this into the current request (caller should create new ModelRequest) */
    async addDiff(fileName: string, diff: string) {
        if (this.diffs.length === 0) {
            await this.setFirstDiff(fileName, diff);
            return;
        }

        // add diff to a copy of the current diffs
        const newDiffs = this.diffs.slice();
        newDiffs.push(diff);

        // build prompt with the new diff set
        const prompt = this.buildPrompt(newDiffs);
        const numTokens = await this.config.model.countTokens(prompt);
        if (numTokens > this.config.model.maxInputTokens) {
            throw new Error(
                `Cannot add diff to request, prompt size ${numTokens} exceeds limit`
            );
        }

        // success, update the current diffs
        this.files.push(fileName);
        this.diffs = newDiffs;
    }

    getPrompt() {
        return this.buildPrompt(this.diffs);
    }

    async getReviewResponse(cancellationToken?: CancellationToken) {
        const prompt = this.getPrompt();
        const model = this.config.model;
        const response = await model.sendRequest(prompt, cancellationToken);

        return {
            response,
            promptTokens: await model.countTokens(prompt),
            responseTokens: await model.countTokens(response),
        };
    }

    /** special handling this is the first diff: reduce the diff size to fit into this request */
    private async setFirstDiff(fileName: string, diff: string) {
        const originalSize = diff.length;

        const maxTokens = this.config.model.maxInputTokens;
        while (true) {
            const prompt = this.buildPrompt([diff]);
            const tokenCount = await this.config.model.countTokens(prompt);
            if (tokenCount <= maxTokens) {
                break;
            }

            const tokensPerChar = tokenCount / prompt.length;
            const adjustedPromptLength = maxTokens / tokensPerChar; // guaranteed to be less than prompt.length
            const numCharsToRemove = prompt.length - adjustedPromptLength;

            // try truncating changeDescription (better than truncating diff)
            if (this.changeDescription && this.changeDescription.length > 0) {
                const newLength = Math.max(
                    0,
                    this.changeDescription.length - numCharsToRemove
                );
                this.changeDescription = this.changeDescription.slice(
                    0,
                    newLength
                );
                continue;
            }

            // try truncating diff
            if (numCharsToRemove >= diff.length) {
                throw new Error(
                    `prompt size ${tokenCount} exceeds limit. Prompt itself too long?`
                );
            } else if (numCharsToRemove <= 0) {
                throw new Error(
                    `adjustedPromptLength ${adjustedPromptLength} is not less than prompt.length ${prompt.length}. This shouldn't happen`
                );
            }
            diff = diff.slice(0, diff.length - numCharsToRemove);
        }
        if (diff.length < originalSize) {
            this.config.logger.info(
                `Diff truncated from ${originalSize} to ${diff.length} characters`
            );
        }

        this.files.push(fileName);
        this.diffs.push(diff);
    }

    private buildPrompt(diffs: string[]): string {
        const diff = diffs.join('\n');
        return createReviewPrompt(
            this.changeDescription,
            diff,
            this.customPrompt,
            this.userPrompt
        );
    }
}

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

    const wrappedChangeDescription = changeDescription
        ? `<Change Description>\n${changeDescription}\n</Change Description>`
        : '';

    return `You are a senior software engineer reviewing a pull request. Analyze the following git diff for the changed files.

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

${wrappedChangeDescription}

<Diff>
${diff}
</Diff>
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
