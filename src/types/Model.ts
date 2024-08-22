import type { CancellationToken } from 'vscode';

export interface Model {
    limitTokens: (text: string) => Promise<string>;
    sendRequest: (
        prompt: string,
        cancellationToken: CancellationToken
    ) => Promise<string>;
}
