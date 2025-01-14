import * as vscode from 'vscode';

import { Logger } from '../types/Logger';

const outputChannelName = 'LGTM';

/** Logs to vscode output channel */
export class LgtmLogger implements Logger {
    private outputChannel?: vscode.OutputChannel;

    constructor(enableDebug: boolean) {
        this.setEnableDebug(enableDebug);
    }

    /** Log a debug message to the output channel. Does nothing if enableDebug is turned off. */
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

    setEnableDebug(enableDebug: boolean) {
        if (enableDebug && !this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel(
                outputChannelName,
                'json'
            );
        } else if (!enableDebug && this.outputChannel) {
            this.outputChannel.dispose();
            this.outputChannel = undefined;
        }
    }
}
