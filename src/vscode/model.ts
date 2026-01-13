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
