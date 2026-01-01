import { describe, expect, it } from 'vitest';

import { BitBucketDataModel } from '@/types/BitBucketPullRequest';
import {
    parsePullRequest,
    UnsupportedModelError,
} from '@/utils/parsePullRequest';

describe('parsePullRequest', () => {
    it('throws if model itself seems invalid', () => {
        expect(() => parsePullRequest(null)).toThrow(UnsupportedModelError);
        expect(() => parsePullRequest(undefined)).toThrow(
            UnsupportedModelError
        );
        expect(() => parsePullRequest('abc')).toThrow(UnsupportedModelError);
    });

    it('parses bitbucket pull request model without remote', () => {
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

        const result = parsePullRequest(model);

        expect(result).toEqual({
            target: 'feature-branch',
            base: 'main',
        });
    });

    it('parses bitbucket pull request model with remote', () => {
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

        const result = parsePullRequest(model);

        expect(result).toEqual({
            remote: 'abcdef',
            target: 'feature-branch',
            base: 'main',
        });
    });

    it('throws if model is unsupported type', () => {
        const model = {};

        expect(() => parsePullRequest(model)).toThrow(UnsupportedModelError);
    });
});
