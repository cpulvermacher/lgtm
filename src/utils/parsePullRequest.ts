import { BitBucketDataModel } from '@/types/BitBucketPullRequest';

export function parsePullRequest(model: unknown): {
    target: string;
    base: string;
} {
    if (!model || typeof model !== 'object') {
        throw new Error('Invalid model object');
    }

    //try parsing as BitBucket PR
    const bitbucketModel = model as BitBucketDataModel;
    const bitbucketTargetBranch = bitbucketModel?.pr?.data?.source?.branchName;
    const bitbucketBaseBranch =
        bitbucketModel?.pr?.data?.destination?.branchName;
    if (bitbucketTargetBranch && bitbucketBaseBranch) {
        return { target: bitbucketTargetBranch, base: bitbucketBaseBranch };
    }

    throw new Error(
        "Unsupported model type. This doesn't look like a pull request."
    );
}
