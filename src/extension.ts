import * as vscode from 'vscode';

import { UncommittedRef } from '@/types/Ref';
import { getConfig } from '@/vscode/config';
import { ReviewTool } from '@/vscode/ReviewTool';
import {
    parsePullRequest,
    RemoteBranchNotFound,
    UnsupportedModelError,
} from './utils/parsePullRequest';
import { registerChatParticipant } from './vscode/chat';
import { fixComment } from './vscode/fix';
import { getModelQuickPickItems } from './vscode/model';
import { promptToFetchRemotes } from './vscode/ui';

// called the first time a command is executed
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(registerChatParticipant(context));

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'lgtm.selectChatModel',
            handleSelectChatModel
        ),
        vscode.commands.registerCommand(
            'lgtm.startCodeReview',
            startCodeReviewCommand
        ),
        vscode.commands.registerCommand(
            'lgtm.reviewStagedChanges',
            reviewStagedChangesCommand
        ),
        vscode.commands.registerCommand(
            'lgtm.reviewUnstagedChanges',
            reviewUnstagedChangesCommand
        ),
        vscode.commands.registerCommand(
            'lgtm.reviewPullRequest',
            reviewPullRequestCommand
        ),
        vscode.commands.registerCommand('lgtm.fixComment', fixComment)
    );

    context.subscriptions.push(
        vscode.lm.registerTool('review', new ReviewTool()),
        vscode.lm.registerTool(
            'reviewStaged',
            new ReviewTool({ defaultTarget: UncommittedRef.Staged })
        ),
        vscode.lm.registerTool(
            'reviewUnstaged',
            new ReviewTool({ defaultTarget: UncommittedRef.Unstaged })
        )
    );
}

async function startCodeReviewCommand() {
    await startReviewChat();
}
async function reviewStagedChangesCommand() {
    await startReviewChat('staged');
}
async function reviewUnstagedChangesCommand() {
    await startReviewChat('unstaged');
}
async function reviewPullRequestCommand(model: unknown) {
    const config = await getConfig({ refreshWorkspace: true });

    let pullRequest;
    try {
        pullRequest = await parsePullRequest(config, model);
    } catch (error) {
        if (error instanceof UnsupportedModelError) {
            await vscode.window.showInformationMessage(
                'Click "Review Pull Request" on a pull request to start a review.'
            );
        } else if (error instanceof RemoteBranchNotFound) {
            const action = await promptToFetchRemotes(error.message);
            if (action === 'fetch') {
                await reviewPullRequestCommand(model);
            }
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            await vscode.window.showErrorMessage(msg);
        }

        return;
    }
    const { target, base } = pullRequest;
    await startReviewChat(target, base);
}

async function startReviewChat(target: string = '', base: string = '') {
    // if chat view is not focused, the command sometimes fizzles without doing anything, so focus it first before sending the command.
    await vscode.commands.executeCommand(
        'workbench.panel.chat.view.copilot.focus'
    );

    // wait for chat to initialize...
    const delayMs = 200;
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    const query = `@lgtm /review ${target} ${base}`.trim();

    await vscode.commands.executeCommand('workbench.action.chat.open', {
        query,
        // set `isPartialQuery: true` to not send directly
    });
}

async function handleSelectChatModel() {
    const models = await vscode.lm.selectChatModels();
    if (!models || models.length === 0) {
        vscode.window.showWarningMessage('No chat models available.');
        return;
    }

    const config = await getConfig();
    const currentModelId = config.getOptions().chatModel;
    const quickPickItems = getModelQuickPickItems(models).map((item) => {
        if (item.kind === vscode.QuickPickItemKind.Separator) return item;

        const isCurrentModel =
            item.modelIdWithVendor === currentModelId ||
            item.id === currentModelId;
        const prefix = isCurrentModel ? '$(check)' : '\u2003 ';
        return {
            ...item,
            label: prefix + item.label,
        };
    });
    const selectedQuickPickItem = await vscode.window.showQuickPick(
        quickPickItems,
        { placeHolder: 'Select a chat model for LGTM reviews' }
    );
    if (selectedQuickPickItem?.modelIdWithVendor) {
        await config.setOption(
            'chatModel',
            selectedQuickPickItem.modelIdWithVendor
        );
        vscode.window.showInformationMessage(
            `LGTM chat model set to: ${selectedQuickPickItem.name}`
        );
    }
}
