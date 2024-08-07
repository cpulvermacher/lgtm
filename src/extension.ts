import * as vscode from 'vscode';

import { getConfig, toUri } from './config';
import { getReviewComment } from './review';

let chatParticipant: vscode.ChatParticipant;

// called the first time a command is executed
export function activate() {
    chatParticipant = vscode.chat.createChatParticipant('ai-reviewer', handler);
}

export function deactivate() {
    if (chatParticipant) {
        chatParticipant.dispose();
    }
}

type FileReview = {
    target: string; // target file
    comment: string; // review comment
    severity: number; // in 0..5
};

async function handler(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    cancellationToken: vscode.CancellationToken
): Promise<void> {
    console.debug('Received request:', request, 'with context:', context);

    const config = await getConfig();

    if (request.command === 'review') {
        const model = await getModel();

        const branches = await config.git.branch();
        const branchNames = branches.all;
        //select via quick input
        const targetBranch = await vscode.window.showQuickPick(branchNames, {
            title: 'Select a branch to review (1/2)',
        });
        const baseBranch = await vscode.window.showQuickPick(branchNames, {
            title: 'Select a base branch (2/2)',
        });

        const diffRevisionRange = `${baseBranch}..${targetBranch}`;

        stream.markdown(`Reviewing ${diffRevisionRange}.\n`);
        //get list of files in the commit
        const fileString = await config.git.diff([
            '--name-only',
            diffRevisionRange,
        ]);
        const files = fileString.split('\n').filter((f) => f.length > 0);

        stream.markdown(`Found ${files.length} files.\n\n`);

        const reviewComments: FileReview[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (cancellationToken.isCancellationRequested) {
                return;
            }

            stream.progress(
                `Reviewing file ${file} (${i + 1}/${files.length})`
            );

            const diff = await config.git.diff([
                '--no-prefix',
                diffRevisionRange,
                '--',
                file,
            ]);

            if (diff.length === 0) {
                console.debug('No changes in file:', file);
                continue;
            }

            const { comment, severity } = await getReviewComment(
                model,
                diff,
                cancellationToken
            );

            reviewComments.push({
                target: file,
                comment,
                severity,
            });
        }

        //sort by descending severity
        reviewComments.sort((a, b) => b.severity - a.severity);

        for (const review of reviewComments) {
            if (review.severity === 0) {
                continue;
            }

            stream.anchor(toUri(config, review.target), review.target);
            stream.markdown('\n' + review.comment);
            stream.markdown('\n\n');
        }
    }
}

async function getModel(): Promise<vscode.LanguageModelChat> {
    // 3.5 is not enough for reasonable responses
    // 4 untested
    // 4o seems to yield fair results?
    const models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
    console.debug('Found models:', models);

    if (models.length === 0) {
        throw new Error('No models found');
    }

    const model = models[0];
    console.debug(
        'Selected model:',
        model.name,
        ' with #tokens:',
        model.maxInputTokens
    );
    return model;
}
