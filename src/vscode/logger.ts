import * as vscode from 'vscode';

export class Logger {
    private outputChannel?: vscode.OutputChannel;

    constructor(enableDebug: boolean) {
        if (enableDebug) {
            this.outputChannel = vscode.window.createOutputChannel(
                'LGTM',
                'json'
            );
        }
    }

    debug(message: string, ...optionalParams: unknown[]) {
        if (!this.outputChannel) {
            return;
        }

        console.debug(message, ...optionalParams);
        this.outputChannel.appendLine(
            '[DEBUG] ' + this.createJsonMessage(message, optionalParams)
        );
    }

    info(message: string, ...optionalParams: unknown[]) {
        console.info(message, ...optionalParams);
        if (this.outputChannel) {
            this.outputChannel.appendLine(
                '[INFO] ' + this.createJsonMessage(message, optionalParams)
            );
        }
    }

    private createJsonMessage(
        message: string,
        optionalParams: unknown[]
    ): string {
        if (optionalParams.length > 0) {
            message =
                message +
                ' ' +
                optionalParams.map((p) => JSON.stringify(p)).join(' ');
        }
        return message;
    }
}
