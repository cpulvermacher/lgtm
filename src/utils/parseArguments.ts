import { UncommittedRef } from '@/types/Ref';
import { Git } from './git';

export type ParsedArguments =
    | { target?: string; base?: string; modelIds?: string[] }
    | { target: UncommittedRef; base?: never; modelIds?: string[] };

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
    const { modelIds, remaining } = extractModelSpecs(args);

    const [target, base, ...rest] = remaining;
    if (rest.length > 0) {
        throw new Error(`Expected at most two refs as arguments. ${usageHint}`);
    }

    if (!target) {
        return { ...(modelIds.length > 0 ? { modelIds } : {}) };
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
            ...(modelIds.length > 0 ? { modelIds } : {}),
        };
    } else if (!(await isCommitRef(git, target))) {
        throw new Error(`Could not find target ref '${target}'. ${usageHint}`);
    }
    if (!base) {
        return { target, ...(modelIds.length > 0 ? { modelIds } : {}) };
    }

    if (!(await isCommitRef(git, base))) {
        throw new Error(`Could not find base ref '${base}'. ${usageHint}`);
    }

    return { target, base, ...(modelIds.length > 0 ? { modelIds } : {}) };
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
        if (token.startsWith('model:')) {
            const modelSpec = token.slice('model:'.length);
            if (modelSpec) {
                modelIds.push(modelSpec);
            }
        } else {
            remaining.push(token);
        }
    }

    return { modelIds, remaining };
}

const usageHint =
    '\nUsage: /review [model:modelId...] [target [base]], with target and base being any branch, tag or commit ref. Use model:modelId to specify one or more models inline. Use the command without arguments to select refs interactively.';

async function isCommitRef(git: Git, ref: string): Promise<boolean> {
    try {
        await git.getCommitRef(ref);
        return true;
    } catch {
        return false;
    }
}
