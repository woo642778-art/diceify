import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CanonicalGameData, TreeCost } from "../../../game-data/types";
import type { SimulationInputV3 } from "../../../simulation/engine/types";
import { runIntelligenceAnalysisV65 } from "../../../intelligence/optimizerClient";
import { deterministicExplanationV63, parseAnalysisCommandV64 } from "../../../intelligence/grounding";
import { currentMetaEvidenceV63 } from "../../../intelligence/meta";
import { parseHostedIntentV64, streamHostedExplanationV64, type HostedAnalysisContextV64 } from "../../../intelligence/hostedAI";
import { loadSavedIntelligenceV63, saveIntelligenceRecommendationV63 } from "../../../intelligence/storage";
import type { IntelligenceCommandV64, IntelligenceGoalV63, IntelligenceRequestV63, IntelligenceResultV63, IntelligenceRouteV63 } from "../../../intelligence/types";
import {
  analysisRequestFromStateV65,
  analysisRevisionIdV65,
  analysisStateReducerV65,
  createAnalysisStateV65,
  hasScenarioOverridesV65,
  selectEffectiveAnalysisV65,
  stableSerializeAnalysisRequestV65,
} from "../../../intelligence/analysisState";
import {
  compareCounterfactualV65,
  recommendationSummaryV65,
  type IntelligenceAnalysisPacketV65,
  type DecisionSupportV65,
} from "../../../intelligence/decisionSupport";
import { DiceIcon } from "../shared/DiceIcon";

interface AIIntelligenceWorkspaceProps {
  data: CanonicalGameData;
  locale: "ko" | "en";
  input: SimulationInputV3;
  resources: TreeCost;
  activeDeckIds: string[];
  hasProfile: boolean;
  onOpenAccount: () => void;
  onApplyRanks: (ranks: Record<string, number>) => void;
  onViewTree: (result: IntelligenceResultV63) => void;
  onInspectNode: (result: IntelligenceResultV63, nodeId: string) => void;
}

const GOALS: Array<{ id: IntelligenceGoalV63; ko: string; en: string }> = [
  { id: "target-dice", ko: "목표 주사위 경로", en: "Target dice route" },
  { id: "basic-dps", ko: "기본 공격 DPS", en: "Basic attack DPS" },
  { id: "resource-efficiency", ko: "재화 효율", en: "Resource efficiency" },
  { id: "pvp", ko: "대전", en: "PvP" },
  { id: "coop", ko: "협동", en: "Co-op" },
];

function costLine(cost: TreeCost, locale: "ko" | "en") {
  const language = locale === "ko" ? "ko-KR" : "en-US";
  return `${cost.gold.toLocaleString(language)} G · ${cost.stone.toLocaleString(language)} C · ${(cost.solarCore ?? 0).toLocaleString(language)} S`;
}

function nodeName(data: CanonicalGameData, nodeId: string, locale: "ko" | "en") {
  const node = data.tree.find((entry) => entry.id === nodeId);
  return node?.nameKey ? data.localization[locale][node.nameKey] ?? nodeId : nodeId;
}

function diceName(data: CanonicalGameData, diceId: string, locale: "ko" | "en") {
  const dice = data.dice.find((entry) => entry.id === diceId);
  return dice?.nameKey ? data.localization[locale][dice.nameKey] ?? diceId : diceId;
}

function resultMetric(route: IntelligenceRouteV63 | null) {
  return route?.metrics.find((metric) => metric.absoluteGain > 0 && metric.percentGain !== null) ?? null;
}

function resultContext(result: IntelligenceResultV63, resources: TreeCost, targetDiceId: string, support: DecisionSupportV65 | null, locale: "ko" | "en", metaSnapshot?: string, selectedNodeId?: string): HostedAnalysisContextV64 {
  const routeSummary = (route: IntelligenceRouteV63) => ({
    nodeIds: route.steps.map((step) => step.nodeId), cost: route.cost, remaining: route.remaining,
    gainPercent: resultMetric(route)?.percentGain ?? null, confidence: route.confidence,
  });
  return {
    dataVersion: result.dataVersion, ...(metaSnapshot ? { metaSnapshot } : {}), goal: result.goal,
    targetDiceId, resources, route: result.primary ? routeSummary(result.primary) : null,
    alternatives: result.alternatives.slice(0, 3).map(routeSummary),
    breakpoint: { decision: result.breakpoint.decision, shortage: result.breakpoint.shortage }, ...(selectedNodeId ? { selectedNodeId } : {}),
    ...(support ? { revisionId: support.revisionId, decisionSupport: {
      stability: support.stability.level,
      evidenceConfidence: support.evidenceConfidence.level,
      reasons: [stabilitySummary(support, locale).slice(0, 280), evidenceSummary(support, locale).slice(0, 280)],
      routeChangeBreakpoint: support.breakpoints[0] ? {
        resource: support.breakpoints[0].resource, amount: support.breakpoints[0].amount, routeNodeIds: support.breakpoints[0].routeNodeIds,
      } : null,
      contributions: support.contributions.map(({ nodeId, fromRank, toRank, role, metric, value }) => ({ nodeId, fromRank, toRank, role, metric, value })),
    } } : {}),
  };
}

function routeKey(result: IntelligenceResultV63) {
  return result.primary?.steps.map((step) => `${step.nodeId}:${step.toRank}`).join("|") ?? "none";
}

