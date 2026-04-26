import * as vscode from 'vscode';

import { Model } from '@/types/Model';
import { ModelError } from '@/types/ModelError';
import {
    copilotCodeReviewProviderId,
    copilotCodeReviewProviderName,
} from '@/types/ReviewProvider';
import { getConfig } from '@/vscode/config';
import { isCopilotCodeReviewAvailable } from '@/vscode/copilotCodeReviewAvailability';
import {
    defaultModelId,
    defaultPreferredModelIds,
} from '@/vscode/defaultModels';

/** Get given chat model (asks for permissions the first time) */
export async function getChatModel(modelId: string): Promise<Model> {
    const { logger } = await getConfig();

    if (logger.isDebugEnabled()) {
        const allModels = await vscode.lm.selectChatModels();
        logger.debug(
            'Available chat models:',
            allModels
                .map(
                    (m) =>
                        `\nID: ${m.id} Family: ${m.family}\t(Vendor: ${m.vendor}\tName: ${m.name}\t Max input tokens: ${m.maxInputTokens})`
                )
                .join('')
        );
    }

    const selector = parseToSelector(modelId);
    const models = await vscode.lm.selectChatModels(selector);

    if (!models || models.length === 0 || models[0] === undefined) {
        const selectorDesc = selector.vendor
            ? `vendor "${selector.vendor}" and ID "${selector.id}"`
            : `ID "${modelId}"`;
        throw new Error(`No model found with ${selectorDesc}.`);
    }
    const model = models[0];
    logger.debug('Selected model:', model);

    return {
        name: model.name,
        vendor: model.vendor,
        maxInputTokens: model.maxInputTokens,
        countTokens: async (text: string) => model.countTokens(text),
        sendRequest: async (
            prompt: string,
            cancellationToken?: vscode.CancellationToken
        ) => sendRequest(model, prompt, cancellationToken),
    };
}

// can be either "vendor:id" or legacy "id"
function parseToSelector(modelIdWithVendor: string) {
    if (!modelIdWithVendor.includes(':')) {
        return { vendor: undefined, id: modelIdWithVendor };
    }

    const colonIdx = modelIdWithVendor.indexOf(':');
    const vendor = modelIdWithVendor.slice(0, colonIdx);
    const id = modelIdWithVendor.slice(colonIdx + 1);
    return { vendor, id };
}

async function sendRequest(
    model: vscode.LanguageModelChat,
    prompt: string,
    cancellationToken?: vscode.CancellationToken
): Promise<string> {
    try {
        const response = await model.sendRequest(
            [vscode.LanguageModelChatMessage.User(prompt)],
            {},
            cancellationToken
        );
        return await readStream(response);
    } catch (error) {
        throw mapError(error);
    }
}

/** Maps vscode.LanguageModelError to ModelError */
function mapError(error: unknown) {
    if (
        error instanceof vscode.LanguageModelError &&
        (error.code === 'NoPermissions' ||
            error.code === 'Blocked' ||
            error.code === 'NotFound')
    ) {
        return new ModelError(error.code, error.message);
    }
    return error;
}

/** Read response stream into a string */
async function readStream(
    responseStream: vscode.LanguageModelChatResponse
): Promise<string> {
    let text = '';
    for await (const fragment of responseStream.text) {
        text += fragment;
    }

    return text;
}

function getModelPickerPreferences(): {
    preferredProviderIds: string[];
    useRecommendedModelsLabel: boolean;
} {
    const config = vscode.workspace.getConfiguration('lgtm');
    const chatModel = config.get<string>('chatModel', defaultModelId);
    const preferredModels = config.get<string[]>(
        'preferredModels',
        defaultPreferredModelIds
    );

    return {
        preferredProviderIds: [...new Set([chatModel, ...preferredModels])],
        useRecommendedModelsLabel:
            chatModel === defaultModelId &&
            preferredModels.length === defaultPreferredModelIds.length &&
            preferredModels.every(
                (modelId, index) => modelId === defaultPreferredModelIds[index]
            ),
    };
}

export type ModelQuickPickItem = vscode.QuickPickItem & {
    id?: string;
    providerId?: string;
    modelIdWithVendor?: string; // in format "vendor:id"
    name?: string;
    vendor?: string;
};

/**
 * Build a categorized list of model quick pick items (Preferred / Review Providers / Other / Unsupported)
 * with separator headers.  Labels contain only the plain model name — callers
 * are responsible for adding any prefix / suffix decoration they need.
 */
