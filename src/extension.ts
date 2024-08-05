import simpleGit, { SimpleGit } from 'simple-git';
import * as vscode from 'vscode';

let git: SimpleGit;

const reviewPrompt =
    'Please review the following diff for any problems. Only provide code examples if you see a problem. End your answer with the severity of issues, as an integer between 1 and 5.';

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
    console.debug('Received request:', request, 'with context:', context);

    if (!git) {
        git = await initializeGit();
    }

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

        // stream.markdown(
        //     "Awesome! Let's review your code. Which commit would you like me to review?\n"
        // );

        // well, use HEAD for now
        const target = 'HEAD';
        const reference = 'HEAD~1';
        const diffRevisionRange = `${reference}..${target}`;

        stream.markdown(`Reviewing ${diffRevisionRange}.\n`);
        //get list of files in the commit
        const fileString = await git.diff(['--name-only', diffRevisionRange]);
        const files = fileString.split('\n');

        stream.markdown(`Found ${files.length} files.\n\n`);

        for (const file of files) {
            if (token.isCancellationRequested) {
                return;
            }
            console.debug('Reviewing file:', file);

            if (file.length === 0) {
                continue;
            }

            let diff = await git.diff([
                '--no-prefix',
                diffRevisionRange,
                '--',
                file,
            ]);

            if (diff.length === 0) {
                console.debug('No changes in file:', file);
                continue;
            }

            diff = await limitTokens(model, diff);

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
            console.debug('prompt/response:', prompt, response);

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

const initializeGit = async () => {
    const mainWorkspace = vscode.workspace.workspaceFolders?.[0];
    if (!mainWorkspace) {
        vscode.window.showErrorMessage('No workspace found');
        throw new Error('No workspace found');
    }
    const git = simpleGit(mainWorkspace.uri.fsPath);
    const toplevel = await git.revparse(['--show-toplevel']);
    git.cwd(toplevel);
    console.debug(
        'working directory',
        mainWorkspace.uri.fsPath,
        'toplevel',
        toplevel
    );
    return git;
};
async function limitTokens(model: vscode.LanguageModelChat, text: string) {
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
