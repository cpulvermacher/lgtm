import simpleGit, { SimpleGit } from 'simple-git';
import * as vscode from 'vscode';

import { Model, selectChatModel } from './model';

export type Config = {
    workspaceRoot: string;
    gitRoot: string;
    git: SimpleGit;
    model: Model;
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