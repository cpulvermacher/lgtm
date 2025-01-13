import assert from 'assert';
import * as vscode from 'vscode';

suite('Extension ', () => {
    test('activates', async () => {
        console.log(`Installing copilot chat...`);
        await vscode.commands.executeCommand(
            'workbench.extensions.installExtension',
            'github.copilot-chat'
        );
        console.log(`github.copilot-chat installed successfully.`);

        const extension =
            vscode.extensions.getExtension<unknown>('cpulvermacher.lgtm');
        if (!extension) {
            throw new Error('Extension not found');
        }

        console.log(`Activating extension...`);
        const publicApi = await extension.activate();

        assert.strictEqual(publicApi, undefined);
    });
});
