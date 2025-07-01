import type { CancellationToken } from 'vscode';

import type { Config, Options } from '@/types/Config';
import type { Model } from '@/types/Model';
import { type PromptType } from '../types/PromptType';
import { createReviewPrompt } from './prompt';

export class ModelRequest {
    public files: string[] = [];
    private diffs: string[] = [];
    private model?: Model;
    private options: Options;

    constructor(
        private readonly config: Config,
        private changeDescription: string | undefined
    ) {
        this.options = config.getOptions();
    }

    /** get model on first use, fixed for this request */
    private getModel = async () => {
        if (!this.model) {
            this.model = await this.config.getModel();
        }
        return this.model;
    };

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
        const model = await this.getModel();
        const numTokens = await model.countTokens(prompt);
        if (numTokens > this.getMaxInputTokens(model)) {
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
        const model = await this.getModel();
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

        const model = await this.getModel();
        const maxTokens = this.getMaxInputTokens(model);

        while (true) {
            const prompt = this.buildPrompt([diff]);
            const tokenCount = await model.countTokens(prompt);
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
            promptType
        );
    }
}
