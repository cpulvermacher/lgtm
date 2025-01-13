import * as vscode from 'vscode';

import { Config, Options } from '../types/Config';
import { createGit } from '../utils/git';
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
    const git = await createGit(workspaceRoot);
    const model = await selectChatModel(getOptions().chatModel);

    _config = {
        git,
        workspaceRoot,
        gitRoot: git.getGitRoot(),
        model,
        getOptions,
    };

    vscode.lm.onDidChangeChatModels(async () => {
        console.log('Chat models were updated, rechecking...');
        _config.model = await selectChatModel(getOptions().chatModel);
    });
    vscode.workspace.onDidChangeConfiguration(async (ev) => {
        if (!ev.affectsConfiguration('lgtm')) {
            return;
        }
        console.log('Config updated, updating model...');
        _config.model = await selectChatModel(getOptions().chatModel);
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
