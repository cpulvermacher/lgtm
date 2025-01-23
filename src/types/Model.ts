// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { CancellationToken, LanguageModelChat } from 'vscode';

/** wrapper for @type LanguageModelChat*/
export interface Model {
    name: string;
    vendor: string;
    maxInputTokens: number;
    /** counting tokens works locally and does not need network requests. */
    countTokens: (text: string) => Promise<number>;
    sendRequest: (
        prompt: string,
        cancellationToken: CancellationToken
    ) => Promise<string>;
}
