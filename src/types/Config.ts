import type { Git } from '@/utils/git';
import type { Logger } from './Logger';
import type { Model } from './Model';

export type Config = {
    workspaceRoot: string;
    gitRoot: string;
    git: Git;
    getModel: (modelId?: string) => Promise<Model>;
    /**
     * Prompt the user to select one or more models for the current session.
     * Returns true if at least one model was selected, false if the user cancelled.
     * The selected models will be used for subsequent getSessionModelIds() calls until clearSessionModel() is called.
     */
    promptForSessionModel: () => Promise<boolean>;
    /** Set session model IDs directly (e.g. from inline model: specs in the prompt) */
    setSessionModelIds: (ids: string[]) => void;
    /** Clear any session-scoped model override */
    clearSessionModel: () => void;
    /** Get the current model IDs (session models if set, otherwise default from settings) */
    getSessionModelIds: () => string[];
    getOptions: () => Options;
    setOption: <K extends keyof Options>(
        key: K,
        value: Options[K]
    ) => Promise<void>;
    logger: Logger;
};

export type Options = {
    minSeverity: number;
    customPrompt: string;
    excludeGlobs: string[];
    enableDebugOutput: boolean;
    chatModel: string;
    selectChatModelForReview: ChatModelOnNewPromptType;
    outputModeWithMultipleModels: ReviewFlowType;
    mergeFileReviewRequests: boolean;
    maxInputTokensFraction: number;
    maxConcurrentModelRequests: number;
    comparePromptTypes?: string;
    saveOutputToFile: boolean;
    autoCheckoutTarget: AutoCheckoutTargetType;
};

export type AutoCheckoutTargetType = 'ask' | 'always' | 'never';
export type ChatModelOnNewPromptType = 'Use default' | 'Always ask';
export type ReviewFlowType = 'Separate sections' | 'Merged with attribution';
