import * as vscode from 'vscode';

/** Limit the number of tokens to within the model's capacity */
export async function limitTokens(
    model: vscode.LanguageModelChat,
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
