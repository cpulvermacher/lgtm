import {
    CancellationTokenSource,
    type CancellationToken,
    type Disposable,
} from 'vscode';

/** A wrapper for vscode.CancellationToken that merges tokens from multiple sources
 *
 * If any of the added tokens is cancelled, this token will be cancelled as well.
 * Note that this does not work the other way around: cancelling this token will not cancel the added tokens.
 */
export class MergedCancellationToken implements CancellationToken, Disposable {
    private cancellationTokens: CancellationToken[] = [];
    private tokenSource = new CancellationTokenSource();

    /**
     * Adds a token to the list of tokens to be merged
     * @param token The token to add
     */
    add(token: CancellationToken) {
        this.cancellationTokens.push(token);
        token.onCancellationRequested(() => {
            this.tokenSource.cancel();
        });
    }
    /**
     * Returns true if any token has been cancelled
     */
    get isCancellationRequested() {
        return (
            this.tokenSource.token.isCancellationRequested ||
            this.cancellationTokens.some(
                (token) => token.isCancellationRequested
            )
        );
    }

    /**
     * An event that fires when any token is cancelled
     */
    get onCancellationRequested() {
        return this.tokenSource.token.onCancellationRequested;
    }

    dispose() {
        this.tokenSource.dispose();
    }
}
