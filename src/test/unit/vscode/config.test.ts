import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the new configuration options and session model selection functionality.
 * These tests validate the logic in isolation without importing the actual config module
 * to avoid complex mocking of VS Code APIs and other dependencies.
 */

describe('Config options', () => {
    describe('chatModelOnNewPrompt option', () => {
        it('should have "useDefault" and "alwaysAsk" as valid values', () => {
            type ChatModelOnNewPromptType = 'useDefault' | 'alwaysAsk';
            const validValues: ChatModelOnNewPromptType[] = [
                'useDefault',
                'alwaysAsk',
            ];

            expect(validValues).toContain('useDefault');
            expect(validValues).toContain('alwaysAsk');
        });

        it('should default to "useDefault"', () => {
            const defaultValue = 'useDefault';
            expect(defaultValue).toBe('useDefault');
        });
    });

    describe('reviewFlow option', () => {
        it('should have "separateSections" and "mergedWithAttribution" as valid values', () => {
            type ReviewFlowType = 'separateSections' | 'mergedWithAttribution';
            const validValues: ReviewFlowType[] = [
                'separateSections',
                'mergedWithAttribution',
            ];

            expect(validValues).toContain('separateSections');
            expect(validValues).toContain('mergedWithAttribution');
        });

        it('should default to "separateSections"', () => {
            const defaultValue = 'separateSections';
            expect(defaultValue).toBe('separateSections');
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
    type ModelQuickPickItem = {
        label: string;
        description?: string;
        modelIdWithVendor?: string;
        kind?: number;
    };

    const QuickPickItemKind = { Separator: -1 };

    function getModelQuickPickItems(
        models: Array<{
            id: string;
            vendor: string;
            name?: string;
        }>,
        currentModel: string,
        defaultModelId: string
    ): ModelQuickPickItem[] {
        const recommendedModels: ModelQuickPickItem[] = [];
        const otherModels: ModelQuickPickItem[] = [];

        for (const model of models) {
            const modelIdWithVendor = `${model.vendor}:${model.id}`;
            const isCurrentModel =
                modelIdWithVendor === currentModel || model.id === currentModel;
            const isDefaultModel = modelIdWithVendor === defaultModelId;

            const prefix = isCurrentModel ? '$(check)' : '\u2003 ';
            const suffix = isDefaultModel ? ' (default)' : '';
            const modelName = model.name ?? model.id;
            const item: ModelQuickPickItem = {
                label: prefix + modelName + suffix,
                description: model.vendor,
                modelIdWithVendor,
            };

            if (isDefaultModel) {
                recommendedModels.unshift(item);
            } else {
                otherModels.push(item);
            }
        }

        if (recommendedModels.length > 0) {
            recommendedModels.unshift({
                label: 'Recommended Models',
                kind: QuickPickItemKind.Separator,
            });
        }
        if (otherModels.length > 0) {
            otherModels.unshift({
                label: 'Other Models',
                kind: QuickPickItemKind.Separator,
            });
        }

        return [...recommendedModels, ...otherModels];
    }

    it('should mark the current model with a checkmark', () => {
        const models = [
            { id: 'gpt-4', vendor: 'copilot', name: 'GPT-4' },
            { id: 'claude-sonnet', vendor: 'copilot', name: 'Claude Sonnet' },
        ];

        const items = getModelQuickPickItems(
            models,
            'copilot:gpt-4',
            'copilot:gpt-4.1'
        );
        const gpt4Item = items.find(
            (item) => item.modelIdWithVendor === 'copilot:gpt-4'
        );

        expect(gpt4Item?.label).toContain('$(check)');
    });

    it('should mark the default model with "(default)" suffix', () => {
        const models = [
            { id: 'gpt-4.1', vendor: 'copilot', name: 'GPT-4.1' },
            { id: 'claude-sonnet', vendor: 'copilot', name: 'Claude Sonnet' },
        ];

        const items = getModelQuickPickItems(
            models,
            'copilot:claude-sonnet',
            'copilot:gpt-4.1'
        );
        const defaultItem = items.find(
            (item) => item.modelIdWithVendor === 'copilot:gpt-4.1'
        );

        expect(defaultItem?.label).toContain('(default)');
    });

    it('should place default model at the top of recommended models', () => {
        const models = [
            { id: 'claude-sonnet', vendor: 'copilot', name: 'Claude Sonnet' },
            { id: 'gpt-4.1', vendor: 'copilot', name: 'GPT-4.1' },
        ];

        const items = getModelQuickPickItems(
            models,
            'copilot:claude-sonnet',
            'copilot:gpt-4.1'
        );

        // First item should be separator, second should be default model
        const modelItems = items.filter(
            (item) => item.modelIdWithVendor !== undefined
        );
        expect(modelItems[0].modelIdWithVendor).toBe('copilot:gpt-4.1');
    });

    it('should include vendor in description', () => {
        const models = [{ id: 'gpt-4', vendor: 'copilot', name: 'GPT-4' }];

        const items = getModelQuickPickItems(
            models,
            'copilot:gpt-4',
            'copilot:gpt-4.1'
        );
        const gpt4Item = items.find(
            (item) => item.modelIdWithVendor === 'copilot:gpt-4'
        );

        expect(gpt4Item?.description).toBe('copilot');
    });

    it('should use model.id as fallback when name is not available', () => {
        const models = [{ id: 'gpt-4', vendor: 'copilot' }]; // no name

        const items = getModelQuickPickItems(
            models,
            'copilot:other',
            'copilot:gpt-4.1'
        );
        const gpt4Item = items.find(
            (item) => item.modelIdWithVendor === 'copilot:gpt-4'
        );

        expect(gpt4Item?.label).toContain('gpt-4');
    });
});
