import type { Git } from '@/utils/git';
import type { Logger } from './Logger';
import type { Model } from './Model';

export type Config = {
    workspaceRoot: string;
    gitRoot: string;
    git: Git;
    getModel: () => Promise<Model>;
    /**
     * Prompt the user to select a model for the current session only.
     * Returns true if a model was selected, false if the user cancelled.
     * The selected model will be used for subsequent getModel() calls until clearSessionModel() is called.
     */
    promptForSessionModel: () => Promise<boolean>;
    /** Clear any session-scoped model override */
    clearSessionModel: () => void;
    /** Get the current model ID (session model if set, otherwise default from settings) */
    getCurrentModelId: () => string;
    getOptions: () => Options;
    setOption: <K extends keyof Options>(
        key: K,
        value: Options[K],
    ) => Promise<void>;
    logger: Logger;
};

export type Options = {
    minSeverity: number;
    customPrompt: string;
    excludeGlobs: string[];
    enableDebugOutput: boolean;
    chatModel: string;
    chatModelOnNewPrompt: ChatModelOnNewPromptType;
    mergeFileReviewRequests: boolean;
    maxInputTokensFraction: number;
    maxConcurrentModelRequests: number;
    comparePromptTypes?: string;
    saveOutputToFile: boolean;
    autoCheckoutTarget: AutoCheckoutTargetType;
};

export type AutoCheckoutTargetType = 'ask' | 'always' | 'never';
export type ChatModelOnNewPromptType = 'useDefault' | 'alwaysAsk';
