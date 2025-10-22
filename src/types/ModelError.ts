// biome-ignore lint/correctness/noUnusedImports: <jsdoc>
import type { LanguageModelError } from 'vscode';

/** A non-retryable @type LanguageModelError */
export class ModelError extends Error {
    readonly type: 'NotFound' | 'Blocked' | 'NoPermissions';

    constructor(type: ModelError['type'], message: string) {
        super(`[${type}] ${message}`);
        this.type = type;
    }
}
