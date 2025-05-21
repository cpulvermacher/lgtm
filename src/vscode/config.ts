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
    const modelId = getOptions().chatModel;
    try {
        config.model = await selectChatModel(modelId, config.logger);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error updating chat model';
        config.logger.info(`[Error] Failed to update chat model (was trying ${modelId}): ${errorMessage}`);
        
        // Always reset to "gpt-4o" on any error
        await vscode.workspace
            .getConfiguration('lgtm')
            .update(
                'chatModel',
                'gpt-4o', // Explicitly set to "gpt-4o"
                vscode.ConfigurationTarget.Global
            );
        
        // Notify the user
        const option = await vscode.window.showErrorMessage(
            `Failed to load chat model '${modelId}'. Resetting to default 'gpt-4o'. Reason: ${errorMessage}`,
            'Open Settings'
        );

        if (option === 'Open Settings') {
            await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'lgtm.chatModel'
            );
        }
        // Attempt to load the default model immediately after resetting
        try {
            config.model = await selectChatModel('gpt-4o', config.logger);
        } catch (defaultModelError) {
            const defaultModelErrorMessage = defaultModelError instanceof Error ? defaultModelError.message : 'Unknown error';
            config.logger.info(`[Error] Failed to load default chat model (gpt-4o): ${defaultModelErrorMessage}`);
            vscode.window.showErrorMessage(`Critical: Failed to load default chat model 'gpt-4o'. Please check your setup. Reason: ${defaultModelErrorMessage}`);
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
