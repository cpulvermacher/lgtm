export const copilotCodeReviewProviderId = 'copilot-code-review';
export const copilotCodeReviewProviderName = 'Copilot Code Review';

export function isCopilotCodeReviewProviderId(
    providerId: string | undefined
): boolean {
    if (!providerId) {
        return false;
    }

    return providerId.toLowerCase() === copilotCodeReviewProviderId;
}
