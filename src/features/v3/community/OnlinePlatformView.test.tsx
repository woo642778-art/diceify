import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityRecommendations, RewardsPanel } from "./OnlinePlatformView";

const platformMocks = vi.hoisted(() => ({
  get: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("../../../platform/api", () => ({
  isPlatformConfigured: () => true,
  platformGet: platformMocks.get,
  platformMutate: platformMocks.mutate,
  platformUrl: (path: string) => path,
  platformWebSocketUrl: (path: string) => path,
  PlatformApiError: class PlatformApiError extends Error {
    constructor(public readonly status: number, public readonly code: string) { super(code); }
  },
}));

afterEach(cleanup);

beforeEach(() => {
  platformMocks.get.mockReset();
  platformMocks.mutate.mockReset();
});

describe("online community workflows", () => {
  it("applies only a published five-dice community aggregate to the analyzer", () => {
    const onApply = vi.fn();
    render(<CommunityRecommendations
      locale="ko"
      segment="coop"
      status="ready"
      decks={[{
        deck_fingerprint: "verified-deck",
        sample_count: 31,
        weighted_count: 30.5,
        window_start: "2026-06-01T00:00:00.000Z",
        window_end: "2026-09-01T00:00:00.000Z",
        deck_json: JSON.stringify(["predator", "growth", "switch", "snowball", "atom"]),
        community: { eligible: true, score: 0.72, confidence: "low" },
      }]}
      onSegment={vi.fn()}
      onApply={onApply}
    />);
    expect(screen.getByText("31개 계정")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "내 덱 분석기에 적용" }));
    expect(onApply).toHaveBeenCalledWith(["predator", "growth", "switch", "snowball", "atom"]);
  });

  it("submits the current deck once and redeems through the immutable ledger API", async () => {
    platformMocks.get.mockImplementation((path: string) => {
      if (path === "/api/v1/events/active") return Promise.resolve({ events: [{ id:"event-1",title:"덱 연구",description:"현재 덱 제출",ends_at:"2026-09-20T00:00:00.000Z",reward_points:100 }] });
      if (path === "/api/v1/points/catalog") return Promise.resolve({ items: [{ id:"item-1",name:"프로필 배지",category:"profile",cost:50 }] });
      if (path === "/api/v1/points/ledger") return Promise.resolve({ balance:100,entries:[{ amount:100,reason:"favorite_deck_event",metadata_json:"{}",created_at:"2026-09-06T00:00:00.000Z" }] });
      return Promise.reject(new Error("unexpected_path"));
    });
    platformMocks.mutate.mockResolvedValue({ balance:50 });
    const onPointsChange = vi.fn();
    render(<RewardsPanel
      locale="ko"
      platformConfigured
      me={{ user:{ id:"user-1",displayName:"Tester",avatarUrl:null,role:"user" },profile:{},points:100,csrf:"csrf-token" }}
      deck={["predator", "growth", "switch", "snowball", "atom"]}
      onPointsChange={onPointsChange}
    />);
    await screen.findByText("덱 연구");
    await waitFor(() => expect(screen.getByText("100 P")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "현재 덱 제출" }));
    await waitFor(() => expect(platformMocks.mutate).toHaveBeenCalledWith(
      "/api/v1/events/event-1/submissions",
      expect.objectContaining({ deck:["predator", "growth", "switch", "snowball", "atom"],mode:"coop",dataConsent:true }),
      "csrf-token",
    ));
    await waitFor(() => expect(screen.getByRole("button", { name: "교환" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "교환" }));
    await waitFor(() => expect(platformMocks.mutate).toHaveBeenCalledWith(
      "/api/v1/points/redeem/item-1",
      {},
      "csrf-token",
      "POST",
      expect.objectContaining({ "Idempotency-Key":expect.any(String) }),
    ));
  });
});
