import simpleGit, { SimpleGit } from 'simple-git';
import * as vscode from 'vscode';

export type Config = {
    workspaceRoot: string;
    gitRoot: string;
    git: SimpleGit;
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
    _config = {
        git,
        workspaceRoot,
        gitRoot: toplevel,
    };
    return _config;
}
