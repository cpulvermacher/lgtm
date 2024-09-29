export type ReviewRequest =
    | {
          commit: string;
          isTargetCheckedOut: boolean;
      }
    | {
          targetBranch: string;
          baseBranch: string;
          isTargetCheckedOut: boolean;
      };