export function getModelQuickPickItems(
    models: vscode.LanguageModelChat[]
): ModelQuickPickItem[] {
    const { preferredProviderIds, useRecommendedModelsLabel } =
        getModelPickerPreferences();
    const preferredProviderIdSet = new Set(preferredProviderIds);
    const preferredModelsById = new Map<string, ModelQuickPickItem>();
    const reviewProviders: ModelQuickPickItem[] = [];
    let otherModels: ModelQuickPickItem[] = [];
    const otherModelsByVendor: Record<string, ModelQuickPickItem[]> = {};
    const unsupportedModels: ModelQuickPickItem[] = [];

    if (isCopilotCodeReviewAvailable()) {
        const codeReviewItem: ModelQuickPickItem = {
            id: copilotCodeReviewProviderId,
            providerId: copilotCodeReviewProviderId,
            label: copilotCodeReviewProviderName,
            description: copilotCodeReviewProviderId,
            name: copilotCodeReviewProviderName,
            vendor: 'copilot',
        };

        if (preferredProviderIdSet.has(copilotCodeReviewProviderId)) {
            preferredModelsById.set(
                copilotCodeReviewProviderId,
                codeReviewItem
            );
        } else {
            reviewProviders.push(codeReviewItem);
        }
    }

    for (const model of models) {
        const modelIdWithVendor = `${model.vendor}:${model.id}`;
        const modelName = model.name ?? model.id;

        const item: ModelQuickPickItem = {
            id: model.id,
            providerId: modelIdWithVendor,
            label: modelName,
            description: `${model.vendor}:${model.id}`,
            name: modelName,
            modelIdWithVendor,
            vendor: model.vendor,
        };

        if (preferredProviderIdSet.has(modelIdWithVendor)) {
            if (!isUnSupportedModel(model)) {
                preferredModelsById.set(modelIdWithVendor, item);
            }
        } else if (isUnSupportedModel(model)) {
            unsupportedModels.push(item);
        } else {
            const vendor = item.vendor || '';
            if (!otherModelsByVendor[vendor]) {
                otherModelsByVendor[vendor] = [];
            }
            otherModelsByVendor[vendor].push(item);
        }
    }

    const preferredModels = preferredProviderIds.flatMap((providerId) => {
        const item = preferredModelsById.get(providerId);
        return item ? [item] : [];
    });

    if (preferredModels.length > 0) {
        preferredModels.unshift({
            label: useRecommendedModelsLabel
                ? 'Recommended Models'
                : 'Preferred Models',
            kind: vscode.QuickPickItemKind.Separator,
        });
    }
    if (reviewProviders.length > 0) {
        reviewProviders.unshift({
            label: 'Review Providers',
            kind: vscode.QuickPickItemKind.Separator,
        });
    }
    if (Object.keys(otherModelsByVendor).length > 0) {
        otherModels = [
            ...Object.entries(otherModelsByVendor)
                .sort(([vendorA], [vendorB]) => vendorA.localeCompare(vendorB))
                .flatMap(([vendor, items]) => {
                    items.sort((a, b) => a.label.localeCompare(b.label));

                    const name = vendor
                        ? vendor.charAt(0).toUpperCase() + vendor.slice(1)
                        : 'Other';

                    return [
                        {
                            label: `${name} Models`,
                            kind: vscode.QuickPickItemKind.Separator,
                        },
                        ...items,
                    ];
                }),
        ];
    }
    if (unsupportedModels.length > 0) {
        unsupportedModels.unshift({
            label: 'Unsupported Models',
            kind: vscode.QuickPickItemKind.Separator,
        });
    }

    return [
        ...preferredModels,
        ...reviewProviders,
        ...otherModels,
        ...unsupportedModels,
    ];
}

export function isUnSupportedModel(model: vscode.LanguageModelChat): boolean {
    if (model.vendor === 'copilot') {
        const unsupportedCopilotModelIds = [
            //these return code: model_not_supported
            'claude-3.7-sonnet',
            'claude-3.7-sonnet-thought',
            // Endpoint not found for model auto
            'auto',
        ];

        return unsupportedCopilotModelIds.includes(model.id);
    } else if (model.vendor === 'anthropic') {
        // all fail with {"type":"invalid_request_error","message":"system: text content blocks must be non-empty"}
        return true;
    } else if (model.vendor === 'claude-code') {
        // all succeed with an empty response
        return true;
    }

    // no data about other vendors/models yet, assume they work
    return false;
}
