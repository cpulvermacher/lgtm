import { Git } from './git';

export type ParsedArguments = {
    target?: string;
    base?: string;
    customPrompt?: string;
};

/** parse given arguments to a /command in the format
 * [target [base]] [customPrompt]
 * That is, try to parse the first two arguments as commit refs and the rest as a custom prompt.
 * If the first arguments are not valid commit refs, everything is considered a custom prompt.
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
    if (await isCommitRef(git, target)) {
        const restString = rest.length > 0 ? rest.join(' ') : undefined;
        if (base && (await isCommitRef(git, base))) {
            return { target, base, customPrompt: restString };
        }
        const customPrompt = restString ? `${base} ${restString}` : base;
        return { target, customPrompt };
    }

    return { customPrompt: args };
}

async function isCommitRef(git: Git, ref: string): Promise<boolean> {
    try {
        await git.getCommitRef(ref);
        return true;
    } catch {
        return false;
    }
}
