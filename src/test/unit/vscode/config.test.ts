import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LanguageModelChat } from 'vscode';

import { getConfig } from '@/vscode/config';
import { getModelQuickPickItems } from '@/vscode/model';

vi.stubGlobal('__GIT_VERSION__', undefined);

const vscodeMocks = vi.hoisted(() => ({
    showQuickPick: vi.fn(),
    showWorkspaceFolderPick: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    selectChatModels: vi.fn(),
    executeCommand: vi.fn(),
    getConfiguration: vi.fn(),
    onDidChangeConfiguration: vi.fn(),
}));

const gitMocks = vi.hoisted(() => ({
    createGit: vi.fn(),
}));

vi.mock('vscode', () => ({
    QuickPickItemKind: { Separator: -1 },
    ConfigurationTarget: { Global: 1 },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
        getConfiguration: vscodeMocks.getConfiguration,
        onDidChangeConfiguration: vscodeMocks.onDidChangeConfiguration,
    },
    window: {
        showQuickPick: vscodeMocks.showQuickPick,
        showWorkspaceFolderPick: vscodeMocks.showWorkspaceFolderPick,
        showWarningMessage: vscodeMocks.showWarningMessage,
        showErrorMessage: vscodeMocks.showErrorMessage,
    },
    lm: {
        selectChatModels: vscodeMocks.selectChatModels,
    },
    commands: {
        executeCommand: vscodeMocks.executeCommand,
    },
}));

vi.mock('@/utils/git', () => ({
    createGit: gitMocks.createGit,
}));

function findPackageJsonPath(startDirectory: string): string {
    let directory = startDirectory;

    while (true) {
        const candidate = join(directory, 'package.json');
        if (existsSync(candidate)) {
            return candidate;
        }

        const parent = dirname(directory);
        if (parent === directory) {
            throw new Error('Could not find package.json');
        }

        directory = parent;
    }
}

describe('findPackageJsonPath', () => {
    it('should find package.json in a parent directory', () => {
        const tempRoot = mkdtempSync(join(tmpdir(), 'lgtm-config-test-'));
        const nested = join(tempRoot, 'a', 'b', 'c');

        try {
            mkdirSync(nested, { recursive: true });
            writeFileSync(join(tempRoot, 'package.json'), '{}', 'utf-8');

            expect(findPackageJsonPath(nested)).toBe(
                join(tempRoot, 'package.json')
            );
        } finally {
            rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    it('should throw when package.json cannot be found up to filesystem root', () => {
        if (existsSync('/package.json')) {
            expect(findPackageJsonPath('/')).toBe('/package.json');
            return;
        }

        expect(() => findPackageJsonPath('/')).toThrow(
            'Could not find package.json'
        );
    });
});

/**
 * Tests for the new configuration options and session model selection functionality.
 */

describe('Config options', () => {
    let properties: Record<
        string,
        {
            enum?: string[];
            default?: string;
        }
    >;

    beforeAll(() => {
        const testDirectory = dirname(fileURLToPath(import.meta.url));
        const packageJsonPath = findPackageJsonPath(testDirectory);
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        properties = packageJson.contributes?.configuration?.properties ?? {};
    });

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
    function fakeSelectableModel(
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

    beforeEach(() => {
        vscodeMocks.showQuickPick.mockReset();
        vscodeMocks.selectChatModels.mockReset();
        vscodeMocks.showWarningMessage.mockReset();
        vscodeMocks.getConfiguration.mockReset();
        vscodeMocks.getConfiguration.mockReturnValue({
            get: <T>(_key: string, fallback?: T) => fallback,
            update: vi.fn(),
        });
        vscodeMocks.onDidChangeConfiguration.mockReturnValue({
            dispose: vi.fn(),
        });
        gitMocks.createGit.mockResolvedValue({
            getGitRoot: () => '/workspace',
        });
    });

    describe('promptForSessionModel', () => {
        it('should return true when models are selected', async () => {
            const config = await getConfig({ refreshWorkspace: true });

            vscodeMocks.selectChatModels.mockResolvedValue([
                fakeSelectableModel({ id: 'gpt-4', vendor: 'copilot' }),
            ]);
            vscodeMocks.showQuickPick.mockImplementation(async (items) =>
                items.filter(
                    (item: { modelIdWithVendor?: string }) =>
                        item.modelIdWithVendor === 'copilot:gpt-4'
                )
            );

            const result = await config.promptForSessionModel();
            expect(result).toBe(true);
        });

        it('should return false when selection is cancelled', async () => {
            const config = await getConfig({ refreshWorkspace: true });

            vscodeMocks.selectChatModels.mockResolvedValue([
                fakeSelectableModel({ id: 'gpt-4', vendor: 'copilot' }),
            ]);
            vscodeMocks.showQuickPick.mockResolvedValue(undefined);

            const result = await config.promptForSessionModel();
            expect(result).toBe(false);
        });

        it('should return false when no models are selected', async () => {
            const config = await getConfig({ refreshWorkspace: true });

            vscodeMocks.selectChatModels.mockResolvedValue([
                fakeSelectableModel({ id: 'gpt-4', vendor: 'copilot' }),
            ]);
            vscodeMocks.showQuickPick.mockResolvedValue([]);

            const result = await config.promptForSessionModel();
            expect(result).toBe(false);
        });

        it('should filter out separator items from selection', async () => {
            const config = await getConfig({ refreshWorkspace: true });

            vscodeMocks.selectChatModels.mockResolvedValue([
                fakeSelectableModel({ id: 'gpt-4', vendor: 'copilot' }),
                fakeSelectableModel({
                    id: 'claude-3.7-sonnet',
                    vendor: 'copilot',
                }),
            ]);
            vscodeMocks.showQuickPick.mockImplementation(async (items) => {
                const separator = items.find(
                    (item: { kind?: number }) => item.kind === -1
                );
                const model = items.find(
                    (item: { modelIdWithVendor?: string }) =>
                        item.modelIdWithVendor === 'copilot:gpt-4'
                );
                return [separator, model].filter(Boolean);
            });

            const selectedModelIds = await config.promptForSessionModelIds();
            expect(selectedModelIds).toEqual(['copilot:gpt-4']);
        });

        it('should allow selecting multiple models', async () => {
            const config = await getConfig({ refreshWorkspace: true });

            vscodeMocks.selectChatModels.mockResolvedValue([
                fakeSelectableModel({ id: 'gpt-4', vendor: 'copilot' }),
                fakeSelectableModel({ id: 'claude-sonnet', vendor: 'copilot' }),
                fakeSelectableModel({ id: 'gemini-pro', vendor: 'copilot' }),
            ]);
            vscodeMocks.showQuickPick.mockImplementation(async (items) =>
                items.filter((item: { modelIdWithVendor?: string }) =>
                    [
                        'copilot:gpt-4',
                        'copilot:claude-sonnet',
                        'copilot:gemini-pro',
                    ].includes(item.modelIdWithVendor ?? '')
                )
            );

            const result = await config.promptForSessionModel();
            expect(result).toBe(true);
        });
    });
});

describe('Model quick pick items', () => {
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

    it('should include vendor and id in description', () => {
        const models = [fakeModel({ id: 'gpt-4', vendor: 'copilot' })];

        const items = getModelQuickPickItems(models);
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

        const items = getModelQuickPickItems(models);
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

        const items = getModelQuickPickItems(models);

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

        const items = getModelQuickPickItems(models);

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
        expect(betaModels).toEqual(['alpha', 'zeta']);
    });
});
