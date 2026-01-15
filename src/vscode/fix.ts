import * as vscode from 'vscode';

import { getConfig, toUri } from './config';

export type FixCommentArgs = {
    file: string;
    line: number; //1-indexed
    comment: string;
};

export async function fixComment(arg: FixCommentArgs) {
    if (
        !(
            arg &&
            typeof arg === 'object' &&
            'file' in arg &&
            'line' in arg &&
            'comment' in arg
        )
    ) {
        vscode.window.showErrorMessage(
            `Invalid arguments provided to lgtm.fixComment command.`
        );
        return;
    }

    const { file, line, comment } = arg;

    // Input validation
    if (typeof file !== 'string' || file.trim() === '') {
        vscode.window.showErrorMessage('Invalid file path provided.');
        return;
    }
    if (!Number.isInteger(line) || line <= 0) {
        vscode.window.showErrorMessage(
            'Line number must be a positive integer.'
        );
        return;
    }

    const config = await getConfig();
    try {
        // Open the document
        const uri = toUri(config, file);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);

        // Position cursor at the issue (line numbers are 1-indexed in comments, 0-indexed in VS Code)
        const position = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(position, position);

        // Reveal the line in the center of the editor
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
        );

        // Open inline chat with the comment as context
        await vscode.commands.executeCommand('inlineChat.start', {
            message: `Fix: ${comment}`,
            autoSend: true,
        });
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
            `Failed to open inline chat: ${errorMessage}`
        );
    }
}
