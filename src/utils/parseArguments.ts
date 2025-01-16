import { Git } from './git';

export type ParsedArguments = {
    target: string | undefined;
    base: string | undefined;
};

/** parse given arguments to a /command into target/base refs.
 * If no arguments are provided, returns undefined instead of refs.
 * If arguments cannot be parsed into at least one ref, throws.
 */
export async function parseArguments(
    git: Git,
    args: string
): Promise<ParsedArguments> {
    if (!args || args.trim().length === 0) {
        return { target: undefined, base: undefined };
    }

    const [target, base] = args.split(' ', 2);
    await git.getCommitRef(target);
    if (base) {
        await git.getCommitRef(base);
    }
    return { target, base };
}
