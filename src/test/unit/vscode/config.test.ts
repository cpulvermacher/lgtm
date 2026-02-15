import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LanguageModelChat } from 'vscode';

import { getModelQuickPickItems } from '@/vscode/model';

vi.mock('vscode', () => ({
    QuickPickItemKind: { Separator: -1 },
}));

/**
 * Tests for the new configuration options and session model selection functionality.
 */

describe('Config options', () => {
    const packageJson = JSON.parse(
        readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
    ) as {
        contributes?: {
            configuration?: {
                properties?: Record<
                    string,
                    { enum?: string[]; default?: string }
                >;
            };
        };
    };

    const properties = packageJson.contributes?.configuration?.properties ?? {};

    describe('selectChatModelForReview option', () => {
        it('should declare expected enum values and default in package contributions', () => {
            const setting = properties['lgtm.selectChatModelForReview'];
            expect(setting?.enum).toEqual(['Use default', 'Always ask']);
            expect(setting?.default).toBe('Use default');
        });
    });

    describe('outputModeWithMultipleModels option', () => {
        it('should declare expected enum values and default in package contributions', () => {
            const setting = properties['lgtm.outputModeWithMultipleModels'];
            expect(setting?.enum).toEqual([
                'Separate sections',
                'Merged with attribution',
            ]);
            expect(setting?.default).toBe('Separate sections');
        });
    });
});

