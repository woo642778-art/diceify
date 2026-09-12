import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gameDataV3 } from "../../../game-data/load";
import { analysisRevisionIdV65 } from "../../../intelligence/analysisState";
import type { IntelligenceRequestV63, IntelligenceResultV63 } from "../../../intelligence/types";
import { AIIntelligenceWorkspace } from "./AIIntelligenceWorkspace";

const { runOptimizer, streamHosted, parseHosted } = vi.hoisted(() => ({ runOptimizer: vi.fn(), streamHosted: vi.fn(), parseHosted: vi.fn() }));

function resultFor(request: IntelligenceRequestV63) {
  return {
  schemaVersion: 1, dataVersion: request.dataVersion, calculatedAt: "2026-09-11T00:00:00Z", goal: request.goal,
  primary: null, alternatives: [], paretoFront: [], overlay: {},
  breakpoint: { affordableNow: false, nextCost: { gold: 1_000, stone: 1 }, shortage: { gold: 0, stone: 1, solarCore: 0 }, decision: "save" },
  search: { algorithm: "exact-dfs-pareto", complete: true, horizon: request.maxPurchases, candidateNodeRanks: 1, visitedStates: 1, deduplicatedStates: 0, prunedDominated: 0, elapsedMs: 1, scope: "test" },
  limitations: [],
  } satisfies IntelligenceResultV63;
}

function packetFor(request: IntelligenceRequestV63) {
  return {
    result: resultFor(request),
    support: {
      revisionId: analysisRevisionIdV65(request),
      breakpoints: [{ resource: "stone" as const, amount: 1, routeId: null, routeNodeIds: [], triggerNodeId: "", routeCost: null, routeRemaining: null, routeScore: null }],
      eventSearch: { tested: 1, complete: true },
      stability: { level: "high" as const, scoreGap: null, nearEquivalentAlternatives: 0, upwardChange: null, downwardChange: {}, reasons: ["stable"] },
      evidenceConfidence: { level: "high" as const, reasons: ["verified"], metaUsedInScore: false as const, metaSnapshot: null },
      bottlenecks: [], contributions: [],
      saveVsSpend: { verdict: "save" as const, reason: "test" },
    },
  };
}

vi.mock("../../../intelligence/optimizerClient", () => ({ runIntelligenceAnalysisV65: runOptimizer }));
vi.mock("../../../intelligence/hostedAI", () => ({
  parseHostedIntentV64: parseHosted,
  streamHostedExplanationV64: streamHosted,
}));

const input = {
  diceId: "predator", diceProgressionLevel: 1, battleUpgradeLevel: 1, treeRanks: {}, conditionValues: {},
  enemy: { id: "custom", kind: "custom" as const }, durationSeconds: 30,
};

function renderWorkspace() {
  return render(<AIIntelligenceWorkspace data={gameDataV3} locale="ko" input={input} resources={{ gold: 100_000, stone: 378, solarCore: 0 }} activeDeckIds={["predator"]} hasProfile={true} onOpenAccount={vi.fn()} onApplyRanks={vi.fn()} onViewTree={vi.fn()} onInspectNode={vi.fn()} />);
}

