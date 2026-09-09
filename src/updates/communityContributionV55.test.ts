import { describe, expect, it } from "vitest";
import { createCommunityContributionV55, communityIssueUrlV55 } from "./communityContributionV55";

const data = { manifest: { clientVersion: "1.0.1", extractedAt: "2026-08-16T00:00:00Z", sourceSha256: "hash" } } as never;

describe("community contribution V55", () => {
  it("keeps the submitted observation separate from canonical data", () => {
    const contribution = createCommunityContributionV55(data, { kind: "data-correction", sourceUrl: "https://example.com", observedOn: "2026-08-23", note: "Different cost" });
    expect(contribution.reviewStatus).toBe("pending-community-review");
    expect(contribution.dataset.clientVersion).toBe("1.0.1");
    expect(communityIssueUrlV55(contribution.contribution)).toContain("github.com/woo642778-art/diceify/issues/new");
  });
});
