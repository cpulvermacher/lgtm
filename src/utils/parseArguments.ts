import { UncommittedRef } from '@/types/Ref';
import { Git } from './git';

export type ParsedArguments =
    | {
          target?: string;
          base?: string;
          modelIds?: string[];
          contextFilesOverride?: string[];
      }
    | {
          target: UncommittedRef;
          base?: never;
          modelIds?: string[];
          contextFilesOverride?: string[];
      };

const withModelIds = (modelIds: string[]) =>
    modelIds.length > 0 ? { modelIds } : {};
const withContextFilesOverride = (contextFilesOverride?: string[]) =>
    contextFilesOverride !== undefined ? { contextFilesOverride } : {};

/** parse given arguments to a /command in the format
 * [model:modelId...] [target [base]]
 * That is, first extract any model:xxx tokens, then try to parse the
 * remaining arguments as commit refs.
 * If base is not a commit ref, it is ignored.
 * If target is not a commit ref, both target and base are ignored.
 */
export async function parseArguments(
    git: Git,
    args: string
): Promise<ParsedArguments> {
    args = args.trim();

    // Extract model: tokens before parsing refs
    const { modelIds, remaining: remainingAfterModels } =
        extractModelSpecs(args);
    const { contextFilesOverride, remaining } = extractContextSpecs(
        remainingAfterModels.join(' ')
    );

    const [target, base, ...rest] = remaining;
    if (rest.length > 0) {
        throw new Error(`Expected at most two refs as arguments. ${usageHint}`);
    }

    if (!target) {
        return {
            ...withModelIds(modelIds),
            ...withContextFilesOverride(contextFilesOverride),
        };
    }

    if (target === 'staged' || target === 'unstaged') {
        if (base) {
            throw new Error(
                `Expected no argument after '${target}'. ${usageHint}`
            );
        }
        return {
            target:
                target === 'staged'
                    ? UncommittedRef.Staged
                    : UncommittedRef.Unstaged,
            ...withModelIds(modelIds),
            ...withContextFilesOverride(contextFilesOverride),
        };
    } else if (!(await isCommitRef(git, target))) {
        throw new Error(`Could not find target ref '${target}'. ${usageHint}`);
    }
    if (!base) {
        return {
            target,
            ...withModelIds(modelIds),
            ...withContextFilesOverride(contextFilesOverride),
        };
    }

    if (!(await isCommitRef(git, base))) {
        throw new Error(`Could not find base ref '${base}'. ${usageHint}`);
    }

    return {
        target,
        base,
        ...withModelIds(modelIds),
        ...withContextFilesOverride(contextFilesOverride),
    };
}

/** Extract model:xxx tokens from args, returning the model specs and remaining tokens */
export function extractModelSpecs(args: string): {
    modelIds: string[];
    remaining: string[];
} {
    const tokens = args.split(/\s+/).filter(Boolean);
    const modelIds: string[] = [];
    const remaining: string[] = [];

    for (const token of tokens) {
        const tokenLower = token.toLowerCase();
        if (tokenLower.startsWith('model:')) {
            const modelSpec = token
                .slice('model:'.length)
                .replace(/[.,;:!?]+$/, '');
            if (modelSpec) {
                modelIds.push(modelSpec);
            }
        } else {
            remaining.push(token);
        }
    }

    return { modelIds, remaining };
}

/** Extract context:xxx tokens from args, returning the override and remaining tokens */
export function extractContextSpecs(args: string): {
    contextFilesOverride?: string[];
    remaining: string[];
} {
    const tokens = args.split(/\s+/).filter(Boolean);
    const contextFiles: string[] = [];
    const remaining: string[] = [];
    let hasOverride = false;

    for (const token of tokens) {
        const tokenLower = token.toLowerCase();
        if (tokenLower.startsWith('context:')) {
            hasOverride = true;
            const contextSpec = token
                .slice('context:'.length)
                .replace(/[.,;:!?]+$/, '');
            if (!contextSpec) {
                continue;
            }

            if (contextSpec.toLowerCase() === 'none') {
                contextFiles.length = 0;
                continue;
            }
            contextFiles.push(contextSpec);
            continue;
        }

        remaining.push(token);
    }

    return {
        contextFilesOverride: hasOverride ? contextFiles : undefined,
        remaining,
    };
}

const usageHint =
    '\nUsage: /review [model:modelId...] [context:path...] [target [base]], with target and base being any branch, tag or commit ref. Use model:modelId to specify one or more models inline. Use context:path to override which context files are attached for this review, or context:none to disable them entirely. Use the command without arguments to select refs interactively.';

async function isCommitRef(git: Git, ref: string): Promise<boolean> {
    try {
        await git.getCommitRef(ref);
        return true;
    } catch {
        return false;
    }
}
