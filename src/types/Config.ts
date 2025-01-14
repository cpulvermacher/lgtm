import type { Git } from '../utils/git';
import type { Logger } from '../vscode/logger';
import type { Model } from './Model';

export type Config = {
    workspaceRoot: string;
    gitRoot: string;
    git: Git;
    model: Model;
    getOptions: () => Options;
    logger: Logger;
};

export type Options = {
    minSeverity: number;
    customPrompt: string;
    excludeGlobs: string[];
    enableDebugOutput: boolean;
    chatModel: string;
};