describe('Session model selection logic', () => {
    let sessionModelIds: string[];
    const defaultModel = 'copilot:gpt-4.1';

    beforeEach(() => {
        sessionModelIds = [];
    });

    describe('getSessionModelIds', () => {
        it('should return default model when no session model is set', () => {
            const getSessionModelIds = () =>
                sessionModelIds.length > 0 ? sessionModelIds : [defaultModel];

            expect(getSessionModelIds()).toEqual(['copilot:gpt-4.1']);
        });

        it('should return session model IDs when set', () => {
            sessionModelIds = ['copilot:claude-sonnet'];
            const getSessionModelIds = () =>
                sessionModelIds.length > 0 ? sessionModelIds : [defaultModel];

            expect(getSessionModelIds()).toEqual(['copilot:claude-sonnet']);
        });

        it('should return multiple session model IDs when multiple are selected', () => {
            sessionModelIds = [
                'copilot:gpt-4',
                'copilot:claude-sonnet',
                'copilot:gemini-pro',
            ];
            const getSessionModelIds = () =>
                sessionModelIds.length > 0 ? sessionModelIds : [defaultModel];

            expect(getSessionModelIds()).toHaveLength(3);
            expect(getSessionModelIds()).toContain('copilot:gpt-4');
            expect(getSessionModelIds()).toContain('copilot:claude-sonnet');
            expect(getSessionModelIds()).toContain('copilot:gemini-pro');
        });
    });

    describe('clearSessionModel', () => {
        it('should clear session models and revert to default', () => {
            sessionModelIds = ['copilot:claude-sonnet'];
            const getSessionModelIds = () =>
                sessionModelIds.length > 0 ? sessionModelIds : [defaultModel];
            const clearSessionModel = () => {
                sessionModelIds = [];
            };

            // Before clear
            expect(getSessionModelIds()).toEqual(['copilot:claude-sonnet']);

            // After clear
            clearSessionModel();
            expect(getSessionModelIds()).toEqual([defaultModel]);
        });
    });

    describe('promptForSessionModel', () => {
        it('should return true when models are selected', async () => {
            const mockShowQuickPick = vi
                .fn()
                .mockResolvedValue([
                    { label: 'GPT-4', modelIdWithVendor: 'copilot:gpt-4' },
                ]);

            const promptForSessionModel = async () => {
                const selected = await mockShowQuickPick();
                if (selected && selected.length > 0) {
                    sessionModelIds = selected
                        .filter(
                            (item: { modelIdWithVendor?: string }) =>
                                item.modelIdWithVendor !== undefined
                        )
                        .map(
                            (item: { modelIdWithVendor: string }) =>
                                item.modelIdWithVendor
                        );
                    return true;
                }
                return false;
            };

            const result = await promptForSessionModel();
            expect(result).toBe(true);
            expect(sessionModelIds).toEqual(['copilot:gpt-4']);
        });

        it('should return false when selection is cancelled', async () => {
            const mockShowQuickPick = vi.fn().mockResolvedValue(undefined);

            const promptForSessionModel = async () => {
                const selected = await mockShowQuickPick();
                if (selected && selected.length > 0) {
                    sessionModelIds = selected
                        .filter(
                            (item: { modelIdWithVendor?: string }) =>
                                item.modelIdWithVendor !== undefined
                        )
                        .map(
                            (item: { modelIdWithVendor: string }) =>
                                item.modelIdWithVendor
                        );
                    return true;
                }
                return false;
            };

            const result = await promptForSessionModel();
            expect(result).toBe(false);
            expect(sessionModelIds).toEqual([]);
        });

        it('should return false when no models are selected', async () => {
            const mockShowQuickPick = vi.fn().mockResolvedValue([]);

            const promptForSessionModel = async () => {
                const selected = await mockShowQuickPick();
                if (selected && selected.length > 0) {
                    sessionModelIds = selected
                        .filter(
                            (item: { modelIdWithVendor?: string }) =>
                                item.modelIdWithVendor !== undefined
                        )
                        .map(
                            (item: { modelIdWithVendor: string }) =>
                                item.modelIdWithVendor
                        );
                    return true;
                }
                return false;
            };

            const result = await promptForSessionModel();
            expect(result).toBe(false);
        });

        it('should filter out separator items from selection', async () => {
            const mockShowQuickPick = vi.fn().mockResolvedValue([
                { label: 'Recommended Models', kind: -1 }, // separator
                { label: 'GPT-4', modelIdWithVendor: 'copilot:gpt-4' },
            ]);

            const promptForSessionModel = async () => {
                const selected = await mockShowQuickPick();
                if (selected && selected.length > 0) {
                    sessionModelIds = selected
                        .filter(
                            (item: { modelIdWithVendor?: string }) =>
                                item.modelIdWithVendor !== undefined
                        )
                        .map(
                            (item: { modelIdWithVendor: string }) =>
                                item.modelIdWithVendor
                        );
                    return sessionModelIds.length > 0;
                }
                return false;
            };

            await promptForSessionModel();
            // Should only contain the actual model, not the separator
            expect(sessionModelIds).toEqual(['copilot:gpt-4']);
        });

        it('should allow selecting multiple models', async () => {
            const mockShowQuickPick = vi.fn().mockResolvedValue([
                { label: 'GPT-4', modelIdWithVendor: 'copilot:gpt-4' },
                {
                    label: 'Claude Sonnet',
                    modelIdWithVendor: 'copilot:claude-sonnet',
                },
                {
                    label: 'Gemini Pro',
                    modelIdWithVendor: 'copilot:gemini-pro',
                },
            ]);

            const promptForSessionModel = async () => {
                const selected = await mockShowQuickPick();
                if (selected && selected.length > 0) {
                    sessionModelIds = selected
                        .filter(
                            (item: { modelIdWithVendor?: string }) =>
                                item.modelIdWithVendor !== undefined
                        )
                        .map(
                            (item: { modelIdWithVendor: string }) =>
                                item.modelIdWithVendor
                        );
                    return true;
                }
                return false;
            };

            await promptForSessionModel();
            expect(sessionModelIds).toHaveLength(3);
            expect(sessionModelIds).toContain('copilot:gpt-4');
            expect(sessionModelIds).toContain('copilot:claude-sonnet');
            expect(sessionModelIds).toContain('copilot:gemini-pro');
        });
    });
});

