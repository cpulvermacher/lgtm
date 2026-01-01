import { BitBucketDataModel } from '@/types/BitBucketPullRequest';

/** thrown when command is run on something that is not a supported pull request */
export class UnsupportedModelError extends Error {
    constructor(message: string) {
        super(message);
    }
}

type PullRequestTarget = {
    remote?: string; // remote name, e.g. "origin"
    target: string;
    base: string;
};

export function parsePullRequest(model: unknown): PullRequestTarget {
    if (!model || typeof model !== 'object') {
        throw new UnsupportedModelError('Invalid model object');
    }

    //try parsing as BitBucket PR
    if ('pr' in model) {
        const pr = (model as BitBucketDataModel).pr;
        const target = pr?.data?.source?.branchName;
        const base = pr?.data?.destination?.branchName;
        const remoteName = pr.workspaceRepo?.mainSiteRemote?.remote?.name;

        if (!target || !base) {
            throw new Error('Could not parse BitBucket pull request branches');
        }

        return {
            remote: remoteName,
            target,
            base,
        };
    }

    throw new UnsupportedModelError(
        "Unsupported model type. This doesn't look like a pull request."
    );
}
