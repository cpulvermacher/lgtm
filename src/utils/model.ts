import {
    LanguageModelChatMessage,
    LanguageModelError,
    lm,
    type CancellationToken,
    type LanguageModelChat,
    type LanguageModelChatResponse,
} from 'vscode';
import { Model } from '../types/Model';
import { ModelError } from '../types/ModelError';

/** Select chat model (asks for permissions the first time) */
export async function selectChatModel(modelFamily: string): Promise<Model> {
    // 3.5 not enough to produce useful comments
    const models = await lm.selectChatModels({
        vendor: 'copilot',
        family: modelFamily,
    });
    console.debug('Found models:', models);

    if (models.length === 0) {
        throw new Error(
            `No model found for family "${modelFamily}". Please ensure the lgtm.chatModel setting is set to an available model.`
        );
    }

    const model = models[0];
    return {
        name: model.name,
        vendor: model.vendor,
        maxInputTokens: model.maxInputTokens,
        countTokens: async (text: string) => model.countTokens(text),
        limitTokens: async (text: string) => limitTokens(model, text),
        sendRequest: async (
            prompt: string,
            cancellationToken: CancellationToken
        ) => sendRequest(model, prompt, cancellationToken),
    };
}

/** Limit the number of tokens to within the model's capacity */
async function limitTokens(
    model: LanguageModelChat,
    text: string
): Promise<string> {
    const maxDiffTokens = model.maxInputTokens * 0.8;

    while (true) {
        const tokenCount = await model.countTokens(text);
        if (tokenCount <= maxDiffTokens) {
            break;
        }

        const tokensPerChar = tokenCount / text.length;
        const adjustedLength = maxDiffTokens / tokensPerChar;
        // adjustedLength is guaranteed to be less than text.length
        text = text.slice(0, adjustedLength);
    }
    return text;
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
