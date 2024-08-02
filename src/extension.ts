import simpleGit, { SimpleGit } from 'simple-git';
import * as vscode from 'vscode';

let git: SimpleGit;

const reviewPrompt =
    'Please review the following diff for any problems. Only provide code examples if you see a problem. End your answer with the severity of issues, as an integer between 1 and 5.';

// called the first time a command is executed
export function activate() {
    const mainWorkspace = vscode.workspace.workspaceFolders?.[0];
    if (!mainWorkspace) {
        vscode.window.showErrorMessage('No workspace found');
        return;
    }
    git = simpleGit(mainWorkspace.uri.fsPath);

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
    console.debug('Received request:', request, 'with context:', context);

    if (request.command === 'review') {
        //TODO can select gpt-4o, but get strange exception when reading response
        // const models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
        const models = await vscode.lm.selectChatModels({});
        console.debug('Found models:', models);

        if (models.length === 0) {
            stream.markdown('No models found');
            return;
        }

        const model = models[0];
        console.debug('Selected model:', model.name);

        stream.markdown(
            "Awesome! Let's review your code. Which commit would you like me to review?\n"
        );

        // well, use HEAD for now
        const commit = await git.revparse(['HEAD']);
        //get list of files in the commit
        const files = await git.diff(['--name-only', commit]);

        stream.markdown(`Found ${files.length} files in commit ${commit}.\n`);

        for (const file of files) {
            if (token.isCancellationRequested) {
                return;
            }

            const diff = await git.diff(['--no-prefix', commit, '--', file]);

            const prompt = [
                vscode.LanguageModelChatMessage.User(reviewPrompt),
                vscode.LanguageModelChatMessage.User(
                    '```diff\n' + diff + '\n```'
                ),
            ];
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
                stream.markdown('\n---\n');
            } catch (e) {
                stream.markdown(`Error: ${e}`);
                return;
            }
        }
    }
};
