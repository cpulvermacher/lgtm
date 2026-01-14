export interface GitHubPullRequestModel {
    pullRequestModel: PullRequestModel;
}

interface PullRequestModel {
    number: number;
    title: string;
    localBranchName?: string; // e.g. "pr/ghuser/1", if checked out via `gh` before
    mergeBase?: string;
    item: PullRequest;
}

interface Issue {
    id: number;
    url: string;
    number: number;
    state: string;
    repositoryOwner?: string;
    repositoryName?: string;
    repositoryUrl?: string;
}

interface PullRequest extends Issue {
    isRemoteHeadDeleted?: boolean;
    head?: GitHubRef;
    isRemoteBaseDeleted?: boolean;
    base?: GitHubRef;
}

export interface GitHubRef {
    label: string; // e.g. "ghuser:branch"
    ref: string; // e.g. "branch"
    sha: string;
    repo: Repository;
}

interface Repository {
    cloneUrl: string; // e.g. "https://github.com/ghuser/repo" (always https?)
    isInOrganization: boolean;
    owner: string;
    name: string; // this can be a branch name?
}
