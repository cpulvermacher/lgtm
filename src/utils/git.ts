import { SimpleGit } from 'simple-git';

import { ReviewRequest } from '../types/ReviewRequest';
import { ReviewScope } from '../types/ReviewScope';

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

export async function getReviewScope(
    git: SimpleGit,
    request: ReviewRequest
): Promise<ReviewScope> {
    let oldRev: string;
    let newRev: string;
    if ('commit' in request) {
        newRev = request.commit;
        oldRev = `${newRev}^`;
    } else {
        newRev = request.targetBranch;
        oldRev = request.baseBranch;
    }

    const { revisionRangeDiff, revisionRangeLog } = await getCommitRange(
        git,
        oldRev,
        newRev
    );
    const changeDescription = await getCommitMessages(git, revisionRangeLog);

    return { request, revisionRangeDiff, revisionRangeLog, changeDescription };
}

/** Validates the given revisions and returns diff ranges to get changes between the latest common ancestor and the new revision */
async function getCommitRange(git: SimpleGit, oldRev: string, newRev: string) {
    await git.revparse(['--verify', '--end-of-options', oldRev]);
    await git.revparse(['--verify', '--end-of-options', newRev]);

    return {
        revisionRangeDiff: `${oldRev}...${newRev}`,
        revisionRangeLog: `${oldRev}..${newRev}`,
    };
}

/** return all commit messages in a newline-separated string*/
async function getCommitMessages(
    git: SimpleGit,
    revisionRangeLog: string
): Promise<string> {
    const logs = await git.log([revisionRangeLog]);
    return logs.all.map((log) => log.message).join('\n');
}
