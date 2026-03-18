import type { CancellationToken } from 'vscode';

import type { Options } from '@/types/Config';
import type { Logger } from '@/types/Logger';
import type { Model } from '@/types/Model';
import type { PromptType } from '@/types/PromptType';
import type { ReviewContextFile } from '@/types/ReviewContextFile';
import { createReviewPrompt } from './prompt';

export class ModelRequest {
    public files: string[] = [];
    private diffs: string[] = [];

    constructor(
        private readonly model: Model,
        private readonly options: Options,
        private readonly logger: Logger,
        private changeDescription: string | undefined,
        private contextFiles: ReviewContextFile[] = []
    ) {}

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
        const numTokens = await this.model.countTokens(prompt);
        if (numTokens > this.getMaxInputTokens(this.model)) {
            throw new Error(
                `Cannot add diff to request, prompt size ${numTokens} exceeds limit`
            );
        }

        // success, update the current diffs
        this.files.push(fileName);
        this.diffs = newDiffs;
    }

    getPrompt(promptType?: PromptType) {
        return this.buildPrompt(this.diffs, promptType);
    }

    async sendRequest(
        cancellationToken?: CancellationToken,
        promptType?: PromptType
    ) {
        const prompt = this.getPrompt(promptType);
        const response = await this.model.sendRequest(
            prompt,
            cancellationToken
        );

        return {
            response,
            promptTokens: await this.model.countTokens(prompt),
            responseTokens: await this.model.countTokens(response),
        };
    }

    /** special handling this is the first diff: reduce the diff size to fit into this request */
    private async setFirstDiff(fileName: string, diff: string) {
        const originalSize = diff.length;

        const maxTokens = this.getMaxInputTokens(this.model);

        while (true) {
            const prompt = this.buildPrompt([diff]);
            const tokenCount = await this.model.countTokens(prompt);
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

            if (this.truncateContextFiles(numCharsToRemove)) {
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
            this.logger.info(
                `Diff truncated from ${originalSize} to ${diff.length} characters`
            );
        }

        this.files.push(fileName);
        this.diffs.push(diff);
    }

    private getMaxInputTokens(model: Model) {
        return Math.floor(
            model.maxInputTokens * this.options.maxInputTokensFraction
        );
    }

    private buildPrompt(diffs: string[], promptType?: PromptType): string {
        const diff = diffs.join('\n');
        return createReviewPrompt(
            this.changeDescription,
            diff,
            this.options.customPrompt,
            promptType,
            this.contextFiles
        );
    }

    private truncateContextFiles(numCharsToRemove: number): boolean {
        if (numCharsToRemove <= 0 || this.contextFiles.length === 0) {
            return false;
        }

        const originalContextFiles = this.contextFiles.map((contextFile) => ({
            ...contextFile,
        }));
        let remainingCharsToRemove = numCharsToRemove;
        for (
            let index = this.contextFiles.length - 1;
            index >= 0 && remainingCharsToRemove > 0;
            index--
        ) {
            const contextFile = this.contextFiles[index];
            if (remainingCharsToRemove >= contextFile.content.length) {
                remainingCharsToRemove -= contextFile.content.length;
                this.contextFiles.splice(index, 1);
                continue;
            }

            const truncatedContent = contextFile.content
                .slice(0, contextFile.content.length - remainingCharsToRemove)
                .trimEnd();
            if (truncatedContent.length === 0) {
                this.contextFiles.splice(index, 1);
            } else {
                this.contextFiles[index] = {
                    ...contextFile,
                    content: truncatedContent,
                };
            }
            remainingCharsToRemove = 0;
        }

        this.logContextFileTruncation(originalContextFiles);

        return remainingCharsToRemove < numCharsToRemove;
    }

    private logContextFileTruncation(
        originalContextFiles: ReviewContextFile[]
    ) {
        for (const originalContextFile of originalContextFiles) {
            const updatedContextFile = this.contextFiles.find(
                (contextFile) => contextFile.path === originalContextFile.path
            );

            if (!updatedContextFile) {
                this.logger.info(
                    `Context file removed to fit token limit: ${originalContextFile.path}`
                );
                continue;
            }

            if (
                updatedContextFile.content.length <
                originalContextFile.content.length
            ) {
                this.logger.info(
                    `Context file truncated from ${originalContextFile.content.length} to ${updatedContextFile.content.length} characters: ${originalContextFile.path}`
                );
            }
        }
    }
}
