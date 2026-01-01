import { describe, expect, it } from 'vitest';

import type { BitBucketDataModel } from '@/types/BitBucketPullRequest';
import type { Config } from '@/types/Config';
import {
    parsePullRequest,
    UnsupportedModelError,
} from '@/utils/parsePullRequest';

describe('parsePullRequest', () => {
    const config = {} as Config;
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

    it('throws if model is unsupported type', async () => {
        const model = {};

        await expect(() => parsePullRequest(config, model)).rejects.toThrow(
            UnsupportedModelError
        );
    });
});
