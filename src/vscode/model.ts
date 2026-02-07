import * as vscode from 'vscode';

import { Logger } from '@/types/Logger';
import { Model } from '@/types/Model';
import { ModelError } from '@/types/ModelError';

/** Get given chat model (asks for permissions the first time) */
export async function getChatModel(
    modelId: string,
    logger: Logger
): Promise<Model> {
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

    const [vendor, id] = modelIdWithVendor.split(':', 2);
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

export function isRecommendedModel(model: vscode.LanguageModelChat): boolean {
    if (
        (model.vendor === 'copilot' && model.id === 'gpt-4.1') ||
        (model.vendor === 'copilot' &&
            model.id.startsWith('claude-sonnet-4.5')) ||
        (model.vendor === 'claude-model-provider' &&
            model.id.startsWith('claude-sonnet-4-5'))
    ) {
        return true;
    }

    return false;
}

export type ModelQuickPickItem = vscode.QuickPickItem & {
    modelIdWithVendor?: string; // in format "vendor:id"
    name?: string;
    isCurrentModel?: boolean;
    isDefaultModel?: boolean;
    vendor?: string;
};

/**
 * Build a categorized list of model quick pick items (Recommended / Other / Unsupported)
 * with separator headers.  Labels contain only the plain model name — callers
 * are responsible for adding any prefix / suffix decoration they need.
 */
export function getModelQuickPickItems(
    models: vscode.LanguageModelChat[],
    currentModel: string, // could be in format "vendor:id" or legacy "id" only
    defaultModel: string
): ModelQuickPickItem[] {
    const recommendedModels: ModelQuickPickItem[] = [];
    let otherModels: ModelQuickPickItem[] = [];
    const unsupportedModels: ModelQuickPickItem[] = [];

    for (const model of models) {
        const modelIdWithVendor = `${model.vendor}:${model.id}`;
        const isCurrentModel =
            modelIdWithVendor === currentModel || model.id === currentModel;
        const isDefaultModel = modelIdWithVendor === defaultModel;
        const modelName = model.name ?? model.id;

        const item: ModelQuickPickItem = {
            label: modelName,
            description: `${model.vendor}:${model.id}`,
            name: modelName,
            modelIdWithVendor,
            isCurrentModel,
            isDefaultModel,
            vendor: model.vendor,
        };

        if (isDefaultModel) {
            // place default model at the top
            recommendedModels.unshift(item);
        } else if (isUnSupportedModel(model)) {
            unsupportedModels.push(item);
        } else if (isRecommendedModel(model)) {
            recommendedModels.push(item);
        } else {
            otherModels.push(item);
        }
    }

    if (recommendedModels.length > 0) {
        recommendedModels.unshift({
            label: 'Recommended Models',
            kind: vscode.QuickPickItemKind.Separator,
        });
    }
    if (otherModels.length > 0) {
        const vendorMap: Record<string, ModelQuickPickItem[]> = {};
        for (const item of otherModels) {
            if (!vendorMap[item.vendor || '']) {
                vendorMap[item.vendor || ''] = [];
            }
            vendorMap[item.vendor || ''].push(item);
        }

        otherModels = [
            ...Object.entries(vendorMap).flatMap(([vendor, items]) => {
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

    return [...recommendedModels, ...otherModels, ...unsupportedModels];
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
    }

    // no data about other vendors/models yet, assume they work
    return false;
}
