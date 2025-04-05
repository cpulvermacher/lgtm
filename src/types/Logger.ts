export interface Logger {
    debug(message: string, ...optionalParams: unknown[]): void;
    info(message: string, ...optionalParams: unknown[]): void;
    setEnableDebug(enableDebug: boolean): void;
    isDebugEnabled(): boolean;
}
