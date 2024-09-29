export type ReviewRequest =
    | {
          commit: string;
          isTargetCheckedOut: boolean;
      }
    | {
          target: string;
          base: string;
          isTargetCheckedOut: boolean;
      };
