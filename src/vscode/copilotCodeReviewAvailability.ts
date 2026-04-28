import * as vscode from 'vscode';

export function isCopilotCodeReviewAvailable(): boolean {
    const extension = vscode.extensions.getExtension('GitHub.copilot-chat');

    if (!extension) {
        return false;
    }

    return vscode.workspace
        .getConfiguration('github.copilot.chat')
        .get<boolean>('reviewAgent.enabled', true);
}