function requestChangeReason(previous: IntelligenceRequestV63, next: IntelligenceRequestV63, locale: "ko" | "en") {
  const changes: string[] = [];
  for (const [kind, label] of [["gold", "Gold"], ["stone", "Core"], ["solarCore", "Solar"]] as const) {
    const delta = (next.resources[kind] ?? 0) - (previous.resources[kind] ?? 0);
    if (delta) changes.push(`${label} ${delta > 0 ? "+" : ""}${delta.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}`);
  }
  if (previous.maxPurchases !== next.maxPurchases) changes.push(`${locale === "ko" ? "범위" : "range"} ${previous.maxPurchases}→${next.maxPurchases}`);
  if (previous.goal !== next.goal) changes.push(`${locale === "ko" ? "목표" : "goal"} ${previous.goal}→${next.goal}`);
  if (previous.input.diceId !== next.input.diceId) changes.push(`${locale === "ko" ? "주사위" : "dice"} ${previous.input.diceId}→${next.input.diceId}`);
  return changes.join(", ") || (locale === "ko" ? "트리 또는 덱 상태 변경" : "tree or deck state changed");
}

function stabilitySummary(support: DecisionSupportV65, locale: "ko" | "en") {
  if (locale === "ko") return support.stability.reasons.join(" ");
  const reasons = [
    support.breakpoints.length ? "A tested single-resource event changes the recommended route." : "The route stays unchanged across tested single-resource events.",
    ...Object.entries(support.stability.downwardChange).map(([resource, amount]) => `Reducing ${resource} by ${amount} makes the route unaffordable.`),
    ...(support.stability.scoreGap === null ? [] : [`The nearest alternative score gap is ${support.stability.scoreGap.toFixed(4)}.`]),
    ...(support.stability.nearEquivalentAlternatives ? [`${support.stability.nearEquivalentAlternatives} alternatives have near-equivalent scores.`] : []),
    ...(!support.eventSearch.complete ? ["Some distant breakpoint events were outside the search cap."] : []),
  ];
  return reasons.join(" ");
}

function evidenceSummary(support: DecisionSupportV65, locale: "ko" | "en") {
  if (locale === "ko") return support.evidenceConfidence.reasons.join(" ");
  return `${support.evidenceConfidence.level === "high" ? "The route uses verified calculations in a completed search." : support.evidenceConfidence.level === "medium" ? "Some effects are limited to verified costs and prerequisites." : "The search or effect evidence is incomplete."} Meta observations are not included in the recommendation score.`;
}

function saveSpendReason(support: DecisionSupportV65, locale: "ko" | "en") {
  if (locale === "ko") return support.saveVsSpend.reason;
  if (support.saveVsSpend.verdict === "tradeoff") return "The current route is affordable, but a per-resource breakpoint opens a higher-scoring route. No verified resource-income timing exists to force either choice.";
  if (support.saveVsSpend.verdict === "spend") return "The current route is affordable and no tested resource event opens a different optimum.";
  if (support.saveVsSpend.verdict === "save") return "No route is currently executable, while additional resources open a purchase or route.";
  return support.breakpoints.length ? "A resource breakpoint changes the route, but no verified score gain proves whether saving or spending is better." : "No executable route or verified resource breakpoint exists in the current scope.";
}

