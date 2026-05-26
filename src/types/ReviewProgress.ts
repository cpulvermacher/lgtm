export type ReviewProgressValue = {
    message?: string;
    increment?: number;
};

export type ReviewProgress = {
    report: (value: ReviewProgressValue) => void;
};
