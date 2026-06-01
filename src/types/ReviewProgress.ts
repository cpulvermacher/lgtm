/**
 * Progress update shared by review surfaces.
 *
 * `message` is optional because notification-style surfaces may need to report
 * numeric progress without repeating text. `increment` follows VS Code progress
 * increments; surfaces that only render text may ignore it.
 */
export type ReviewProgressValue = {
    message?: string;
    increment?: number;
};

/** Minimal progress reporter shape used outside VS Code-specific modules. */
export type ReviewProgress = {
    report: (value: ReviewProgressValue) => void;
};
