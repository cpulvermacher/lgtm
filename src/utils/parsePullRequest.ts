import type { BitBucketDataModel } from '@/types/BitBucketPullRequest';
import type { Config } from '@/types/Config';
import type {
    GitHubPullRequestModel,
    GitHubRef,
} from '@/types/GitHubPullRequest';
import type { Git } from './git';

/** thrown when command is run on something that is not a supported pull request */
export class UnsupportedModelError extends Error {
    constructor(message: string) {
        super(message);
    }
}

/** thrown when we can not find a git remote for the given repository */
export class GitHubRemoteNotFound extends Error {
    constructor(owner: string, repository: string) {
        super(`Remote for ${owner}/${repository} not found`);
    }
}

/** thrown when we can not find a remote git branch */
export class RemoteBranchNotFound extends Error {
    constructor(
        public remote: string,
        branch: string
    ) {
        super(`Remote branch ${branch} not found`);
    }
}

type PullRequestTarget = {
    target: string;
    base: string;
};

export async function parsePullRequest(
    config: Config,
    model: unknown
): Promise<PullRequestTarget> {
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
            target: getRemoteBranch(remoteName, target),
            base: getRemoteBranch(remoteName, base),
        };
    }

    //try parsing as GitHub PR
    if ('pullRequestModel' in model) {
        const pr = (model as GitHubPullRequestModel).pullRequestModel;
        const targetRef = pr?.item?.head;
        const baseRef = pr?.item?.base;

        if (!targetRef || !baseRef) {
            throw new Error('Could not parse GitHub pull request branches');
        }

        return {
            target: await getRemoteBranchFromRef(config.git, targetRef),
            base: await getRemoteBranchFromRef(config.git, baseRef),
        };
    }

    throw new UnsupportedModelError(
        "Unsupported model type. This doesn't look like a pull request."
    );
}

function getRemoteBranch(remote: string | undefined, branch: string): string {
    return remote ? `${remote}/${branch}` : branch;
}

async function getRemoteBranchFromRef(
    git: Git,
    ref: GitHubRef
): Promise<string> {
    //TODO pass `localBranchName` and check if that branch matches the sha

    //check if our workspace has a github remote for the given owner/repo
    const remotes = await git.getRemotes();
    const matchingRemote = remotes.find((remote) => {
        const parsedRemote = parseGitHubRemoteUrl(remote.url);
        return (
            parsedRemote &&
            parsedRemote.owner === ref.repo.owner &&
            parsedRemote.repo === ref.repo.name
        );
    });
    if (!matchingRemote) {
        throw new GitHubRemoteNotFound(ref.repo.owner, ref.repo.name);
    }

    //construct branch name and check if it exists
    const remoteBranchName = `${matchingRemote.name}/${ref.ref}`;
    try {
        //throws on failure
        await git.getCommitRef(remoteBranchName);
    } catch {
        throw new RemoteBranchNotFound(matchingRemote.name, remoteBranchName);
    }

    return remoteBranchName;
}

function parseGitHubRemoteUrl(url: string) {
    // HTTPS URL, e.g. https://github.com/user/repo.git
    let separator = 'github.com/';
    if (!url.startsWith('https://')) {
        // SSH URL, e.g. git@github.com:user/repo.git

        if (url.includes('github.com:')) separator = 'github.com:';
    }
    const ownerRepo = url.split(separator, 2)[1];
    if (!ownerRepo) {
        return undefined;
    }

    let [owner, repo] = ownerRepo.split('/', 2);
    //remove .git from repo (if exists)
    if (url.endsWith('.git')) {
        repo = repo.slice(0, -4);
    }

    return { owner, repo };
}
