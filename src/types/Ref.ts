export enum UncommittedRef {
    Staged = 1,
    Unstaged = 2,
}

export type Ref = string | UncommittedRef;
