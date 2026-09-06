import { describe, expect, it } from "vitest";
import { moderateDeterministically, normalizeMessage } from "../src/domain/moderation";

const base = {
  recentNormalizedBodies: [] as string[],
  messagesIn5Seconds: 1,
  messagesIn30Seconds: 1,
  mentions: 0,
  links: 0,
  priorLevel: 0,
};

describe("deterministic chat moderation", () => {
  it("normalizes cosmetic spam characters consistently", () => {
    expect(normalizeMessage("  안녕!!! ㅋㅋ ")).toBe("안녕");
  });

  it("allows an ordinary deck question", () => {
    expect(moderateDeterministically({ ...base, body: "포식 덱에서 성장 주사위 대신 뭘 쓰나요?" })).toMatchObject({
      decision: "allow",
      triggers: [],
    });
  });

  it("separates targeted harassment from an untargeted exclamation", () => {
    expect(moderateDeterministically({ ...base, body: "아 미쳤다 드디어 깼다" }).triggers).not.toContain("targeted_harassment");
    expect(moderateDeterministically({ ...base, body: "넌 그냥 꺼져 병신아" })).toMatchObject({
      decision: "review",
      triggers: ["targeted_harassment"],
    });
  });

  it("mutes combined burst and duplicate spam", () => {
    const result = moderateDeterministically({
      ...base,
      body: "도배",
      recentNormalizedBodies: ["도배", "도배", "도배"],
      messagesIn5Seconds: 6,
      messagesIn30Seconds: 13,
    });
    expect(result.decision).toBe("mute");
    expect(result.triggers).toEqual(expect.arrayContaining(["burst_5s", "burst_30s", "near_duplicate"]));
  });
});
