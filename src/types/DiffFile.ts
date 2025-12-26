export type DiffFile = {
    file: string;
    from?: string; //previous file name (if renamed)
    status: string; // see --diff-filter in git-diff(1). Interesting for us: D (deleted), R (renamed)
};
