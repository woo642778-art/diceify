import type { CanonicalGameData } from "../game-data/types";

export type ContributionKindV55 = "data-correction" | "ranking-snapshot" | "patch-note";

export interface CommunityContributionInputV55 {
  kind: ContributionKindV55;
  sourceUrl: string;
  observedOn: string;
  note: string;
}

export function createCommunityContributionV55(data: CanonicalGameData, input: CommunityContributionInputV55) {
  return {
    schema: "dicetree-community-contribution/v1",
    createdAt: new Date().toISOString(),
    dataset: {
      clientVersion: data.manifest.clientVersion,
      extractedAt: data.manifest.extractedAt,
      sourceSha256: data.manifest.sourceSha256,
    },
    contribution: {
      ...input,
      sourceUrl: input.sourceUrl.trim(),
      note: input.note.trim(),
    },
    reviewStatus: "pending-community-review",
  };
}

export function communityIssueUrlV55(input: CommunityContributionInputV55): string {
  const type = input.kind === "data-correction" ? "data correction" : input.kind === "ranking-snapshot" ? "ranking snapshot" : "patch note";
  const body = [
    "## diceify community data submission",
    `- Type: ${type}`,
    `- Observed on: ${input.observedOn || "not provided"}`,
    `- Source: ${input.sourceUrl.trim() || "not provided"}`,
    "",
    "## What should be reviewed?",
    input.note.trim() || "Describe the observed difference and attach screenshots if available.",
    "",
    "This report is community evidence and must be independently verified before it changes canonical calculation data.",
  ].join("\n");
  return `https://github.com/woo642778-art/diceify/issues/new?title=${encodeURIComponent(`[Data] ${type}`)}&body=${encodeURIComponent(body)}`;
}
