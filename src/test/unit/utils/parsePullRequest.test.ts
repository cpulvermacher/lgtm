import { describe, expect, it, vi } from 'vitest';

import type { BitBucketDataModel } from '@/types/BitBucketPullRequest';
import type { Config } from '@/types/Config';
import type { GitHubPullRequestModel } from '@/types/GitHubPullRequest';
import {
    GitHubRemoteNotFound,
    parsePullRequest,
    RemoteBranchNotFound,
    UnsupportedModelError,
} from '@/utils/parsePullRequest';

describe('parsePullRequest', () => {
    const getRemotes = vi.fn();
    const getCommitRef = vi.fn();
    const config = {
        git: {
            getRemotes,
            getCommitRef,
        },
    } as unknown as Config;

    it('throws if model itself seems invalid', async () => {
        await expect(() => parsePullRequest(config, null)).rejects.toThrow(
            UnsupportedModelError
        );
        await expect(() => parsePullRequest(config, undefined)).rejects.toThrow(
            UnsupportedModelError
        );
        await expect(() => parsePullRequest(config, 'abc')).rejects.toThrow(
            UnsupportedModelError
        );
    });

    it('parses bitbucket pull request model without remote', async () => {
        const model = {
            pr: {
                data: {
                    source: {
                        branchName: 'feature-branch',
                    },
                    destination: {
                        branchName: 'main',
                    },
                },
            },
        } as BitBucketDataModel;

        const result = await parsePullRequest(config, model);

        expect(result).toEqual({
            target: 'feature-branch',
            base: 'main',
        });
    });

    it('parses bitbucket pull request model with remote', async () => {
        const model = {
            pr: {
                data: {
                    source: {
                        branchName: 'feature-branch',
                    },
                    destination: {
                        branchName: 'main',
                    },
                },
                workspaceRepo: {
                    mainSiteRemote: {
                        remote: {
                            name: 'abcdef',
                        },
                    },
                },
            },
        } as BitBucketDataModel;

        const result = await parsePullRequest(config, model);

        expect(result).toEqual({
            target: 'abcdef/feature-branch',
            base: 'abcdef/main',
        });
    });

    it('throws on bitbucket pull request with missing info', async () => {
        const model = {
            pr: {
                data: {},
                workspaceRepo: {},
            },
        } as BitBucketDataModel;

        await expect(() => parsePullRequest(config, model)).rejects.toThrow(
            'Could not parse BitBucket pull request branches'
        );
    });

    it('parses github pull request model', async () => {
        const model = {
            pullRequestModel: {
                item: {
                    head: {
                        ref: 'feature-branch',
                        repo: {
                            owner: 'owner2',
                            name: 'repo2',
                        },
                    },
                    base: {
                        ref: 'main',
                        repo: {
                            owner: 'owner1',
                            name: 'repo1',
                        },
                    },
                },
            },
        } as GitHubPullRequestModel;
        getRemotes.mockResolvedValue([
            { name: 'github-origin', url: 'git@github.com:owner1/repo1.git' },
            { name: 'other-user', url: 'https://github.com/owner2/repo2.git' },
        ]);
        getCommitRef.mockResolvedValue('abc');

        const result = await parsePullRequest(config, model);

        expect(result).toEqual({
            target: 'other-user/feature-branch',
            base: 'github-origin/main',
        });
    });

    it('parses github pull request model (branch not found)', async () => {
        const model = {
            pullRequestModel: {
                item: {
                    head: {
                        ref: 'feature-branch',
                        repo: {
                            owner: 'owner2',
                            name: 'repo2',
                        },
                    },
                    base: {
                        ref: 'main',
                        repo: {
                            owner: 'owner1',
                            name: 'repo1',
                        },
                    },
                },
            },
        } as GitHubPullRequestModel;
        getRemotes.mockResolvedValue([
            { name: 'github-origin', url: 'git@github.com:owner1/repo1.git' },
            { name: 'other-user', url: 'https://github.com/owner2/repo2.git' },
        ]);
        getCommitRef.mockRejectedValue(new Error());

        await expect(() => parsePullRequest(config, model)).rejects.toThrow(
            RemoteBranchNotFound
        );
    });

    it('parses github pull request model (remote not found)', async () => {
        const model = {
            pullRequestModel: {
                item: {
                    head: {
                        ref: 'feature-branch',
                        repo: {
                            owner: 'owner2',
                            name: 'repo2',
                        },
                    },
                    base: {
                        ref: 'main',
                        repo: {
                            owner: 'owner1',
                            name: 'repo1',
                        },
                    },
                },
            },
        } as GitHubPullRequestModel;
        getRemotes.mockResolvedValue([
            { name: 'github-origin', url: 'git@github.com:owner1/repo1.git' },
        ]);

        await expect(() => parsePullRequest(config, model)).rejects.toThrow(
            GitHubRemoteNotFound
        );
    });

    it('throws on github pull request with missing info', async () => {
        const model = {
            pullRequestModel: {},
        } as GitHubPullRequestModel;

        await expect(() => parsePullRequest(config, model)).rejects.toThrow(
            'Could not parse GitHub pull request branches'
        );
    });

    it('throws if model is unsupported type', async () => {
        const model = {};

        await expect(() => parsePullRequest(config, model)).rejects.toThrow(
            UnsupportedModelError
        );
    });
});