beforeEach(() => {
  vi.useFakeTimers();
  runOptimizer.mockReset();
  runOptimizer.mockImplementation((_: unknown, request: IntelligenceRequestV63) => Promise.resolve(packetFor(request)));
  streamHosted.mockReset();
  parseHosted.mockReset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Diceify immediate analysis workspace", () => {
  it("calculates on mount and automatically recalculates after a resource edit", async () => {
    renderWorkspace();
    expect(screen.queryByText("모델 다운로드 및 시작")).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(runOptimizer.mock.calls.some((call) => call[1].resources.stone === 378)).toBe(true);
    fireEvent.change(screen.getByLabelText("Core"), { target: { value: "478" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(181); });
    expect(runOptimizer.mock.calls.some((call) => call[1].resources.stone === 478)).toBe(true);
  });

  it("applies a common Korean command locally to the same analysis state", async () => {
    renderWorkspace();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    fireEvent.change(screen.getByLabelText("Diceify에 분석 조건 질문"), { target: { value: "코어 100개 더 있고 다음 4개" } });
    fireEvent.submit(screen.getByRole("button", { name: "분석" }).closest("form")!);
    expect(screen.getByDisplayValue("478")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(181); });
    expect(runOptimizer.mock.calls.some((call) => call[1].resources.stone === 478 && call[1].maxPurchases === 4)).toBe(true);
  });

  it("builds quick scenarios from calculated route-change breakpoints", async () => {
    renderWorkspace();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const breakpoint = screen.getByRole("button", { name: /\+1 Core/ });
    fireEvent.click(breakpoint);
    expect(screen.getByDisplayValue("379")).toBeInTheDocument();
    expect(screen.getByText("Core 378 → 379")).toBeInTheDocument();
  });

  it("streams optional prose separately and preserves automatic evidence on failure", async () => {
    renderWorkspace();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    streamHosted.mockImplementationOnce(async (_input: unknown, onDelta: (value: string) => void) => { onDelta("검증된 경로의 연결성이 좋습니다."); return { text: "검증된 경로의 연결성이 좋습니다." }; });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "AI에게 이유 묻기" })); });
    expect(screen.getByText("검증된 경로의 연결성이 좋습니다.")).toBeInTheDocument();
    streamHosted.mockRejectedValueOnce(new Error("quota"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "AI에게 이유 묻기" })); });
    expect(screen.getByText("자동 계산 근거로 대체했습니다.")).toBeInTheDocument();
    expect(screen.getByText("AI 설명을 불러오지 못했습니다. 계산 결과와 자동 근거는 그대로 유효합니다.")).toBeInTheDocument();
    expect(screen.getByText("왜 이 경로인가?")).toBeInTheDocument();
  });

  it("invalidates an unfinished optimizer revision when inputs change", async () => {
    let resolveFirst: ((value: ReturnType<typeof packetFor>) => void) | undefined;
    runOptimizer.mockImplementationOnce((_: unknown, request: IntelligenceRequestV63) => new Promise((resolve) => {
      resolveFirst = resolve;
      void request;
    }));
    renderWorkspace();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    const firstSignal = runOptimizer.mock.calls[0][3].signal as AbortSignal;
    fireEvent.change(screen.getByLabelText("Core"), { target: { value: "479" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(181); });
    expect(firstSignal.aborted).toBe(true);
    resolveFirst?.(packetFor(runOptimizer.mock.calls[0][1]));
  });

  it("keeps the previous result visible but disables result actions while a new revision is pending", async () => {
    renderWorkspace();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    runOptimizer.mockImplementationOnce(() => new Promise(() => undefined));
    fireEvent.change(screen.getByLabelText("Core"), { target: { value: "481" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(101); });
    expect(screen.getAllByText("새 조건 계산 중").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "분석 저장" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "AI에게 이유 묻기" })).toBeDisabled();
    expect(screen.getByText("왜 이 경로인가?")).toBeInTheDocument();
  });

  it("aborts streamed prose and ignores late chunks after the analysis revision changes", async () => {
    renderWorkspace();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    let lateDelta: ((value: string) => void) | undefined;
    streamHosted.mockImplementationOnce((_input: unknown, onDelta: (value: string) => void) => {
      lateDelta = onDelta;
      return new Promise(() => undefined);
    });
    fireEvent.click(screen.getByRole("button", { name: "AI에게 이유 묻기" }));
    const explanationSignal = streamHosted.mock.calls[0][2].signal as AbortSignal;
    fireEvent.change(screen.getByLabelText("Core"), { target: { value: "480" } });
    expect(explanationSignal.aborted).toBe(true);
    await act(async () => { lateDelta?.("이전 리비전 문장"); });
    expect(screen.queryByText("이전 리비전 문장")).not.toBeInTheDocument();
  });
});
