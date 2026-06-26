export const defaultModelId = 'copilot:gpt-4.1';

/**
 * Offered as a fallback when `defaultModelId` is unavailable.
 * (free plans only have `gpt-4o-mini` working these days, with tiny context window)
 */
export const defaultFallbackModelId = 'copilot:gpt-4o-mini';
export const defaultFallbackModelName = 'GPT-4o mini';

export const defaultPreferredModelIds = [
    'copilot:claude-sonnet-4.5',
    'copilot:claude-sonnet-4.6',
    'claude-model-provider:claude-sonnet-4-5',
    'claude-model-provider:claude-sonnet-4-6',
];
