import * as vscode from 'vscode';

import type {
    AutoCheckoutTargetType,
    ChatModelOnNewPromptType,
    Config,
    Options,
    ReviewFlowType,
} from '@/types/Config';
import type { Model } from '@/types/Model';
import { isCopilotCodeReviewProviderId } from '@/types/ReviewProvider';
import { createGit, type Git } from '@/utils/git';
import { defaultModelId, defaultPreferredModelIds } from './defaultModels';
import { LgtmLogger } from './logger';
import { getChatModel, getModelQuickPickItems } from './model';

// defined when built via `npm run dev`
declare const __GIT_VERSION__: string | undefined;

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

    // Session-scoped model overrides (not persisted to settings)
    let sessionModelIds: string[] = [];

    const config = {
        git,
        workspaceRoot,
        gitRoot,
        getModel: (modelId?: string) => {
            const id = modelId ?? sessionModelIds[0] ?? getOptions().chatModel;
            return loadReviewProvider(id);
        },
        promptForSessionModelIds: async () => {
            const selectedModelIds = await promptForModelSelection(
                sessionModelIds.length > 0
                    ? sessionModelIds
                    : [getOptions().chatModel]
            );
            if (selectedModelIds && selectedModelIds.length > 0) {
                sessionModelIds = selectedModelIds;
                logger.debug(
                    `Session models set to: ${sessionModelIds.join(', ')}`
                );
                return selectedModelIds;
            }
            return undefined;
        },
        promptForSessionModel: async () => {
            const selectedModelIds = await config.promptForSessionModelIds();
            return (selectedModelIds?.length ?? 0) > 0;
        },
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
            error instanceof Error
                ? `\n\n\`\`\`\n${error.message}\n\`\`\``
                : '';
        throw new Error(
            'Error opening Git repository. Please open a folder containing a Git repository using `File -> Open Folder` and make sure Git is installed.' +
                message
        );
    }
    const gitRoot = git.getGitRoot();
    return { workspaceRoot, git, gitRoot };
}

/** get desired review provider.
 *
 * If the model is not available, shows an error toast with possible options.
 * Note that this is rather slow (~1 sec), avoid repeated calls.
 */
async function loadReviewProvider(modelId: string): Promise<Model> {
    const { logger } = await getConfig();
    logger.debug(`Loading review provider: ${modelId}`);

    if (isCopilotCodeReviewProviderId(modelId)) {
        throw new Error(
            'Copilot Code Review is a special review provider and cannot be loaded as a chat model.'
        );
    }

    try {
        return await getChatModel(modelId);
    } catch (error) {
        const errorMessage =
            error instanceof Error
                ? error.message
                : 'Error loading review provider';
        logger.info(
            `[Error] Failed to load review provider (was trying ${modelId}): ${errorMessage}`
        );

        const resetToDefaultOption = `Reset to Default (${defaultModelId})`;
        const selectChatModelOption = 'Select Review Provider';
        const options = [selectChatModelOption];
        if (modelId !== defaultModelId) {
            options.unshift(resetToDefaultOption);
        }

        // Notify the user
        const option = await vscode.window.showErrorMessage(
            `Failed to load review provider '${modelId}'. Reason: ${errorMessage}\nDo you want to reset to the default provider or select a different one?`,
            ...options
        );

        if (option === resetToDefaultOption) {
            await setOption('chatModel', defaultModelId);
            logger.info(`Review provider reset to default: ${defaultModelId}`);
            return await loadReviewProvider(defaultModelId);
        } else if (option === selectChatModelOption) {
            await vscode.commands.executeCommand('lgtm.selectChatModel');
            return await loadReviewProvider(getOptions().chatModel);
        }

        throw new Error(
            `Couldn't find review provider. Please ensure the lgtm.chatModel setting is set to an available provider ID. You can use the 'LGTM: Select Chat Model' command to pick one.`
        );
    }
}

function getOptions(): Options {
    const config = vscode.workspace.getConfiguration('lgtm');

    const minSeverity = config.get<number>('minSeverity', 1);
    const customPrompt = config.get<string>('customPrompt', '');
    const contextFiles = config.get<string[]>('contextFiles', ['AGENTS.md']);
    const excludeGlobs = config.get<string[]>('exclude', []);
    const enableDebugOutput = config.get<boolean>('enableDebugOutput', false);
    const chatModel = config.get<string>('chatModel', defaultModelId);
    const preferredModels = config.get<string[]>(
        'preferredModels',
        defaultPreferredModelIds
    );
    const selectChatModelForReview = config.get<ChatModelOnNewPromptType>(
        'selectChatModelForReview',
        'Use default'
    );
    const outputModeWithMultipleModels = config.get<ReviewFlowType>(
        'outputModeWithMultipleModels',
        'Separate sections'
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
    const includeDeletedFiles = config.get<boolean>(
        'includeDeletedFiles',
        true
    );

    // hidden experimental setting for comparing prompts. Comma-separated list of prompt types to compare.
    // if empty, will only create a single review using the default prompt type.
    const comparePromptTypes = config.get<string>('comparePromptTypes');

    return {
        minSeverity,
        customPrompt,
        contextFiles,
        excludeGlobs,
        enableDebugOutput,
        chatModel,
        preferredModels,
        selectChatModelForReview,
        outputModeWithMultipleModels,
        maxInputTokensFraction,
        maxConcurrentModelRequests,
        comparePromptTypes,
        saveOutputToFile,
        autoCheckoutTarget,
        includeDeletedFiles,
    };
}

async function setOption<T extends keyof Options>(
    option: T,
    value: Options[T]
) {
    const cfg = vscode.workspace.getConfiguration('lgtm');
    const inspection = cfg.inspect(option);
    let target = vscode.ConfigurationTarget.Global;
    if (inspection?.workspaceFolderValue !== undefined) {
        target = vscode.ConfigurationTarget.WorkspaceFolder;
    } else if (inspection?.workspaceValue !== undefined) {
        target = vscode.ConfigurationTarget.Workspace;
    }
    await cfg.update(option, value, target);
}

/**
 * Prompt the user to select one or more models for the current session.
 * Returns an array of selected model IDs (in "vendor:id" format) or undefined if cancelled.
 */
async function promptForModelSelection(
    currentModelIds: string[]
): Promise<string[] | undefined> {
    const models = await vscode.lm.selectChatModels();
    const quickPickItems = getModelQuickPickItems(models ?? []);

    const itemsWithSelectionState = quickPickItems.map((item) => {
        if (item.kind === vscode.QuickPickItemKind.Separator) return item;

        const isPicked = currentModelIds.some((modelId) => {
            if (!item.providerId) {
                return false;
            }

            return (
                modelId === item.providerId ||
                modelId === item.modelIdWithVendor ||
                modelId === item.id
            );
        });

        return { ...item, picked: isPicked };
    });
    const selectedItems = await vscode.window.showQuickPick(
        itemsWithSelectionState,
        {
            placeHolder:
                'Select one or more review providers for this review (use Space to select multiple)',
            canPickMany: true,
        }
    );

    if (!selectedItems || selectedItems.length === 0) {
        return undefined;
    }

    return selectedItems
        .filter((item) => item.providerId !== undefined)
        .map((item) => item.providerId as string);
}
