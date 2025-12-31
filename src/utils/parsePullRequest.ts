import { BitBucketDataModel } from '@/types/BitBucketPullRequest';

type PullRequestTarget = {
    remote?: string; // remote name, e.g. "origin"
    target: string;
    base: string;
};

export function parsePullRequest(model: unknown): PullRequestTarget {
    if (!model || typeof model !== 'object') {
        throw new Error('Invalid model object');
    }

    //try parsing as BitBucket PR
    const bitbucketModel = model as BitBucketDataModel;
    const bitbucketTargetBranch = bitbucketModel?.pr?.data?.source?.branchName;
    const bitbucketBaseBranch =
        bitbucketModel?.pr?.data?.destination?.branchName;
    if (bitbucketTargetBranch && bitbucketBaseBranch) {
        const remoteName =
            bitbucketModel?.pr?.workspaceRepo?.mainSiteRemote?.remote.name;
        return {
            remote: remoteName,
            target: bitbucketTargetBranch,
            base: bitbucketBaseBranch,
        };
    }

    throw new Error(
        "Unsupported model type. This doesn't look like a pull request."
    );
}
