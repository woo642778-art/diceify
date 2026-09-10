export interface LiveGameStatusV62 {
  schemaVersion: 1;
  checkedAt: string;
  officialStore: {
    provider: "Apple App Store";
    version: string;
    releasedAt: string;
    releaseNotes: string[];
    averageRating: number | null;
    ratingCount: number | null;
    url: string;
  };
  publicCrossCheck: {
    provider: "rd2-wiki";
    repository: string;
    commitSha: string;
    committedAt: string;
    commitUrl: string;
    latestChangeDate: string;
    gameVersion: string;
    counts: {
      dice: number;
      treeNodes: number;
      bosses: number;
      tactics: number;
      riftEffects: number;
    };
  };
}

export interface LiveGameStatusStateV62 {
  data: LiveGameStatusV62;
  phase: "snapshot" | "refreshing" | "live" | "error";
  error?: string;
}