export function AIIntelligenceWorkspace({ data, locale, input, resources, activeDeckIds, hasProfile, onOpenAccount, onApplyRanks, onViewTree, onInspectNode }: AIIntelligenceWorkspaceProps) {
  const ko = locale === "ko";
  const dataVersion = `${data.manifest.clientVersion}:${data.manifest.sourceSha256.slice(0, 12)}`;
  const [analysisState, dispatchAnalysis] = useReducer(analysisStateReducerV65, {
    input, resources, deckIds: activeDeckIds, goal: "target-dice" as IntelligenceGoalV63, purchaseLimit: 4,
  }, createAnalysisStateV65);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<IntelligenceResultV63 | null>(null);
  const [support, setSupport] = useState<DecisionSupportV65 | null>(null);
  const [resultRevision, setResultRevision] = useState<string>();
  const [baselinePacket, setBaselinePacket] = useState<IntelligenceAnalysisPacketV65 | null>(null);
  const [slowCalculation, setSlowCalculation] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [aiText, setAiText] = useState("");
  const [aiState, setAiState] = useState<"idle" | "streaming" | "error">("idle");
  const [controlsOpen, setControlsOpen] = useState(false);
  const [saved, setSaved] = useState(loadSavedIntelligenceV63);
  const calculationRun = useRef(0);
  const calculationAbort = useRef<AbortController | undefined>(undefined);
  const explanationAbort = useRef<AbortController | undefined>(undefined);
  const baselineAbort = useRef<AbortController | undefined>(undefined);
  const previousDecision = useRef<{ request: IntelligenceRequestV63; result: IntelligenceResultV63 } | undefined>(undefined);
  const initialCalculation = useRef(true);
  const meta = useMemo(() => currentMetaEvidenceV63(data), [data]);
  const baseSignature = useMemo(() => stableSerializeAnalysisRequestV65({
    schemaVersion: 1,
    dataVersion,
    input,
    resources,
    goal: "target-dice",
    maxPurchases: 4,
    activeDeckIds,
  }), [activeDeckIds, dataVersion, input, resources]);
  useEffect(() => {
    dispatchAnalysis({ type: "replace-base", base: { input, resources, deckIds: activeDeckIds, goal: "target-dice", purchaseLimit: 4 } });
  }, [baseSignature]);
  const effective = useMemo(() => selectEffectiveAnalysisV65(analysisState), [analysisState]);
  const { goal, purchaseLimit: horizon, resources: scenarioResources } = effective;
  const targetDiceId = effective.input.diceId;
  const hypothetical = hasScenarioOverridesV65(analysisState);
  const selectedAlternativeId = analysisState.selection.alternativeId;
  const selectedNodeId = analysisState.selection.nodeId;
  const request = useMemo<IntelligenceRequestV63>(() => analysisRequestFromStateV65(analysisState, dataVersion), [analysisState, dataVersion]);
  const requestSignature = useMemo(() => stableSerializeAnalysisRequestV65(request), [request]);
  const revisionId = useMemo(() => analysisRevisionIdV65(request), [requestSignature]);
  const baselineRequest = useMemo<IntelligenceRequestV63>(() => analysisRequestFromStateV65({
    ...analysisState,
    scenario: { ...analysisState.scenario, overrides: {} },
  }, dataVersion), [analysisState, dataVersion]);
  const baselineRevisionId = useMemo(() => analysisRevisionIdV65(baselineRequest), [baselineRequest]);
  const currentRevision = useRef(revisionId);
  currentRevision.current = revisionId;
  const scenarioChips = useMemo(() => {
    const chips: string[] = [];
    const overrides = analysisState.scenario.overrides;
    const format = (value: number) => value.toLocaleString(ko ? "ko-KR" : "en-US");
    for (const [kind, label] of [["gold", "Gold"], ["stone", "Core"], ["solarCore", "Solar"]] as const) {
      if (overrides.resourceDelta?.[kind] === undefined) continue;
      chips.push(`${label} ${format(analysisState.base.resources[kind] ?? 0)} → ${format(scenarioResources[kind] ?? 0)}`);
    }
    if (overrides.purchaseLimit) chips.push(`${ko ? "범위" : "Range"} ${analysisState.base.purchaseLimit} → ${overrides.purchaseLimit}`);
    if (overrides.goal) chips.push(`${ko ? "목표" : "Goal"} ${GOALS.find((entry) => entry.id === analysisState.base.goal)?.[locale]} → ${GOALS.find((entry) => entry.id === overrides.goal)?.[locale]}`);
    if (overrides.targetDiceId) chips.push(`${ko ? "주사위" : "Dice"} ${diceName(data, analysisState.base.input.diceId, locale)} → ${diceName(data, overrides.targetDiceId, locale)}`);
    if (overrides.input || overrides.assumedTreeRanks) chips.push(ko ? "저장된 시뮬레이션·트리 조건" : "Saved simulation and tree setup");
    return chips;
  }, [analysisState, data, ko, locale, scenarioResources]);

  const calculate = useCallback(async (nextRequest: IntelligenceRequestV63) => {
    calculationAbort.current?.abort();
    const controller = new AbortController();
    calculationAbort.current = controller;
    const run = ++calculationRun.current;
    const slowTimer = window.setTimeout(() => { if (calculationRun.current === run) setSlowCalculation(true); }, 300);
    try {
      const expectedRevision = analysisRevisionIdV65(nextRequest);
      const packet = await runIntelligenceAnalysisV65(data, nextRequest, meta, { signal: controller.signal });
      if (calculationRun.current !== run || currentRevision.current !== expectedRevision || packet.support.revisionId !== expectedRevision) return;
      const previous = previousDecision.current;
      if (previous && routeKey(previous.result) !== routeKey(packet.result)) {
        const reason = requestChangeReason(previous.request, nextRequest, locale);
        setNotice(ko ? `추천 경로가 바뀌었습니다. 원인: ${reason}` : `The recommended route changed. Cause: ${reason}`);
      }
      previousDecision.current = { request: nextRequest, result: packet.result };
      setResult(packet.result); setSupport(packet.support); setResultRevision(expectedRevision); setAiText(""); setAiState("idle"); dispatchAnalysis({ type: "select-alternative", alternativeId: undefined });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (calculationRun.current === run) setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      window.clearTimeout(slowTimer);
      if (calculationRun.current === run) setSlowCalculation(false);
    }
  }, [data, ko, locale, meta]);

  useEffect(() => {
    const delay = initialCalculation.current ? 0 : 100;
    initialCalculation.current = false;
    const timer = window.setTimeout(() => { void calculate(request); }, delay);
    return () => {
      window.clearTimeout(timer);
      calculationAbort.current?.abort();
    };
  }, [calculate, requestSignature]);

  useEffect(() => {
    explanationAbort.current?.abort();
    setAiText("");
    setAiState("idle");
  }, [revisionId]);

  const resultIsCurrent = Boolean(result && support && resultRevision === revisionId && support.revisionId === revisionId);
  const currentSupport = resultIsCurrent ? support : null;
  useEffect(() => {
    baselineAbort.current?.abort();
    if (!hypothetical || !resultIsCurrent) { setBaselinePacket(null); return; }
    const controller = new AbortController();
    baselineAbort.current = controller;
    void runIntelligenceAnalysisV65(data, baselineRequest, meta, { signal: controller.signal }).then((packet) => {
      if (!controller.signal.aborted && packet.support.revisionId === baselineRevisionId) setBaselinePacket(packet);
    }).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) setBaselinePacket(null);
    });
    return () => controller.abort();
  }, [baselineRequest, baselineRevisionId, data, hypothetical, meta, resultIsCurrent]);

  const applyCommand = (command: IntelligenceCommandV64) => {
    const validated = {
      ...command,
      ...(command.targetDiceId && !data.dice.some((dice) => dice.id === command.targetDiceId) ? { targetDiceId: undefined } : {}),
    };
    dispatchAnalysis({ type: "apply-command", command: validated });
    if (command.targetNodeId && data.tree.some((node) => node.id === command.targetNodeId)) dispatchAnalysis({ type: "select-node", nodeId: command.targetNodeId });
  };

  const requestExplanation = async (prompt: string, currentResult = result) => {
    if (!currentResult || resultRevision !== currentRevision.current) return;
    explanationAbort.current?.abort();
    const controller = new AbortController();
    explanationAbort.current = controller;
    const requestedRevision = currentRevision.current;
    setAiText(""); setAiState("streaming"); setNotice(undefined);
    try {
      await streamHostedExplanationV64({ task: "explain_route", locale, question: prompt, context: resultContext(currentResult, scenarioResources, targetDiceId, currentSupport, locale, meta?.snapshotDate, selectedNodeId) }, (delta) => {
        if (currentRevision.current === requestedRevision && !controller.signal.aborted) setAiText((current) => current + delta);
      }, { signal: controller.signal });
      if (currentRevision.current === requestedRevision) setAiState("idle");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (currentRevision.current !== requestedRevision) return;
      setAiState("error");
      setNotice(ko ? "AI 설명을 불러오지 못했습니다. 계산 결과와 자동 근거는 그대로 유효합니다." : "AI explanation could not be loaded. The calculation and automatic evidence remain valid.");
    }
  };

  const ask = async () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    setNotice(undefined);
    const local = parseAnalysisCommandV64(trimmed, data);
    if (local.confidence === "high") {
      applyCommand(local); setQuestion("");
      if (local.tool === "explain_result") setNotice(ko ? "검증된 계산 근거를 아래에 표시했습니다." : "Verified calculation evidence is shown below.");
      return;
    }
    try {
      setAiState("streaming");
      explanationAbort.current?.abort();
      const controller = new AbortController();
      explanationAbort.current = controller;
      const requestedRevision = currentRevision.current;
      const knownNodeIds = [result?.primary?.steps[0]?.nodeId, ...((result?.alternatives ?? []).map((route) => route.steps[0]?.nodeId))].filter((value): value is string => Boolean(value));
      const hosted = await parseHostedIntentV64({ locale, question: trimmed, current: { goal, targetDiceId, maxPurchases: horizon, resources: scenarioResources, knownDiceIds: data.dice.map((dice) => dice.id), knownNodeIds } }, { signal: controller.signal });
      if (currentRevision.current !== requestedRevision || controller.signal.aborted) return;
      applyCommand(hosted); setQuestion(""); setAiState("idle");
      if (hosted.tool === "explain_result" && result) void requestExplanation(trimmed, result);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setAiState("error");
      setNotice(ko ? "문장을 확정적으로 해석하지 못했습니다. 조건 필드나 빠른 가정을 사용해 주세요." : "The request was ambiguous. Use the condition fields or quick assumptions.");
    }
  };

  const setResource = (kind: keyof TreeCost, value: number) => dispatchAnalysis({ type: "set-resource", kind, value });
  const addResource = (delta: Partial<TreeCost>) => dispatchAnalysis({ type: "add-resources", delta });

  const save = () => {
    if (!result || !resultIsCurrent) return;
    saveIntelligenceRecommendationV63({ schemaVersion: 1, id: crypto.randomUUID(), name: `${diceName(data, targetDiceId, locale)} · ${GOALS.find((entry) => entry.id === goal)?.[locale]}`, savedAt: new Date().toISOString(), dataVersion, request, result });
    setSaved(loadSavedIntelligenceV63()); setNotice(ko ? "현재 분석을 이 기기에 저장했습니다." : "Saved this analysis on this device.");
  };
  const restoreSaved = (id: string) => {
    const entry = saved.find((candidate) => candidate.id === id);
    if (!entry || entry.dataVersion !== dataVersion) return;
    dispatchAnalysis({ type: "restore-request", request: entry.request });
  };

  const primary = result?.primary ?? null;
  const metric = resultMetric(primary);
  const nextBreakpoint = resultIsCurrent ? support?.breakpoints[0] ?? null : null;
  const breakpointDelta: Partial<TreeCost> | null = nextBreakpoint ? { [nextBreakpoint.resource]: nextBreakpoint.amount } : null;
  const selectedAlternative = result?.alternatives.find((route) => route.id === selectedAlternativeId);
  const comparison = primary && selectedAlternative ? compareCounterfactualV65(primary, selectedAlternative) : null;
  useEffect(() => {
    if (selectedAlternative?.steps[0]?.nodeId) dispatchAnalysis({ type: "select-node", nodeId: selectedAlternative.steps[0].nodeId });
  }, [selectedAlternative]);
  const deterministicText = (result ? deterministicExplanationV63(result, locale) : (ko ? "저장된 트리와 재화를 읽어 첫 추천을 계산하고 있습니다." : "Calculating the first recommendation from saved tree and resources."))
    .replace(/\[node:([^\]]+)\]/g, (_, nodeId: string) => nodeName(data, nodeId, locale));
  const directTargetSteps = primary?.steps.filter((step) => data.tree.find((node) => node.id === step.nodeId)?.targetId === targetDiceId).length ?? 0;
  const summary = result ? recommendationSummaryV65(result, (id) => nodeName(data, id, locale), locale) : "";

  return <main className="v64-ai" data-testid="v64-ai-workspace">
    <header className="v64-ai-hero"><small>DICEIFY INTELLIGENCE</small><h1>{ko ? "내 재화에서 가장 좋은 다음 선택" : "The best next move for my resources"}</h1><p>{ko ? "선택한 주사위, 트리, 재화를 기준으로 가능한 경로를 즉시 계산합니다. 덱은 영향 범위를 확인하는 데 사용합니다." : "Calculate routes from the selected dice, tree, and resources. The deck is used to show impact scope."}</p><div className="v64-meta-line"><span>Client v{data.manifest.clientVersion}</span><i />{meta ? <><span>Meta {meta.snapshotDate}</span><i /><span>n={meta.sampleSize}</span></> : <span>{ko ? "검증된 메타 표본 없음" : "No verified meta sample"}</span>}</div></header>

    <form className="v64-command" onSubmit={(event) => { event.preventDefault(); void ask(); }}><span aria-hidden="true">D</span><label className="sr-only" htmlFor="v64-command-input">{ko ? "Diceify에 분석 조건 질문" : "Ask Diceify"}</label><input id="v64-command-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={ko ? "코어 100개 더 있으면 어디까지 찍을 수 있어?" : "What can I reach with 100 more Core?"} /><button type="submit">{ko ? "분석" : "Analyze"}</button></form>
    {currentSupport?.breakpoints.length ? <div className="v65-breakpoint-actions" aria-label={ko ? "계산된 빠른 가정" : "Calculated quick scenarios"}><small>{ko ? "추천이 실제로 바뀌는 지점" : "Points where the recommendation changes"}</small>{currentSupport.breakpoints.map((entry) => <button type="button" key={`${entry.resource}:${entry.amount}`} onClick={() => addResource({ [entry.resource]: entry.amount })}>+{entry.amount.toLocaleString(ko ? "ko-KR" : "en-US")} {entry.resource === "gold" ? "Gold" : entry.resource === "stone" ? "Core" : "Solar"}<span>{entry.routeNodeIds.length ? entry.routeNodeIds.map((id) => nodeName(data, id, locale)).join(" → ") : (ko ? "경로 없음" : "No route")}</span></button>)}</div> : null}
    {hypothetical && <div className="v64-command-chips" aria-label={ko ? "해석된 조건" : "Interpreted conditions"}><b>{ko ? "가정 분석 중" : "Scenario active"}</b>{scenarioChips.map((chip) => <span key={chip}>{chip}</span>)}<button type="button" onClick={() => dispatchAnalysis({ type: "reset-scenario" })}>{ko ? "원래 상태로 돌아가기" : "Return to baseline"}</button></div>}

    {!hasProfile && <section className="v64-profile-note"><div><b>{ko ? "현재는 로컬 플래너 상태로 분석 중" : "Using local planner state"}</b><span>{ko ? "계정을 연결하면 저장된 덱과 트리를 같은 분석에 이어서 사용할 수 있습니다." : "Connect a profile to carry saved decks and tree state into this analysis."}</span></div><button type="button" onClick={onOpenAccount}>{ko ? "내 계정 열기" : "Open account"}</button></section>}

    {hypothetical && resultIsCurrent && <section className="v65-scenario-compare" aria-label={ko ? "시나리오 비교" : "Scenario comparison"}><header><small>{ko ? "같은 기준으로 비교" : "LIKE-FOR-LIKE COMPARISON"}</small><h2>{ko ? "기본 상태와 현재 가정" : "Baseline and current scenario"}</h2></header><div><article><small>{ko ? "기본 상태" : "Baseline"}</small><b>{baselinePacket ? (baselinePacket.result.primary?.steps.map((step) => nodeName(data, step.nodeId, locale)).join(" → ") || (ko ? "실행 경로 없음" : "No route")) : (ko ? "계산 중" : "Calculating")}</b><span>{costLine(baselineRequest.resources, locale)}</span></article><article className="is-current"><small>{ko ? "현재 가정" : "Current scenario"}</small><b>{result?.primary?.steps.map((step) => nodeName(data, step.nodeId, locale)).join(" → ") || (ko ? "실행 경로 없음" : "No route")}</b><span>{costLine(request.resources, locale)}</span></article>{nextBreakpoint && <article><small>{ko ? "다음 변경점" : "Next change point"}</small><b>{nextBreakpoint.routeNodeIds.map((id) => nodeName(data, id, locale)).join(" → ") || (ko ? "실행 경로 없음" : "No route")}</b><span>+{nextBreakpoint.amount.toLocaleString(ko ? "ko-KR" : "en-US")} {nextBreakpoint.resource === "gold" ? "Gold" : nextBreakpoint.resource === "stone" ? "Core" : "Solar"}</span></article>}</div></section>}

    <div className="v64-workspace">
      <div className={`v64-rail-backdrop ${controlsOpen ? "is-open" : ""}`} onClick={() => setControlsOpen(false)} />
      <aside className={`v64-control-rail ${controlsOpen ? "is-open" : ""}`} aria-label={ko ? "분석 조건" : "Analysis conditions"}>
        <header><div><small>{ko ? "분석 조건" : "CONDITIONS"}</small><h2>{ko ? "내 조건" : "My setup"}</h2></div><button type="button" className="v64-rail-close" onClick={() => setControlsOpen(false)}>{ko ? "닫기" : "Close"}</button></header>
        <section><h3>{ko ? "현재 덱" : "Current deck"}</h3><div className="v64-deck-row">{effective.deckIds.length ? effective.deckIds.slice(0, 5).map((id) => <DiceIcon key={id} diceId={id} label={diceName(data, id, locale)} />) : <span>{ko ? "저장된 덱 없음" : "No saved deck"}</span>}</div></section>
        <section className="v64-field-stack"><label>{ko ? "분석 주사위" : "Target dice"}<select value={targetDiceId} onChange={(event) => dispatchAnalysis({ type: "set-target-dice", targetDiceId: event.target.value })}>{data.dice.map((dice) => <option key={dice.id} value={dice.id}>{diceName(data, dice.id, locale)}</option>)}</select></label><label>{ko ? "목표" : "Goal"}<select value={goal} onChange={(event) => dispatchAnalysis({ type: "set-goal", goal: event.target.value as IntelligenceGoalV63 })}>{GOALS.map((entry) => <option key={entry.id} value={entry.id}>{entry[locale]}</option>)}</select></label><label>{ko ? "분석 범위" : "Search range"}<select value={horizon} onChange={(event) => dispatchAnalysis({ type: "set-purchase-limit", purchaseLimit: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6, 7, 8].map((value) => <option key={value} value={value}>{ko ? `다음 ${value}회` : `Next ${value}`}</option>)}</select></label></section>
        <section><h3>{ko ? "현재 재화" : "Resources"}</h3><div className="v64-resources"><label><span>GOLD</span><input aria-label="Gold" inputMode="numeric" value={scenarioResources.gold} onChange={(event) => setResource("gold", Number(event.target.value))} /></label><label><span>CORE</span><input aria-label="Core" inputMode="numeric" value={scenarioResources.stone} onChange={(event) => setResource("stone", Number(event.target.value))} /></label><label><span>SOLAR</span><input aria-label="Solar Core" inputMode="numeric" value={scenarioResources.solarCore ?? 0} onChange={(event) => setResource("solarCore", Number(event.target.value))} /></label></div></section>
        <details><summary>{ko ? "분석 정보와 저장" : "Analysis info and saves"}</summary><p>{result?.search.scope ?? (ko ? "첫 계산 준비 중" : "Preparing first calculation")}</p><button type="button" onClick={() => void calculate(request)}>{ko ? "다시 계산" : "Recalculate"}</button><button type="button" disabled={!resultIsCurrent} onClick={save}>{ko ? "분석 저장" : "Save analysis"}</button>{saved.slice(0, 3).map((entry) => <button type="button" key={entry.id} disabled={entry.dataVersion !== dataVersion} onClick={() => restoreSaved(entry.id)}>{entry.name}</button>)}</details>
      </aside>

      <section className={`v64-result ${result && !resultIsCurrent ? "is-stale" : ""}`} aria-live="polite" data-optimizer-ms={result?.search.elapsedMs} data-analysis-revision={resultRevision}>
        <header className="v64-result-heading"><div><small>{ko ? "추천 결과" : "RECOMMENDATION"}</small><h2>{primary ? (ko ? "지금은 이 경로" : "Take this route now") : (ko ? "현재 조건의 결론" : "Current conclusion")}</h2></div><div className="v64-result-status">{(slowCalculation || (result && !resultIsCurrent)) && <span>{ko ? "새 조건 계산 중" : "Calculating new setup"}</span>}{resultIsCurrent && <b className={currentSupport?.evidenceConfidence.level === "high" ? "is-verified" : ""}>{currentSupport?.evidenceConfidence.level === "high" ? (ko ? "근거 신뢰도 높음" : "High evidence confidence") : (ko ? "근거 범위 제한" : "Limited evidence")}</b>}</div></header>
        {result && <p className="v65-decision-summary">{summary}</p>}
        {!result && <div className="v64-compact-loading"><span /><b>{ko ? "저장된 상태로 첫 추천을 계산하는 중" : "Calculating from saved state"}</b></div>}
        {result && !primary && <div className="v64-compact-empty"><b>{result.search.visitedStates > 1 ? (ko ? "구매 가능한 노드는 있지만 검증된 성능 이득이 없습니다." : "Purchases exist, but no verified performance gain is available.") : (ko ? "현재 재화로 구매 가능한 경로가 없습니다." : "No route is affordable with current resources.")}</b>{result.breakpoint.nextCost && <span>{ko ? "다음 경로에 필요한 최소 부족분" : "Minimum shortage for the next route"}: {costLine(result.breakpoint.shortage, locale)}</span>}</div>}
        {primary && result && <><div className="v64-route-hero"><div className="v64-route-copy"><span>{metric ? (ko ? "현재 조건에서 가장 높은 검증 효율" : "Highest verified efficiency in this setup") : (ko ? "목표 연결과 선행 조건 기준 최선" : "Best fit for target links and prerequisites")}</span><strong>{metric?.percentGain !== null && metric?.percentGain !== undefined ? `+${metric.percentGain.toFixed(2)}%` : (ko ? "정량 계산 불가" : "Not quantifiable")}</strong><small>{metric ? (ko ? "게임 데이터와 시뮬레이션의 정확 계산" : "Exact game-data calculation") : (ko ? "비용과 선행 조건만 확정" : "Only costs and prerequisites verified")}</small></div><div className="v64-route-actions"><button type="button" disabled={!resultIsCurrent} onClick={() => onViewTree(result)}>{ko ? "트리에서 보기" : "View in tree"}</button><button type="button" disabled={!resultIsCurrent} className="is-primary" onClick={() => onApplyRanks(primary.rankChanges)}>{ko ? "경로 적용" : "Apply route"}</button></div></div>
          <ol className="v64-route-strip">{primary.steps.map((step, index) => <li key={`${step.nodeId}:${step.toRank}`}><button type="button" onClick={() => onInspectNode(result, step.nodeId)}><span>{String(index + 1).padStart(2, "0")}</span><b>{nodeName(data, step.nodeId, locale)}</b><small>Lv.{step.fromRank} → {step.toRank}</small></button>{index < primary.steps.length - 1 && <i aria-hidden="true" />}</li>)}</ol>
          <div className="v64-metrics"><article><span>{ko ? "예상 효율 변화" : "Expected gain"}</span><b>{metric?.percentGain !== null && metric?.percentGain !== undefined ? `+${metric.percentGain.toFixed(2)}%` : "N/A"}</b><small>{ko ? "정확 계산" : "Exact"}</small></article><article><span>{ko ? "소모 재화" : "Cost"}</span><b>{primary.cost.stone.toLocaleString()} C</b><small>{primary.cost.gold.toLocaleString()} G · {(primary.cost.solarCore ?? 0).toLocaleString()} S</small></article><article><span>{ko ? "남은 재화" : "Remaining"}</span><b>{primary.remaining.stone.toLocaleString()} C</b><small>{primary.remaining.gold.toLocaleString()} G · {(primary.remaining.solarCore ?? 0).toLocaleString()} S</small></article><article><span>{ko ? "재화별 추천 변경점" : "Per-resource route change"}</span><b>{nextBreakpoint ? `+${nextBreakpoint.amount.toLocaleString()} ${nextBreakpoint.resource === "gold" ? "G" : nextBreakpoint.resource === "stone" ? "C" : "S"}` : (ko ? "변화 없음" : "No change found")}</b><small>{nextBreakpoint?.routeNodeIds.length ? nextBreakpoint.routeNodeIds.map((id) => nodeName(data, id, locale)).join(" → ") : (ko ? "검사 범위 내" : "Within tested events")}</small></article></div></>}

        {currentSupport?.bottlenecks.length ? <div className="v65-bottlenecks"><b>{ko ? "재화별 병목" : "Resource bottlenecks"}</b>{currentSupport.bottlenecks.map((entry) => <span key={`${entry.resource}:${entry.amount}`}>{entry.resource === "gold" ? "Gold" : entry.resource === "stone" ? "Core" : "Solar"} +{entry.amount.toLocaleString(ko ? "ko-KR" : "en-US")}<small>{entry.basis === "route-change" ? (ko ? "추천 변경" : "route change") : (ko ? "다음 구매" : "next purchase")}</small></span>)}</div> : null}

        {result && <section className="v64-why"><header><div><small>{ko ? "자동 계산 근거" : "CALCULATION EVIDENCE"}</small><h3>{ko ? "왜 이 경로인가?" : "Why this route?"}</h3></div><button type="button" disabled={aiState === "streaming" || !resultIsCurrent} onClick={() => void requestExplanation(ko ? "현재 추천 경로가 선택된 이유를 간결하게 설명해줘." : "Briefly explain why this route was selected.")}>{aiState === "streaming" ? (ko ? "근거 정리 중" : "Summarizing") : (ko ? "AI에게 이유 묻기" : "Ask AI why")}</button></header><div className="v64-evidence-list"><p><b>{ko ? "예산 충족" : "Within budget"}</b><span>{primary ? (ko ? "모든 단계가 현재 세 재화 범위 안에 있습니다." : "Every step stays within all three resource budgets.") : (ko ? "현재 예산에서 실행 가능한 경로가 없습니다." : "No feasible route in the current budget.")}</span></p><p><b>{ko ? "목표 연결" : "Target link"}</b><span>{directTargetSteps > 0 ? (ko ? `선택한 주사위에 직접 적용되는 단계가 ${directTargetSteps}개 포함됩니다.` : `${directTargetSteps} steps directly affect the selected dice.`) : (ko ? "목표 효과의 전체 수치가 검증되지 않아 선행 조건을 우선 확인했습니다." : "Target effect values are incomplete, so prerequisites are prioritized.")}</span></p><p><b>{ko ? "추천 안정성" : "Recommendation stability"}</b><span>{currentSupport ? `${currentSupport.stability.level.toUpperCase()} · ${stabilitySummary(currentSupport, locale)}` : (ko ? "새 조건 계산 중" : "Calculating new setup")}</span></p><p><b>{ko ? "근거 신뢰도" : "Evidence confidence"}</b><span>{currentSupport ? `${currentSupport.evidenceConfidence.level.toUpperCase()} · ${evidenceSummary(currentSupport, locale)}` : (ko ? "새 조건 계산 중" : "Calculating new setup")}</span></p><p><b>{ko ? "탐색 근거" : "Search proof"}</b><span>{result.search.complete ? (ko ? `${result.search.visitedStates.toLocaleString()}개 상태를 탐색해 현재 범위의 최적성을 확인했습니다.` : `Checked ${result.search.visitedStates.toLocaleString()} states for this horizon.`) : (ko ? "안전 상한 안에서 찾은 현재 최선 후보입니다." : "Best candidate within the safety cap.")}</span></p></div>{currentSupport?.contributions.length ? <ol className="v65-contribution-list">{currentSupport.contributions.map((entry) => <li key={`${entry.nodeId}:${entry.toRank}`}><b>{nodeName(data, entry.nodeId, locale)}</b><span>{entry.role === "bridge" ? (ko ? "선행 경로" : "Prerequisite bridge") : (ko ? "직접 기여" : "Direct contribution")} · {entry.value === null ? (ko ? "효과값 미검증" : "Unverified effect") : entry.metric === "target-step" ? (entry.value ? (ko ? "목표에 직접 연결" : "Direct target link") : (ko ? "경로 연결 단계" : "Route bridge")) : `${entry.value >= 0 ? "+" : ""}${entry.value.toFixed(2)} DPS`}</span></li>)}</ol> : null}<p className="v64-deterministic-copy">{deterministicText}</p>{(aiText || aiState === "streaming" || aiState === "error") && <div className={`v64-ai-explanation is-${aiState}`}><b>{ko ? "AI 설명" : "AI explanation"}</b><p>{aiText || (aiState === "streaming" ? (ko ? "근거 정리 중" : "Summarizing evidence") : (ko ? "자동 계산 근거로 대체했습니다." : "Using automatic evidence instead."))}<i aria-hidden="true" /></p></div>}</section>}

        {result && <section className="v64-decision-grid"><article className={currentSupport?.saveVsSpend.verdict === "spend" ? "is-recommended" : ""}><small>{ko ? "지금 투자" : "Spend now"}</small><h3>{metric?.percentGain !== null && metric?.percentGain !== undefined ? `+${metric.percentGain.toFixed(2)}%` : (ko ? "검증 수치 없음" : "No verified gain")}</h3><p>{primary ? `${costLine(primary.cost, locale)} ${ko ? "사용" : "spent"}` : (ko ? "실행 경로 없음" : "No route")}</p></article><article className={currentSupport?.saveVsSpend.verdict === "save" ? "is-recommended" : ""}><small>{ko ? "추천 변경점까지 모으기" : "Save until recommendation changes"}</small><h3>{nextBreakpoint ? `+${nextBreakpoint.amount.toLocaleString()} ${nextBreakpoint.resource === "gold" ? "Gold" : nextBreakpoint.resource === "stone" ? "Core" : "Solar"}` : (ko ? "변경점 없음" : "No change point")}</h3><p>{nextBreakpoint?.routeNodeIds.length ? nextBreakpoint.routeNodeIds.map((id) => nodeName(data, id, locale)).join(" → ") : (ko ? "검사한 재화 이벤트 안에서는 현재 경로 유지" : "Current route holds within tested resource events")}</p>{breakpointDelta && <button type="button" onClick={() => addResource(breakpointDelta)}>{ko ? "정확한 변경점 적용" : "Apply exact breakpoint"}</button>}</article>{currentSupport && <p className="v65-save-spend-reason"><b>{currentSupport.saveVsSpend.verdict === "tradeoff" ? (ko ? "선택 유보" : "Tradeoff") : currentSupport.saveVsSpend.verdict === "unverified" ? (ko ? "판단 불가" : "Unverified") : currentSupport.saveVsSpend.verdict === "spend" ? (ko ? "지금 투자 우세" : "Spend favored") : (ko ? "저장 우세" : "Save favored")}</b>{saveSpendReason(currentSupport, locale)}</p>}</section>}

        {result && result.alternatives.length > 0 && <section className="v64-alternatives"><header><small>{ko ? "다른 선택" : "ALTERNATIVES"}</small><h3>{ko ? "대안 경로" : "Alternative routes"}</h3></header><div>{result.alternatives.slice(0, 3).map((route, index) => { const alternativeMetric = resultMetric(route); return <button type="button" className={selectedAlternativeId === route.id ? "is-selected" : ""} key={route.id} onClick={() => dispatchAnalysis({ type: "select-alternative", alternativeId: route.id })}><small>{index === 0 ? (ko ? "효율 대안" : "Efficiency") : index === 1 ? (ko ? "경로 대안" : "Route") : (ko ? "재화 대안" : "Budget")}</small><b>{route.steps.map((step) => nodeName(data, step.nodeId, locale)).join(" → ")}</b><span>{alternativeMetric?.percentGain !== null && alternativeMetric?.percentGain !== undefined ? `+${alternativeMetric.percentGain.toFixed(2)}%` : (ko ? "정량 계산 불가" : "Not quantifiable")} · {costLine(route.cost, locale)}</span></button>; })}</div>{comparison && selectedAlternative && <div className="v64-comparison"><b>{ko ? "이 경로를 대신 선택하면" : "If you choose this route"}</b><span>{ko ? "추천 대비 점수" : "Score vs recommendation"} {comparison.scoreDelta === null ? "N/A" : `${comparison.scoreDelta >= 0 ? "-" : "+"}${Math.abs(comparison.scoreDelta).toFixed(2)}`} · {ko ? "비용 차이" : "Cost delta"} {costLine(comparison.costDelta, locale)}</span><small>{comparison.verdict === "recommended-dominates" ? (ko ? "추천 경로가 효과와 비용에서 우세합니다." : "The recommendation dominates on effect and cost.") : comparison.verdict === "alternative-tradeoff" ? (ko ? "효과와 재화 사이의 교환 관계가 있습니다." : "This is an effect-versus-currency tradeoff.") : (ko ? "효과값이 부족해 우열을 확정할 수 없습니다." : "Effect evidence is insufficient to rank these routes.")}</small><button type="button" disabled={!resultIsCurrent} onClick={() => void requestExplanation(ko ? "선택한 대안이 추천 경로와 어떻게 다른지 설명해줘." : "Explain how the selected alternative differs from the recommendation.")}>{ko ? "AI에게 차이 묻기" : "Ask AI about differences"}</button></div>}</section>}
        {result && <details className="v64-analysis-details"><summary>{ko ? "분석 기준 상세" : "Analysis details"}</summary><dl><div><dt>{ko ? "클라이언트" : "Client"}</dt><dd>v{data.manifest.clientVersion}</dd></div><div><dt>{ko ? "데이터 해시" : "Data hash"}</dt><dd>{data.manifest.sourceSha256.slice(0, 12)}</dd></div><div><dt>{ko ? "탐색" : "Search"}</dt><dd>{result.search.algorithm} · {result.search.visitedStates.toLocaleString()}</dd></div><div><dt>{ko ? "메타" : "Meta"}</dt><dd>{meta ? `${meta.snapshotDate} · n=${meta.sampleSize}` : (ko ? "적용 안 함" : "Not applied")}</dd></div></dl>{result.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}</details>}
      </section>
    </div>
    <button className="v64-mobile-conditions" type="button" onClick={() => setControlsOpen(true)}>{ko ? "내 조건" : "Conditions"}</button>
    {notice && <div className="v64-notice" role="status">{notice}<button type="button" aria-label={ko ? "알림 닫기" : "Dismiss"} onClick={() => setNotice(undefined)}>×</button></div>}
  </main>;
}
