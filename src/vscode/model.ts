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
    // Use the modelId directly to select the specific model
    const models = await vscode.lm.selectChatModels({ id: modelId });

    if (!models || models.length === 0 || models[0] === undefined) {
        throw new Error(`No model found with ID "${modelId}".`);
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
