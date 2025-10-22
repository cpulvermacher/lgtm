import * as vscode from 'vscode';

import { Config, Options } from '@/types/Config';
import type { Logger } from '@/types/Logger';
import type { Model } from '@/types/Model';
import { createGit, type Git } from '@/utils/git';
import { LgtmLogger } from './logger';
import { getChatModel } from './model';

// defined when built via `npm run dev`
declare const __GIT_VERSION__: string | undefined;

const defaultModelId = 'gpt-4.1';

let config: Config | undefined;

/** Return config */
export async function getConfig(): Promise<Config> {
    if (!config) {
        config = await initializeConfig();
    }
    return config;
}

async function initializeConfig(): Promise<Config> {
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
    let git: Git;
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
    const config = {
        git,
        workspaceRoot,
        gitRoot: git.getGitRoot(),
        getModel: () => loadModel(getOptions().chatModel, logger),
        getOptions,
        logger,
    };

    vscode.workspace.onDidChangeConfiguration((ev) => {
        if (!ev.affectsConfiguration('lgtm')) {
            return;
        }
        config.logger.debug('Updating config...');
        config.logger.setEnableDebug(getOptions().enableDebugOutput);
    });

    return config;
}

/** get desired chat model.
 *
 * If the model is not available, shows an error toast with possible options.
 * Note that this is rather slow (~1 sec), avoid repeated calls.
 */
async function loadModel(modelId: string, logger: Logger): Promise<Model> {
    logger.debug(`Loading chat model: ${modelId}`);
    try {
        return await getChatModel(modelId, logger);
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : 'Error loading chat model';
        logger.info(
            `[Error] Failed to load chat model (was trying ${modelId}): ${errorMessage}`
        );

        const resetToDefaultOption = `Reset to Default (${defaultModelId})`;
        const selectChatModelOption = 'Select Chat Model';
        const options = [selectChatModelOption];
        if (modelId !== defaultModelId) {
            options.unshift(resetToDefaultOption);
        }

        // Notify the user
        const option = await vscode.window.showErrorMessage(
            `Failed to load chat model '${modelId}'. Reason: ${errorMessage}\nDo you want to reset to the default model or select a different one?`,
            ...options
        );

        if (option === resetToDefaultOption) {
            await vscode.workspace
                .getConfiguration('lgtm')
                .update(
                    'chatModel',
                    defaultModelId,
                    vscode.ConfigurationTarget.Global
                );
            logger.info(`Chat model reset to default: ${defaultModelId}`);
            return await loadModel(defaultModelId, logger);
        } else if (option === selectChatModelOption) {
            await vscode.commands.executeCommand('lgtm.selectChatModel');
            return await loadModel(getOptions().chatModel, logger);
        }

        throw new Error(
            `Couldn't find chat model. Please ensure the lgtm.chatModel setting is set to an available model ID. You can use the 'LGTM: Select Chat Model' command to pick one.`
        );
    }
}

/** Converts file path relative to gitRoot to a vscode.Uri */
export function toUri(config: Config, file: string): vscode.Uri {
    return vscode.Uri.file(config.gitRoot + '/' + file);
}

function getOptions(): Options {
    const config = vscode.workspace.getConfiguration('lgtm');

    const minSeverity = config.get<number>('minSeverity', 1);
    const customPrompt = config.get<string>('customPrompt', '');
    const excludeGlobs = config.get<string[]>('exclude', []);
    const enableDebugOutput = config.get<boolean>('enableDebugOutput', false);
    const chatModel = config.get<string>('chatModel', defaultModelId);
    const mergeFileReviewRequests = config.get<boolean>(
        'mergeFileReviewRequests',
        true
    );
    let maxInputTokensFraction = config.get<number>(
        'maxInputTokensFraction',
        0.95
    );
    if (maxInputTokensFraction > 0.95) {
        maxInputTokensFraction = 0.95;
    } else if (maxInputTokensFraction < 0.05) {
        maxInputTokensFraction = 0.05;
    }
    const maxConcurrentModelRequests = config.get<number>(
        'maxConcurrentModelRequests',
        4
    );

    // hidden experimental setting for comparing prompts. Comma-separated list of prompt types to compare.
    // if empty, will only create a single review using the default prompt type.
    const comparePromptTypes = config.get<string>('comparePromptTypes');

    return {
        minSeverity,
        customPrompt,
        excludeGlobs,
        enableDebugOutput,
        chatModel,
        mergeFileReviewRequests,
        maxInputTokensFraction,
        maxConcurrentModelRequests,
        comparePromptTypes,
    };
}
