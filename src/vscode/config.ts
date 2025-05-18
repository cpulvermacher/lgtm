import * as vscode from 'vscode';

import { Config, Options } from '../types/Config';
import { createGit } from '../utils/git';
import { LgtmLogger } from './logger';
import { selectChatModel } from './model';

// defined when built via `npm run dev`
declare const __GIT_VERSION__: string | undefined;

/** Return config */
export async function getConfig(): Promise<Config> {
    const logger = new LgtmLogger(getOptions().enableDebugOutput);
    if (__GIT_VERSION__) {
        logger.info(`**LGTM dev build**: ${__GIT_VERSION__}`);
    }

    let mainWorkspace = vscode.workspace.workspaceFolders?.[0];
    if ((vscode.workspace.workspaceFolders?.length || 0) > 1) {
        //if there are multiple workspaces, ask the user to select one
        mainWorkspace = await vscode.window.showWorkspaceFolderPick();
    }

    if (!mainWorkspace) {
        throw new Error(
            'No workspace found. Please open a folder containing a Git repository using `File -> Open Folder`.'
        );
    }

    const workspaceRoot = mainWorkspace.uri.fsPath;
    let git;
    try {
        git = await createGit(workspaceRoot);
    } catch (error) {
        const message =
            error instanceof Error ? '\n\n```\n' + error.message + '\n```' : '';
        throw new Error(
            'Error opening Git repository. Please open a folder containing a Git repository using `File -> Open Folder` and make sure Git is installed.' +
                message
        );
    }
    const model = await selectChatModel(getOptions().chatModel, logger);

    const config = {
        git,
        workspaceRoot,
        gitRoot: git.getGitRoot(),
        model,
        getOptions,
        logger,
    };

    vscode.lm.onDidChangeChatModels(async () => {
        config.logger.debug('Chat models were updated, rechecking...');
        await updateChatModel(config);
    });
    vscode.workspace.onDidChangeConfiguration(async (ev) => {
        if (!ev.affectsConfiguration('lgtm')) {
            return;
        }
        config.logger.debug('Updating config...');
        config.logger.setEnableDebug(getOptions().enableDebugOutput);
        await updateChatModel(config);
    });

    return config;
}

/** get desired chat model and update `config`.
 *
 * If the model is not available, shows an error toast with possible options.
 */
async function updateChatModel(config: Config): Promise<void> {
    const modelId = getOptions().chatModel; // Renamed modelFamily to modelId for clarity
    try {
        config.model = await selectChatModel(modelId, config.logger);
    } catch (error) {
        const msg =
            error instanceof Error
                ? error.message
                : 'Error updating chat model';
        const option = await vscode.window.showErrorMessage(
            msg,
            'Reset to Default',
            'Open Settings'
        );
        if (option === 'Reset to Default') {
            await vscode.workspace
                .getConfiguration('lgtm')
                .update(
                    'chatModel',
                    undefined,
                    vscode.ConfigurationTarget.Global
                );
            //note: resetting to default will trigger the `onDidChangeConfiguration` event again
        } else if (option === 'Open Settings') {
            await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'lgtm.chatModel'
            );
        }
    }
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
    const mergeFileReviewRequests = config.get<boolean>(
        'mergeFileReviewRequests'
    );

    return {
        minSeverity: minSeverity ?? 1,
        customPrompt: customPrompt ?? '',
        excludeGlobs: exclude ?? [],
        enableDebugOutput: enableDebugOutput ?? false,
        chatModel: chatModel ?? 'gpt-4o',
        mergeFileReviewRequests: mergeFileReviewRequests ?? true,
    };
}
