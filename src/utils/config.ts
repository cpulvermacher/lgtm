import simpleGit from 'simple-git';
// allowed only in extension.ts and config.ts, since it cannot be imported in unit tests.
// eslint-disable-next-line no-restricted-imports
import * as vscode from 'vscode';

import { Config, Options } from '../types/Config';
import { selectChatModel } from './model';

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

    const model = await selectChatModel((await getOptions()).chatModel);

    _config = {
        git,
        workspaceRoot,
        gitRoot,
        model,
        getOptions,
    };

    vscode.lm.onDidChangeChatModels(async () => {
        console.log('Chat models were updated, rechecking...');
        const config = await getOptions();
        _config.model = await selectChatModel(config.chatModel);
    });

    return _config;
}

/** Converts file path relative to gitRoot to a vscode.Uri */
export function toUri(config: Config, file: string): vscode.Uri {
    return vscode.Uri.file(config.gitRoot + '/' + file);
}

function getOptions(): Options {
    const config = vscode.workspace.getConfiguration('lgtm');

    const minSeverity = config.get<number>('minSeverity');
    const customPrompt = config.get<string>('customPrompt');
    const exclude = config.get<string[]>('exclude');
    const enableDebugOutput = config.get<boolean>('enableDebugOutput');
    const chatModel = config.get<string>('chatModel');

    return {
        minSeverity: minSeverity ?? 1,
        customPrompt: customPrompt ?? '',
        excludeGlobs: exclude ?? [],
        enableDebugOutput: enableDebugOutput ?? false,
        chatModel: chatModel ?? 'gpt-4o',
    };
}
