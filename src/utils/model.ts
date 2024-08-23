import {
    LanguageModelChatMessage,
    lm,
    type CancellationToken,
    type LanguageModelChat,
    type LanguageModelChatResponse,
} from 'vscode';
import { Model } from '../types/Model';

/** Select chat model (asks for permissions the first time) */
export async function selectChatModel(): Promise<Model> {
    // 3.5 not enough to produce useful comments
    const models = await lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4o',
    });
    console.debug('Found models:', models);

    if (models.length === 0) {
        throw new Error('No models found');
    }

    const model = models[0];
    console.log(
        `Selected model: ${model.name} with #tokens: ${model.maxInputTokens}`
    );

    return {
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
    const response = await model.sendRequest(
        [LanguageModelChatMessage.User(prompt)],
        {},
        cancellationToken
    );

    return await readStream(response);
}

/** Read response stream into a string */
async function readStream(
    responseStream: LanguageModelChatResponse
): Promise<string> {
    let text = '';
    try {
        for await (const fragment of responseStream.text) {
            text += fragment;
        }
    } catch (e) {
        throw new Error(`Stream error: ${e}`);
    }

    return text;
}
