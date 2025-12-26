// bitbucket pull request data model, based on
// https://github.com/atlassian/atlascode/blob/main/src/bitbucket/model.ts
export interface BitBucketDataModel {
    pr: PullRequest;
}

interface PullRequest {
    data: {
        id: number;
        title: string;
        source: ScmItem;
        destination: ScmItem;
    };
    workspaceRepo?: {
        rootUri: string;
        mainSiteRemote: SiteRemote;
        siteRemotes: SiteRemote[];
    };
}

interface ScmItem {
    branchName: string;
    commitHash: string;
}

interface SiteRemote {
    remote: {
        name: string;
        fetchUrl?: string;
    };
}
