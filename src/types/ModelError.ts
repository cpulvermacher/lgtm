// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { LanguageModelError } from 'vscode';

/** A non-retryable @type LanguageModelError */
export class ModelError extends Error {
    type: 'NotFound' | 'Blocked' | 'NoPermissions';

    constructor(type: ModelError['type'], message: string) {
        super(`[${type}] ${message}`);
        this.type = type;
    }
}
