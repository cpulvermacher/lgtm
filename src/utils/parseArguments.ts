import { Git } from './git';

export type ParsedArguments = {
    target?: string;
    base?: string;
};

/** parse given arguments to a /command in the format
 * [target [base]]
 * That is, try to parse the first two arguments as commit refs.
 * If base is not a commit ref, it is ignored.
 * If target is not a commit ref, both target and base are ignored.
 */
export async function parseArguments(
    git: Git,
    args: string
): Promise<ParsedArguments> {
    args = args.trim();
    if (!args || args.length === 0) {
        return {};
    }

    const [target, base, ...rest] = args.split(' ');
    if (rest.length > 0) {
        throw new Error('Expected at most two refs as arguments.' + usageHint);
    }

    if (!target) {
        return {};
    }

    if (!(await isCommitRef(git, target))) {
        throw new Error(`Could not find target ref '${target}'.` + usageHint);
    }
    if (!base) {
        return { target };
    }

    if (!(await isCommitRef(git, base))) {
        throw new Error(`Could not find base ref '${base}'.` + usageHint);
    }

    return { target, base };
}

const usageHint =
    '\nUsage: /review [target [base]], with target and base being any branch, tag or commit ref. Use the command without arguments to select refs interactively.';

async function isCommitRef(git: Git, ref: string): Promise<boolean> {
    try {
        await git.getCommitRef(ref);
        return true;
    } catch {
        return false;
    }
}
