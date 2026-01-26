import * as vscode from 'vscode';

import type { Config } from '@/types/Config';

/** Converts file path relative to gitRoot to a vscode.Uri */
export function toUri(
    config: Config,
    file: string,
    lineNo?: number
): vscode.Uri {
    const uri = vscode.Uri.file(`${config.gitRoot}/${file}`);
    if (lineNo) {
        // 1-based line number
        return uri.with({ fragment: `L${lineNo}` });
    }

    return uri;
}

/** returns a VSCode command link string for given command and args */
export function toCommandLink(command: string, args: unknown): string {
    // needs both URL encoding and escaping for markdown link
    const encodedArgs = encodeURIComponent(JSON.stringify(args))
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');
    return `command:${command}?${encodedArgs}`;
}
