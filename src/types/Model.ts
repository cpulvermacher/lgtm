import type { CancellationToken } from 'vscode';

/** chat model wrapper */
export interface Model {
    countTokens: (text: string) => Promise<number>;
    limitTokens: (text: string) => Promise<string>;
    sendRequest: (
        prompt: string,
        cancellationToken: CancellationToken
    ) => Promise<string>;
}
