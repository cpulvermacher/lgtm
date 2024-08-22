export type ReviewRequest =
    | { commit: string }
    | { targetBranch: string; baseBranch: string };
