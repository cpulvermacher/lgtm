import { SimpleGit } from 'simple-git';

import { Model } from './Model';

export type Config = {
    workspaceRoot: string;
    gitRoot: string;
    git: SimpleGit;
    model: Model;
    getOptions: () => Options;
};

export type Options = {
    minSeverity: number;
    customPrompt: string;
    excludeGlobs: string[];
    enableDebugOutput: boolean;
    chatModel: string;
};
