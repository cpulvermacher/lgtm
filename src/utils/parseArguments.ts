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
        throw new Error(
            'Expected at most two refs as arguments. Use the command without arguments to select refs interactively.'
        );
    }
    if (await isCommitRef(git, target)) {
        if (base && (await isCommitRef(git, base))) {
            return { target, base };
        }
        return { target };
    }

    return {};
}

async function isCommitRef(git: Git, ref: string): Promise<boolean> {
    try {
        await git.getCommitRef(ref);
        return true;
    } catch {
        return false;
    }
}