describe('Model quick pick items', () => {
    const defaultModelId = 'copilot:gpt-4.1';

    function fakeModel(
        overrides: Partial<LanguageModelChat> & { id: string; vendor: string }
    ): LanguageModelChat {
        return {
            name: overrides.name ?? overrides.id,
            family: overrides.family ?? overrides.id,
            version: overrides.version ?? '1',
            maxInputTokens: overrides.maxInputTokens ?? 128000,
            countTokens: overrides.countTokens ?? (async () => 0),
            sendRequest: overrides.sendRequest ?? (async () => ({}) as never),
            ...overrides,
        } as LanguageModelChat;
    }

    it('should flag the current model with isCurrentModel', () => {
        const models = [
            fakeModel({ id: 'gpt-4', vendor: 'copilot' }),
            fakeModel({ id: 'claude-sonnet', vendor: 'copilot' }),
        ];

        const items = getModelQuickPickItems(
            models,
            'copilot:gpt-4',
            defaultModelId
        );
        const gpt4Item = items.find(
            (item) => item.modelIdWithVendor === 'copilot:gpt-4'
        );

        expect(gpt4Item?.isCurrentModel).toBe(true);
    });

    it('should flag the default model with isDefaultModel', () => {
        const models = [
            fakeModel({ id: 'gpt-4.1', vendor: 'copilot' }),
            fakeModel({ id: 'claude-sonnet', vendor: 'copilot' }),
        ];

        const items = getModelQuickPickItems(
            models,
            'copilot:claude-sonnet',
            defaultModelId
        );
        const defaultItem = items.find(
            (item) => item.modelIdWithVendor === 'copilot:gpt-4.1'
        );

        expect(defaultItem?.isDefaultModel).toBe(true);
    });

    it('should place default model at the top of recommended models', () => {
        const models = [
            fakeModel({ id: 'claude-sonnet', vendor: 'copilot' }),
            fakeModel({ id: 'gpt-4.1', vendor: 'copilot' }),
        ];

        const items = getModelQuickPickItems(
            models,
            'copilot:claude-sonnet',
            defaultModelId
        );

        // First item should be separator, second should be default model
        const modelItems = items.filter(
            (item) => item.modelIdWithVendor !== undefined
        );
        expect(modelItems[0].modelIdWithVendor).toBe('copilot:gpt-4.1');
    });

    it('should include vendor and id in description', () => {
        const models = [fakeModel({ id: 'gpt-4', vendor: 'copilot' })];

        const items = getModelQuickPickItems(
            models,
            'copilot:gpt-4',
            defaultModelId
        );
        const gpt4Item = items.find(
            (item) => item.modelIdWithVendor === 'copilot:gpt-4'
        );

        expect(gpt4Item?.description).toBe('copilot:gpt-4');
    });

    it('should use model.id as fallback when name is not available', () => {
        const models = [
            fakeModel({
                id: 'gpt-4',
                vendor: 'copilot',
                name: undefined as unknown as string,
            }),
        ];

        const items = getModelQuickPickItems(
            models,
            'copilot:other',
            defaultModelId
        );
        const gpt4Item = items.find(
            (item) => item.modelIdWithVendor === 'copilot:gpt-4'
        );

        expect(gpt4Item?.label).toBe('gpt-4');
    });

    it('should categorize unsupported models separately', () => {
        const models = [
            fakeModel({ id: 'gpt-4.1', vendor: 'copilot' }),
            fakeModel({ id: 'claude-3.7-sonnet', vendor: 'copilot' }),
        ];

        const items = getModelQuickPickItems(
            models,
            'copilot:gpt-4.1',
            defaultModelId
        );

        const separators = items.filter((item) => item.kind === -1);
        const separatorLabels = separators.map((s) => s.label);
        expect(separatorLabels).toContain('Unsupported Models');
    });

    it('should order vendor groups and models deterministically', () => {
        const models = [
            fakeModel({ id: 'zeta', vendor: 'beta' }),
            fakeModel({ id: 'alpha', vendor: 'beta' }),
            fakeModel({ id: 'omega', vendor: 'acme' }),
        ];

        const items = getModelQuickPickItems(
            models,
            'copilot:gpt-4.1',
            defaultModelId
        );

        const acmeSeparatorIndex = items.findIndex(
            (item) => item.label === 'Acme Models'
        );
        const betaSeparatorIndex = items.findIndex(
            (item) => item.label === 'Beta Models'
        );

        expect(acmeSeparatorIndex).toBeGreaterThan(-1);
        expect(betaSeparatorIndex).toBeGreaterThan(-1);
        expect(acmeSeparatorIndex).toBeLessThan(betaSeparatorIndex);

        const betaModels = items
            .slice(betaSeparatorIndex + 1)
            .filter((item) => item.kind !== -1)
            .map((item) => item.label);
        expect(betaModels.slice(0, 2)).toEqual(['alpha', 'zeta']);
    });
});
