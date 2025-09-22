import type { Git } from '@/utils/git';
import type { Logger } from './Logger';
import type { Model } from './Model';

export type Config = {
    workspaceRoot: string;
    gitRoot: string;
    git: Git;
    getModel: () => Promise<Model>;
    getOptions: () => Options;
    logger: Logger;
};

export type Options = {
    minSeverity: number;
    customPrompt: string;
    excludeGlobs: string[];
    enableDebugOutput: boolean;
    chatModel: string;
    mergeFileReviewRequests: boolean;
    maxInputTokensFraction: number;
    maxConcurrentModelRequests: number;
    comparePromptTypes?: string;
};
