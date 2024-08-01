import * as vscode from 'vscode';

// called the first time a command is executed
export function activate() {
    vscode.chat.createChatParticipant('ai-reviewer', handler);
}

export function deactivate() {
    /* nothing to do here */
}

const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<void> => {
    console.log('Received request:', request, 'with context:', context);

    if (request.command === 'review') {
        stream.markdown(
            "Awesome! Let's review your code. Which commit would you like me to review?"
        );

        const prompt = [
            vscode.LanguageModelChatMessage.User(
                'How to print meow using Spring Boot?' + request.prompt
            ),
        ];
        //TODO can select gpt-4o, but get strange exception when reading response
        // const models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
        const models = await vscode.lm.selectChatModels({});
        console.log('Selected models:', models);

        if (models.length === 0) {
            stream.markdown('No models found');
            return;
        }

        const model = models[0];
        let response: vscode.LanguageModelChatResponse;
        try {
            response = await model.sendRequest(prompt, {}, token);
        } catch (e) {
            if (e instanceof vscode.LanguageModelError) {
                stream.markdown(`Error: ${e.message}`);
            } else {
                console.error('Error:', e);
            }
            return;
        }

        try {
            for await (const fragment of response.text) {
                stream.markdown(fragment);
            }
        } catch (e) {
            stream.markdown(`Error: ${e}`);
        }
    }
};
