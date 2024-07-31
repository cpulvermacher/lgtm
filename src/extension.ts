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
    stream: vscode.ChatResponseStream
    // token: vscode.CancellationToken
): Promise<void> => {
    console.log('Received request:', request, 'with context:', context);

    if (request.command === 'review') {
        stream.markdown(
            "Awesome! Let's review your code. Which commit would you like me to review?"
        );
    }
};
