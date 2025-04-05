import {
    LanguageModelChatMessage,
    LanguageModelError,
    lm,
    type CancellationToken,
    type LanguageModelChat,
    type LanguageModelChatResponse,
} from 'vscode';

import { Logger } from '../types/Logger';
import { Model } from '../types/Model';
import { ModelError } from '../types/ModelError';

/** fraction of the model's input token limit that we want to use.
 *
 * Actually hitting the maximum results in "Message exceeds token limit" errors, so let's stay below that.
 */
const maxInputTokensFraction = 0.95;

/** Select chat model (asks for permissions the first time) */
export async function selectChatModel(
    modelFamily: string,
    logger: Logger
): Promise<Model> {
    if (logger.isDebugEnabled()) {
        const allModels = await lm.selectChatModels();
        logger.debug(
            'Available chat models:',
            allModels
                .map(
                    (m) =>
                        `\n ${m.family}\t(Vendor: ${m.vendor}\tName: ${m.name}\t Max input tokens: ${m.maxInputTokens})`
                )
                .join('')
        );
    }
    const models = await lm.selectChatModels({ family: modelFamily });
    const model = models[0];
    logger.debug('Selected model:', model);

    if (model === undefined) {
        throw new Error(
            `No model found for family "${modelFamily}". Please ensure the lgtm.chatModel setting is set to an available model.`
        );
    }

    return {
        name: model.name,
        vendor: model.vendor,
        maxInputTokens: Math.floor(
            maxInputTokensFraction * model.maxInputTokens
        ),
        countTokens: async (text: string) => model.countTokens(text),
        sendRequest: async (
            prompt: string,
            cancellationToken: CancellationToken
        ) => sendRequest(model, prompt, cancellationToken),
    };
}

async function sendRequest(
    model: LanguageModelChat,
    prompt: string,
    cancellationToken: CancellationToken
): Promise<string> {
    try {
        const response = await model.sendRequest(
            [LanguageModelChatMessage.User(prompt)],
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
        error instanceof LanguageModelError &&
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
    responseStream: LanguageModelChatResponse
): Promise<string> {
    let text = '';
    for await (const fragment of responseStream.text) {
        text += fragment;
    }

    return text;
}
