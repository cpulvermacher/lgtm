import { SimpleGit } from 'simple-git';

/** Validates the given revisions and returns a diff range `old..new` */
export async function getCommitRange(
    git: SimpleGit,
    oldRev: string,
    newRev: string
): Promise<string> {
    await git.revparse(['--verify', '--end-of-options', oldRev]);
    await git.revparse(['--verify', '--end-of-options', newRev]);

    return `${oldRev}..${newRev}`;
}

/** Get list of files in the commit */
export async function getChangedFiles(
    git: SimpleGit,
    diffRevisionRange: string
) {
    const fileString = await git.diff(['--name-only', diffRevisionRange]);
    return fileString.split('\n').filter((f) => f.length > 0);
}

export async function getFileDiff(
    git: SimpleGit,
    diffRevisionRange: string,
    file: string
) {
    return await git.diff(['--no-prefix', diffRevisionRange, '--', file]);
}
