// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { CancellationToken, LanguageModelChat } from 'vscode';

/** wrapper for @type LanguageModelChat*/
export interface Model {
    name: string;
    vendor: string;
    maxInputTokens: number;
    countTokens: (text: string) => Promise<number>;
    limitTokens: (text: string) => Promise<string>;
    sendRequest: (
        prompt: string,
        cancellationToken: CancellationToken
    ) => Promise<string>;
}
