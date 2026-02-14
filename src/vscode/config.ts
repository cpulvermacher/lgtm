import * as vscode from 'vscode';

import type { AutoCheckoutTargetType, Config, Options } from '@/types/Config';
import type { Logger } from '@/types/Logger';
import type { Model } from '@/types/Model';
import { createGit, type Git } from '@/utils/git';
import { LgtmLogger } from './logger';
import { getChatModel } from './model';

// defined when built via `npm run dev`
declare const __GIT_VERSION__: string | undefined;

export const defaultModelId = 'copilot:gpt-4.1';

let config: Config | undefined;

/** Return config
 *
 * set refreshWorkspace to refresh workspace / git configuration and ask user to select from multiple roots if needed
 */
export async function getConfig(options?: {
    refreshWorkspace?: boolean;
}): Promise<Config> {
    if (!config) {
        config = await initializeConfig();
    } else if (options?.refreshWorkspace) {
        config.logger.debug('Refreshing workspace configuration...');
        const { workspaceRoot, git, gitRoot } = await getWorkspaceConfig();
        config.workspaceRoot = workspaceRoot;
        config.git = git;
        config.gitRoot = gitRoot;
    }
    return config;
}

async function initializeConfig(): Promise<Config> {
    const logger = new LgtmLogger(getOptions().enableDebugOutput);
    if (__GIT_VERSION__) {
        logger.info(`**LGTM dev build**: ${__GIT_VERSION__}`);
    }

    const { workspaceRoot, git, gitRoot } = await getWorkspaceConfig();
    const config = {
        git,
        workspaceRoot,
        gitRoot,
        getModel: () => loadModel(getOptions().chatModel, logger),
        getOptions,
        setOption,
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

async function getWorkspaceConfig(): Promise<{
    workspaceRoot: string;
    git: Git;
    gitRoot: string;
}> {
    let mainWorkspace = vscode.workspace.workspaceFolders?.[0];
    if ((vscode.workspace.workspaceFolders?.length || 0) > 1) {
        //if there are multiple workspaces, ask the user to select one
        mainWorkspace = await vscode.window.showWorkspaceFolderPick();
    }

    if (!mainWorkspace) {
        throw new Error(
            'No workspace found or selected. Please open a folder containing a Git repository using `File -> Open Folder`.'
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
    const gitRoot = git.getGitRoot();
    return { workspaceRoot, git, gitRoot };
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
            await setOption('chatModel', defaultModelId);
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
    const saveOutputToFile = config.get<boolean>('saveOutputToFile', false);
    const autoCheckoutTarget = config.get<AutoCheckoutTargetType>(
        'autoCheckoutTarget',
        'ask'
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
        saveOutputToFile,
        autoCheckoutTarget,
    };
}

async function setOption<T extends keyof Options>(
    option: T,
    value: Options[T]
) {
    await vscode.workspace
        .getConfiguration('lgtm')
        .update(option, value, vscode.ConfigurationTarget.Global);
}
