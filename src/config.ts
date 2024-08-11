import simpleGit, { SimpleGit } from 'simple-git';
import * as vscode from 'vscode';

export type Config = {
    workspaceRoot: string;
    gitRoot: string;
    git: SimpleGit;
    model: vscode.LanguageModelChat;
};

let _config: Config;

/** Return config */
export async function getConfig(): Promise<Config> {
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

    const model = await getModel();

    _config = {
        git,
        workspaceRoot,
        gitRoot: toplevel,
        model,
    };
    return _config;
}

/** Converts file path relative to gitRoot to a vscode.Uri */
export function toUri(config: Config, file: string): vscode.Uri {
    return vscode.Uri.file(config.gitRoot + '/' + file);
}

async function getModel(): Promise<vscode.LanguageModelChat> {
    // 3.5 not enough to produce useful comments
    const models = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4o',
    });
    console.debug('Found models:', models);

    if (models.length === 0) {
        throw new Error('No models found');
    }

    const model = models[0];
    console.debug(
        'Selected model:',
        model.name,
        ' with #tokens:',
        model.maxInputTokens
    );
    return model;
}
