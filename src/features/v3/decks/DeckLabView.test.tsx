import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gameDataV3 } from "../../../game-data/load";
import { DeckLabView } from "./DeckLabView";

afterEach(cleanup);

const baseProps = {
  data: gameDataV3,
  locale: "ko" as const,
  goal: "balanced" as const,
  spendProfile: "free" as const,
  onGoalChange: vi.fn(),
  onSpendProfileChange: vi.fn(),
  onSimulate: vi.fn(),
};

describe("DeckLabView", () => {
  it("shows exact observed compositions without invented live metrics", () => {
    const { container } = render(<DeckLabView {...baseProps} />);
    expect(screen.getByTestId("v4-deck-lab")).toHaveTextContent("2026.08.16");
    expect(screen.getByTestId("v4-deck-lab")).toHaveTextContent("15장 · 1~105위");
    expect(screen.getByText("보존 스냅샷 · 실시간 아님")).toBeInTheDocument();
    expect(screen.getByText(/승률과 사용률은 공식 API로 확인되지 않아 표시하지 않습니다/)).toBeInTheDocument();
    expect(container.querySelectorAll(".d60-observed-decks > button").length).toBeGreaterThan(10);
    expect(container.querySelectorAll(".d60-deck-detail-dice img[data-dice-id]")).toHaveLength(5);
    expect(container).not.toHaveTextContent("차기 메타 후보");
    expect(container).not.toHaveTextContent(/승률\s*\d/);
    expect(container).not.toHaveTextContent(/IPA/i);
  });

  it("changes role and manual comparison profiles explicitly", () => {
    const onGoalChange = vi.fn();
    const onSpendProfileChange = vi.fn();
    render(<DeckLabView {...baseProps} onGoalChange={onGoalChange} onSpendProfileChange={onSpendProfileChange} />);
    fireEvent.change(screen.getByLabelText("플레이 역할"), { target: { value: "support" } });
    fireEvent.change(screen.getByLabelText("비교 성향"), { target: { value: "invested" } });
    expect(onGoalChange).toHaveBeenCalledWith("support");
    expect(onSpendProfileChange).toHaveBeenCalledWith("invested");
  });

  it("applies an observed five-dice composition to the manual analyzer", () => {
    const onActiveDeckChange = vi.fn();
    render(<DeckLabView {...baseProps} onActiveDeckChange={onActiveDeckChange} />);
    fireEvent.click(screen.getByRole("button", { name: "내 덱 분석기에 적용" }));
    expect(onActiveDeckChange).toHaveBeenCalledTimes(1);
    expect(onActiveDeckChange.mock.calls[0][0]).toHaveLength(5);
  });

  it("keeps heuristic scoring inside the clearly labelled manual comparison tool", () => {
    const onSimulate = vi.fn();
    render(<DeckLabView {...baseProps} onSimulate={onSimulate} activeDeckIds={["predator", "brokengrowth", "decay", "switch", "adjust"]} />);
    expect(screen.getByText(/게임 서버의 전적이나 승률이 아닌/)).toBeInTheDocument();
    expect(screen.getByTestId("v47-my-deck-analyzer")).toHaveTextContent("상대 비교용 지표");
    fireEvent.click(screen.getByRole("button", { name: "주 딜러 시뮬레이터에서 열기" }));
    expect(onSimulate).toHaveBeenCalledTimes(1);
  });
});
