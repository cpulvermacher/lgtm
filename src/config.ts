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

    let mainWorkspace = vscode.workspace.workspaceFolders?.[0];
    if ((vscode.workspace.workspaceFolders?.length || 0) > 1) {
        //if there are multiple workspaces, ask the user to select one
        mainWorkspace = await vscode.window.showWorkspaceFolderPick();
    }

    if (!mainWorkspace) {
        vscode.window.showErrorMessage('No workspace found');
        throw new Error('No workspace found');
    }

    const workspaceRoot = mainWorkspace.uri.fsPath;
    const git = simpleGit(workspaceRoot);
    const gitRoot = await git.revparse(['--show-toplevel']);

    git.cwd(gitRoot); // make gitRoot the base for all git commands
    console.debug('working directory:', workspaceRoot, ' git repo:', gitRoot);

    const model = await selectChatModel();

    _config = {
        git,
        workspaceRoot,
        gitRoot,
        model,
    };
    return _config;
}

/** Converts file path relative to gitRoot to a vscode.Uri */
export function toUri(config: Config, file: string): vscode.Uri {
    return vscode.Uri.file(config.gitRoot + '/' + file);
}

/** Select chat model (asks for permissions the first time) */
async function selectChatModel(): Promise<vscode.LanguageModelChat> {
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
    console.log(
        `Selected model: ${model.name} with #tokens: ${model.maxInputTokens}`
    );
    return model;
}
