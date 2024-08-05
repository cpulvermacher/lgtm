import simpleGit, { SimpleGit } from 'simple-git';
import * as vscode from 'vscode';

type Config = {
    workspaceRoot: string;
    gitRoot: string;
    git: SimpleGit;
};

let _config: Config;

// called the first time a command is executed
export function activate() {
    vscode.chat.createChatParticipant('ai-reviewer', handler);
}

export function deactivate() {
    /* nothing to do here */
}

type FileReview = {
    target: string; // target file
    comment: string; // review comment
    severity: number; // in 0..5
};

async function handler(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<void> {
    console.debug('Received request:', request, 'with context:', context);

    const config = await getConfig();

    if (request.command === 'review') {
        // 3.5 is not enough for reasonable responses
        // 4 untested
        // 4o seems to yield fair results?
        const models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
        console.debug('Found models:', models);

        if (models.length === 0) {
            stream.markdown('No models found');
            return;
        }

        const model = models[0];
        console.debug(
            'Selected model:',
            model.name,
            ' with #tokens:',
            model.maxInputTokens
        );

        // stream.markdown(
        //     "Awesome! Let's review your code. Which commit would you like me to review?\n"
        // );
        // well, use HEAD for now
        const target = 'HEAD';
        const reference = 'HEAD~1';
        const diffRevisionRange = `${reference}..${target}`;

        stream.markdown(`Reviewing ${diffRevisionRange}.\n`);
        //get list of files in the commit
        const fileString = await config.git.diff([
            '--name-only',
            diffRevisionRange,
        ]);
        const files = fileString.split('\n').filter((f) => f.length > 0);

        stream.markdown(`Found ${files.length} files.\n\n`);

        const reviewComments: FileReview[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (token.isCancellationRequested) {
                return;
            }

            console.debug('Reviewing file:', file);
            stream.progress(
                `Reviewing file ${file} (${i + 1}/${files.length})`
            );

            let diff = await config.git.diff([
                '--no-prefix',
                diffRevisionRange,
                '--',
                file,
            ]);

            if (diff.length === 0) {
                console.debug('No changes in file:', file);
                continue;
            }

            const originalSize = diff.length;
            diff = await limitTokens(model, diff);
            if (diff.length < originalSize) {
                console.debug(
                    `Diff truncated from ${originalSize} to ${diff.length}`
                );
            }

            const prompt = [
                vscode.LanguageModelChatMessage.User(createReviewPrompt()),
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

            let comment = '';
            try {
                for await (const fragment of response.text) {
                    comment += fragment;
                }
            } catch (e) {
                stream.markdown(`Error: ${e}`);
                return;
            }

            const severityMatch = comment.match(/\n(\d)\/5$/);
            if (!severityMatch) {
                console.debug('No severity found in:', comment);
            }
            const severity = severityMatch ? parseInt(severityMatch[1]) : 3;

            reviewComments.push({
                target: file,
                comment,
                severity,
            });
        }

        //sort by descending severity
        reviewComments.sort((a, b) => b.severity - a.severity);

        for (const review of reviewComments) {
            if (review.severity === 0) {
                continue;
            }

            stream.anchor(toUri(config, review.target), review.target);
            stream.markdown('\n' + review.comment);
            stream.markdown('\n\n');
        }
    }
}

/** Return config */
async function getConfig(): Promise<Config> {
    if (_config) {
        return _config;
    }

    //TODO if there are multiple workspaces, ask the user to select one
    const mainWorkspace = vscode.workspace.workspaceFolders?.[0];
    if (!mainWorkspace) {
        vscode.window.showErrorMessage('No workspace found');
        throw new Error('No workspace found');
    }
    const workspaceRoot = mainWorkspace.uri.fsPath;
    const git = simpleGit(workspaceRoot);
    const toplevel = await git.revparse(['--show-toplevel']);
    git.cwd(toplevel);
    console.debug('working directory', workspaceRoot, 'toplevel', toplevel);
    _config = {
        git,
        workspaceRoot,
        gitRoot: toplevel,
    };
    return _config;
}

/** Converts file path relative to gitRoot to a vscode.Uri */
function toUri(config: Config, file: string): vscode.Uri {
    return vscode.Uri.file(config.gitRoot + '/' + file);
}

/** Limit the number of tokens to within the model's capacity */
async function limitTokens(
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

function createReviewPrompt(): string {
    return `You are a senior software engineer reviewing a pull request. Please review the following diff for any problems. Be succinct in your response. You must end your answer with "\\nN/5", replacing N with an integer in 0..5 denoting the severity (0: nothing to do, 5: blocker).`;
}
