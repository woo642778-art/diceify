import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanonicalGameData, TreeCost } from "../../../game-data/types";
import type { SimulationInputV3 } from "../../../simulation/engine/types";
import { compareIntelligenceRoutesV63 } from "../../../intelligence/optimizer";
import { runIntelligenceOptimizerV63 } from "../../../intelligence/optimizerClient";
import { deterministicExplanationV63, parseAnalysisCommandV64 } from "../../../intelligence/grounding";
import { currentMetaEvidenceV63 } from "../../../intelligence/meta";
import { parseHostedIntentV64, streamHostedExplanationV64, type HostedAnalysisContextV64 } from "../../../intelligence/hostedAI";
import { loadSavedIntelligenceV63, saveIntelligenceRecommendationV63 } from "../../../intelligence/storage";
import type { IntelligenceCommandV64, IntelligenceGoalV63, IntelligenceRequestV63, IntelligenceResultV63, IntelligenceRouteV63 } from "../../../intelligence/types";
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

const QUICK_ACTIONS = [
  { label: "Core +50", delta: { stone: 50 } },
  { label: "Core +100", delta: { stone: 100 } },
  { label: "Gold +100K", delta: { gold: 100_000 } },
] as const;

function safeResource(value: number) {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

function addCost(base: TreeCost, delta: Partial<TreeCost>): TreeCost {
  return {
    gold: safeResource(base.gold + (delta.gold ?? 0)),
    stone: safeResource(base.stone + (delta.stone ?? 0)),
    solarCore: safeResource((base.solarCore ?? 0) + (delta.solarCore ?? 0)),
  };
}

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

function resultContext(result: IntelligenceResultV63, resources: TreeCost, targetDiceId: string, metaSnapshot?: string, selectedNodeId?: string): HostedAnalysisContextV64 {
  const routeSummary = (route: IntelligenceRouteV63) => ({
    nodeIds: route.steps.map((step) => step.nodeId), cost: route.cost, remaining: route.remaining,
    gainPercent: resultMetric(route)?.percentGain ?? null, confidence: route.confidence,
  });
  return {
    dataVersion: result.dataVersion, ...(metaSnapshot ? { metaSnapshot } : {}), goal: result.goal,
    targetDiceId, resources, route: result.primary ? routeSummary(result.primary) : null,
    alternatives: result.alternatives.slice(0, 3).map(routeSummary),
    breakpoint: { decision: result.breakpoint.decision, shortage: result.breakpoint.shortage }, ...(selectedNodeId ? { selectedNodeId } : {}),
  };
}

export function AIIntelligenceWorkspace({ data, locale, input, resources, activeDeckIds, hasProfile, onOpenAccount, onApplyRanks, onViewTree, onInspectNode }: AIIntelligenceWorkspaceProps) {
  const ko = locale === "ko";
  const dataVersion = `${data.manifest.clientVersion}:${data.manifest.sourceSha256.slice(0, 12)}`;
  const [goal, setGoal] = useState<IntelligenceGoalV63>("target-dice");
  const [horizon, setHorizon] = useState(4);
  const [targetDiceId, setTargetDiceId] = useState(input.diceId);
  const [resourceDelta, setResourceDelta] = useState<Partial<TreeCost>>({});
  const [question, setQuestion] = useState("");
  const [commandChips, setCommandChips] = useState<string[]>([]);
  const [result, setResult] = useState<IntelligenceResultV63 | null>(null);
  const [breakpointResult, setBreakpointResult] = useState<IntelligenceResultV63 | null>(null);
  const [slowCalculation, setSlowCalculation] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [aiText, setAiText] = useState("");
  const [aiState, setAiState] = useState<"idle" | "streaming" | "error">("idle");
  const [selectedAlternativeId, setSelectedAlternativeId] = useState<string>();
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [controlsOpen, setControlsOpen] = useState(false);
  const [saved, setSaved] = useState(loadSavedIntelligenceV63);
  const calculationRun = useRef(0);
  const breakpointRun = useRef(0);
  const initialCalculation = useRef(true);
  const meta = useMemo(() => currentMetaEvidenceV63(data), [data]);
  const scenarioResources = useMemo(() => addCost(resources, resourceDelta), [resourceDelta, resources]);
  const hypothetical = Boolean((resourceDelta.gold ?? 0) || (resourceDelta.stone ?? 0) || (resourceDelta.solarCore ?? 0));
  const analysisInput = useMemo(() => ({ ...input, diceId: targetDiceId }), [input, targetDiceId]);
  const request = useMemo<IntelligenceRequestV63>(() => ({ schemaVersion: 1, dataVersion, input: analysisInput, resources: scenarioResources, goal, maxPurchases: horizon, activeDeckIds }), [activeDeckIds, analysisInput, dataVersion, goal, horizon, scenarioResources]);
  const requestSignature = useMemo(() => JSON.stringify(request), [request]);

  useEffect(() => { setTargetDiceId(input.diceId); }, [input.diceId]);

  const calculate = useCallback(async (nextRequest: IntelligenceRequestV63) => {
    const run = ++calculationRun.current;
    const slowTimer = window.setTimeout(() => { if (calculationRun.current === run) setSlowCalculation(true); }, 300);
    try {
      const next = await runIntelligenceOptimizerV63(data, nextRequest);
      if (calculationRun.current !== run) return;
      setResult(next); setAiText(""); setAiState("idle"); setSelectedAlternativeId(undefined);
    } catch (error) {
      if (calculationRun.current === run) setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      window.clearTimeout(slowTimer);
      if (calculationRun.current === run) setSlowCalculation(false);
    }
  }, [data]);

  useEffect(() => {
    const delay = initialCalculation.current ? 0 : 180;
    initialCalculation.current = false;
    const timer = window.setTimeout(() => { void calculate(request); }, delay);
    return () => window.clearTimeout(timer);
  }, [calculate, requestSignature]);

  useEffect(() => {
    const shortage = result?.breakpoint.shortage;
    if (!result || !shortage || (!shortage.gold && !shortage.stone && !(shortage.solarCore ?? 0))) { setBreakpointResult(null); return; }
    const run = ++breakpointRun.current;
    const nextRequest = { ...request, resources: addCost(scenarioResources, shortage) };
    void runIntelligenceOptimizerV63(data, nextRequest).then((next) => { if (breakpointRun.current === run) setBreakpointResult(next); }).catch(() => { if (breakpointRun.current === run) setBreakpointResult(null); });
  }, [data, request, result, scenarioResources]);

  const applyCommand = (command: IntelligenceCommandV64) => {
    if (command.goal) setGoal(command.goal);
    if (command.maxPurchases) setHorizon(command.maxPurchases);
    if (command.targetDiceId && data.dice.some((dice) => dice.id === command.targetDiceId)) setTargetDiceId(command.targetDiceId);
    if (command.targetNodeId && data.tree.some((node) => node.id === command.targetNodeId)) setSelectedNodeId(command.targetNodeId);
    setResourceDelta((current) => {
      const next = { ...current };
      for (const key of ["gold", "stone", "solarCore"] as const) {
        if (command.resourceOverride?.[key] !== undefined) next[key] = safeResource(command.resourceOverride[key]!) - (resources[key] ?? 0);
        if (command.resourceDelta?.[key] !== undefined) next[key] = (next[key] ?? 0) + command.resourceDelta[key]!;
      }
      return next;
    });
    const chips: string[] = [];
    if (command.goal) chips.push(`${ko ? "목표" : "Goal"} · ${GOALS.find((entry) => entry.id === command.goal)?.[locale]}`);
    if (command.maxPurchases) chips.push(`${ko ? "범위" : "Range"} · ${command.maxPurchases}`);
    if (command.targetDiceId) chips.push(`${ko ? "주사위" : "Dice"} · ${diceName(data, command.targetDiceId, locale)}`);
    if (command.targetNodeId) chips.push(`${ko ? "비교 노드" : "Node"} · ${nodeName(data, command.targetNodeId, locale)}`);
    for (const [key, value] of Object.entries(command.resourceDelta ?? {})) chips.push(`${key === "stone" ? "Core" : key === "gold" ? "Gold" : "Solar"} · +${Number(value).toLocaleString()}`);
    for (const [key, value] of Object.entries(command.resourceOverride ?? {})) chips.push(`${key === "stone" ? "Core" : key === "gold" ? "Gold" : "Solar"} · ${Number(value).toLocaleString()}`);
    setCommandChips(chips);
  };

  const requestExplanation = async (prompt: string, currentResult = result) => {
    if (!currentResult) return;
    setAiText(""); setAiState("streaming"); setNotice(undefined);
    try {
      await streamHostedExplanationV64({ task: "explain_route", locale, question: prompt, context: resultContext(currentResult, scenarioResources, targetDiceId, meta?.snapshotDate, selectedNodeId) }, (delta) => setAiText((current) => current + delta));
      setAiState("idle");
    } catch {
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
      const knownNodeIds = [result?.primary?.steps[0]?.nodeId, ...((result?.alternatives ?? []).map((route) => route.steps[0]?.nodeId))].filter((value): value is string => Boolean(value));
      const hosted = await parseHostedIntentV64({ locale, question: trimmed, current: { goal, targetDiceId, maxPurchases: horizon, resources: scenarioResources, knownDiceIds: data.dice.map((dice) => dice.id), knownNodeIds } });
      applyCommand(hosted); setQuestion(""); setAiState("idle");
      if (hosted.tool === "explain_result" && result) void requestExplanation(trimmed, result);
    } catch {
      setAiState("error");
      setNotice(ko ? "문장을 확정적으로 해석하지 못했습니다. 조건 필드나 빠른 가정을 사용해 주세요." : "The request was ambiguous. Use the condition fields or quick assumptions.");
    }
  };

  const setResource = (kind: keyof TreeCost, value: number) => setResourceDelta((current) => ({ ...current, [kind]: safeResource(value) - (resources[kind] ?? 0) }));
  const addResource = (delta: Partial<TreeCost>) => setResourceDelta((current) => ({ ...current, gold: (current.gold ?? 0) + (delta.gold ?? 0), stone: (current.stone ?? 0) + (delta.stone ?? 0), solarCore: (current.solarCore ?? 0) + (delta.solarCore ?? 0) }));

  const save = () => {
    if (!result) return;
    saveIntelligenceRecommendationV63({ schemaVersion: 1, id: crypto.randomUUID(), name: `${diceName(data, targetDiceId, locale)} · ${GOALS.find((entry) => entry.id === goal)?.[locale]}`, savedAt: new Date().toISOString(), dataVersion, request, result });
    setSaved(loadSavedIntelligenceV63()); setNotice(ko ? "현재 분석을 이 기기에 저장했습니다." : "Saved this analysis on this device.");
  };
  const restoreSaved = (id: string) => {
    const entry = saved.find((candidate) => candidate.id === id);
    if (!entry || entry.dataVersion !== dataVersion) return;
    setGoal(entry.request.goal); setHorizon(entry.request.maxPurchases); setTargetDiceId(entry.request.input.diceId);
    setResourceDelta({ gold: entry.request.resources.gold - resources.gold, stone: entry.request.resources.stone - resources.stone, solarCore: (entry.request.resources.solarCore ?? 0) - (resources.solarCore ?? 0) });
    setResult(entry.result);
  };

  const primary = result?.primary ?? null;
  const metric = resultMetric(primary);
  const breakpointMetric = resultMetric(breakpointResult?.primary ?? null);
  const selectedAlternative = result?.alternatives.find((route) => route.id === selectedAlternativeId);
  const comparison = primary && selectedAlternative ? compareIntelligenceRoutesV63(primary, selectedAlternative) : null;
  useEffect(() => {
    if (selectedAlternative?.steps[0]?.nodeId) setSelectedNodeId(selectedAlternative.steps[0].nodeId);
  }, [selectedAlternative]);
  const deterministicText = (result ? deterministicExplanationV63(result, locale) : (ko ? "저장된 트리와 재화를 읽어 첫 추천을 계산하고 있습니다." : "Calculating the first recommendation from saved tree and resources."))
    .replace(/\[node:([^\]]+)\]/g, (_, nodeId: string) => nodeName(data, nodeId, locale));
  const directTargetSteps = primary?.steps.filter((step) => data.tree.find((node) => node.id === step.nodeId)?.targetId === targetDiceId).length ?? 0;

  return <main className="v64-ai" data-testid="v64-ai-workspace">
    <header className="v64-ai-hero"><small>DICEIFY INTELLIGENCE</small><h1>{ko ? "내 재화에서 가장 좋은 다음 선택" : "The best next move for my resources"}</h1><p>{ko ? "현재 덱, 트리, 재화를 기준으로 가능한 경로를 즉시 계산합니다." : "Instantly calculate feasible routes from your current deck, tree, and resources."}</p><div className="v64-meta-line"><span>Client v{data.manifest.clientVersion}</span><i />{meta ? <><span>Meta {meta.snapshotDate}</span><i /><span>n={meta.sampleSize}</span></> : <span>{ko ? "검증된 메타 표본 없음" : "No verified meta sample"}</span>}</div></header>

    <form className="v64-command" onSubmit={(event) => { event.preventDefault(); void ask(); }}><span aria-hidden="true">D</span><label className="sr-only" htmlFor="v64-command-input">{ko ? "Diceify에 분석 조건 질문" : "Ask Diceify"}</label><input id="v64-command-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={ko ? "코어 100개 더 있으면 어디까지 찍을 수 있어?" : "What can I reach with 100 more Core?"} /><button type="submit">{ko ? "분석" : "Analyze"}</button></form>
    {(commandChips.length > 0 || hypothetical) && <div className="v64-command-chips" aria-label={ko ? "해석된 조건" : "Interpreted conditions"}>{hypothetical && <b>{ko ? "가정 상태" : "Hypothetical"}</b>}{commandChips.map((chip) => <span key={chip}>{chip}</span>)}{hypothetical && <button type="button" onClick={() => { setResourceDelta({}); setCommandChips([]); }}>{ko ? "원래 상태로" : "Reset"}</button>}</div>}

    {!hasProfile && <section className="v64-profile-note"><div><b>{ko ? "현재는 로컬 플래너 상태로 분석 중" : "Using local planner state"}</b><span>{ko ? "계정을 연결하면 저장된 덱과 트리를 같은 분석에 이어서 사용할 수 있습니다." : "Connect a profile to carry saved decks and tree state into this analysis."}</span></div><button type="button" onClick={onOpenAccount}>{ko ? "내 계정 열기" : "Open account"}</button></section>}

    <div className="v64-workspace">
      <div className={`v64-rail-backdrop ${controlsOpen ? "is-open" : ""}`} onClick={() => setControlsOpen(false)} />
      <aside className={`v64-control-rail ${controlsOpen ? "is-open" : ""}`} aria-label={ko ? "분석 조건" : "Analysis conditions"}>
        <header><div><small>{ko ? "분석 조건" : "CONDITIONS"}</small><h2>{ko ? "내 조건" : "My setup"}</h2></div><button type="button" className="v64-rail-close" onClick={() => setControlsOpen(false)}>{ko ? "닫기" : "Close"}</button></header>
        <section><h3>{ko ? "현재 덱" : "Current deck"}</h3><div className="v64-deck-row">{activeDeckIds.length ? activeDeckIds.slice(0, 5).map((id) => <DiceIcon key={id} diceId={id} label={diceName(data, id, locale)} />) : <span>{ko ? "저장된 덱 없음" : "No saved deck"}</span>}</div></section>
        <section className="v64-field-stack"><label>{ko ? "분석 주사위" : "Target dice"}<select value={targetDiceId} onChange={(event) => setTargetDiceId(event.target.value)}>{data.dice.map((dice) => <option key={dice.id} value={dice.id}>{diceName(data, dice.id, locale)}</option>)}</select></label><label>{ko ? "목표" : "Goal"}<select value={goal} onChange={(event) => setGoal(event.target.value as IntelligenceGoalV63)}>{GOALS.map((entry) => <option key={entry.id} value={entry.id}>{entry[locale]}</option>)}</select></label><label>{ko ? "분석 범위" : "Search range"}<select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8].map((value) => <option key={value} value={value}>{ko ? `다음 ${value}회` : `Next ${value}`}</option>)}</select></label></section>
        <section><h3>{ko ? "현재 재화" : "Resources"}</h3><div className="v64-resources"><label><span>GOLD</span><input aria-label="Gold" inputMode="numeric" value={scenarioResources.gold} onChange={(event) => setResource("gold", Number(event.target.value))} /></label><label><span>CORE</span><input aria-label="Core" inputMode="numeric" value={scenarioResources.stone} onChange={(event) => setResource("stone", Number(event.target.value))} /></label><label><span>SOLAR</span><input aria-label="Solar Core" inputMode="numeric" value={scenarioResources.solarCore ?? 0} onChange={(event) => setResource("solarCore", Number(event.target.value))} /></label></div><div className="v64-quick-actions">{QUICK_ACTIONS.map((action) => <button key={action.label} type="button" onClick={() => addResource(action.delta)}>{action.label}</button>)}</div></section>
        <details><summary>{ko ? "분석 정보와 저장" : "Analysis info and saves"}</summary><p>{result?.search.scope ?? (ko ? "첫 계산 준비 중" : "Preparing first calculation")}</p><button type="button" onClick={() => void calculate(request)}>{ko ? "다시 계산" : "Recalculate"}</button><button type="button" disabled={!result} onClick={save}>{ko ? "분석 저장" : "Save analysis"}</button>{saved.slice(0, 3).map((entry) => <button type="button" key={entry.id} disabled={entry.dataVersion !== dataVersion} onClick={() => restoreSaved(entry.id)}>{entry.name}</button>)}</details>
      </aside>

      <section className="v64-result" aria-live="polite" data-optimizer-ms={result?.search.elapsedMs}>
        <header className="v64-result-heading"><div><small>{ko ? "추천 결과" : "RECOMMENDATION"}</small><h2>{primary ? (ko ? "지금은 이 경로" : "Take this route now") : (ko ? "현재 조건의 결론" : "Current conclusion")}</h2></div><div className="v64-result-status">{slowCalculation && <span>{ko ? "재계산 중" : "Recalculating"}</span>}<b className={primary?.confidence === "verified" ? "is-verified" : ""}>{primary?.confidence === "verified" ? (ko ? "정확 계산" : "Exact calculation") : (ko ? "검증 범위 제한" : "Limited evidence")}</b></div></header>
        {!result && <div className="v64-compact-loading"><span /><b>{ko ? "저장된 상태로 첫 추천을 계산하는 중" : "Calculating from saved state"}</b></div>}
        {result && !primary && <div className="v64-compact-empty"><b>{result.search.visitedStates > 1 ? (ko ? "구매 가능한 노드는 있지만 검증된 성능 이득이 없습니다." : "Purchases exist, but no verified performance gain is available.") : (ko ? "현재 재화로 구매 가능한 경로가 없습니다." : "No route is affordable with current resources.")}</b>{result.breakpoint.nextCost && <span>{ko ? "다음 경로에 필요한 최소 부족분" : "Minimum shortage for the next route"}: {costLine(result.breakpoint.shortage, locale)}</span>}</div>}
        {primary && result && <><div className="v64-route-hero"><div className="v64-route-copy"><span>{ko ? "현재 조건에서 가장 높은 검증 효율" : "Highest verified efficiency in this setup"}</span><strong>{metric?.percentGain !== null && metric?.percentGain !== undefined ? `+${metric.percentGain.toFixed(2)}%` : (ko ? "정량 계산 불가" : "Not quantifiable")}</strong><small>{metric ? (ko ? "게임 데이터와 시뮬레이션의 정확 계산" : "Exact game-data calculation") : (ko ? "비용과 선행 조건만 확정" : "Only costs and prerequisites verified")}</small></div><div className="v64-route-actions"><button type="button" onClick={() => onViewTree(result)}>{ko ? "트리에서 보기" : "View in tree"}</button><button type="button" className="is-primary" onClick={() => onApplyRanks(primary.rankChanges)}>{ko ? "경로 적용" : "Apply route"}</button></div></div>
          <ol className="v64-route-strip">{primary.steps.map((step, index) => <li key={`${step.nodeId}:${step.toRank}`}><button type="button" onClick={() => onInspectNode(result, step.nodeId)}><span>{String(index + 1).padStart(2, "0")}</span><b>{nodeName(data, step.nodeId, locale)}</b><small>Lv.{step.fromRank} → {step.toRank}</small></button>{index < primary.steps.length - 1 && <i aria-hidden="true" />}</li>)}</ol>
          <div className="v64-metrics"><article><span>{ko ? "예상 효율 변화" : "Expected gain"}</span><b>{metric?.percentGain !== null && metric?.percentGain !== undefined ? `+${metric.percentGain.toFixed(2)}%` : "N/A"}</b><small>{ko ? "정확 계산" : "Exact"}</small></article><article><span>{ko ? "소모 재화" : "Cost"}</span><b>{primary.cost.stone.toLocaleString()} C</b><small>{primary.cost.gold.toLocaleString()} G · {(primary.cost.solarCore ?? 0).toLocaleString()} S</small></article><article><span>{ko ? "남은 재화" : "Remaining"}</span><b>{primary.remaining.stone.toLocaleString()} C</b><small>{primary.remaining.gold.toLocaleString()} G · {(primary.remaining.solarCore ?? 0).toLocaleString()} S</small></article><article><span>{ko ? "다음 Breakpoint" : "Next breakpoint"}</span><b>+{result.breakpoint.shortage.stone.toLocaleString()} C</b><small>+{result.breakpoint.shortage.gold.toLocaleString()} G · +{(result.breakpoint.shortage.solarCore ?? 0).toLocaleString()} S</small></article></div></>}

        {result && <section className="v64-why"><header><div><small>{ko ? "자동 계산 근거" : "CALCULATION EVIDENCE"}</small><h3>{ko ? "왜 이 경로인가?" : "Why this route?"}</h3></div><button type="button" disabled={aiState === "streaming"} onClick={() => void requestExplanation(ko ? "현재 추천 경로가 선택된 이유를 간결하게 설명해줘." : "Briefly explain why this route was selected.")}>{aiState === "streaming" ? (ko ? "근거 정리 중" : "Summarizing") : (ko ? "AI에게 이유 묻기" : "Ask AI why")}</button></header><div className="v64-evidence-list"><p><b>{ko ? "예산 충족" : "Within budget"}</b><span>{primary ? (ko ? "모든 단계가 현재 세 재화 범위 안에 있습니다." : "Every step stays within all three resource budgets.") : (ko ? "현재 예산에서 실행 가능한 경로가 없습니다." : "No feasible route in the current budget.")}</span></p><p><b>{ko ? "목표 연결" : "Target link"}</b><span>{directTargetSteps > 0 ? (ko ? `선택한 주사위에 직접 적용되는 단계가 ${directTargetSteps}개 포함됩니다.` : `${directTargetSteps} steps directly affect the selected dice.`) : (ko ? "목표 효과의 전체 수치가 검증되지 않아 선행 조건을 우선 확인했습니다." : "Target effect values are incomplete, so prerequisites are prioritized.")}</span></p><p><b>{ko ? "탐색 근거" : "Search proof"}</b><span>{result.search.complete ? (ko ? `${result.search.visitedStates.toLocaleString()}개 상태를 탐색해 현재 범위의 최적성을 확인했습니다.` : `Checked ${result.search.visitedStates.toLocaleString()} states for this horizon.`) : (ko ? "안전 상한 안에서 찾은 현재 최선 후보입니다." : "Best candidate within the safety cap.")}</span></p></div><p className="v64-deterministic-copy">{deterministicText}</p>{(aiText || aiState === "streaming" || aiState === "error") && <div className={`v64-ai-explanation is-${aiState}`}><b>{ko ? "AI 설명" : "AI explanation"}</b><p>{aiText || (aiState === "streaming" ? (ko ? "근거 정리 중" : "Summarizing evidence") : (ko ? "자동 계산 근거로 대체했습니다." : "Using automatic evidence instead."))}<i aria-hidden="true" /></p></div>}</section>}

        {result && <section className="v64-decision-grid"><article className={result.breakpoint.decision === "spend" ? "is-recommended" : ""}><small>{ko ? "지금 투자" : "Spend now"}</small><h3>{metric?.percentGain !== null && metric?.percentGain !== undefined ? `+${metric.percentGain.toFixed(2)}%` : (ko ? "검증 수치 없음" : "No verified gain")}</h3><p>{primary ? `${primary.cost.stone.toLocaleString()} Core ${ko ? "사용" : "spent"}` : (ko ? "실행 경로 없음" : "No route")}</p></article><article className={result.breakpoint.decision === "save" ? "is-recommended" : ""}><small>{ko ? "조금 더 모으기" : "Save a little more"}</small><h3>{breakpointMetric?.percentGain !== null && breakpointMetric?.percentGain !== undefined ? `+${breakpointMetric.percentGain.toFixed(2)}%` : `+${result.breakpoint.shortage.stone.toLocaleString()} Core`}</h3><p>{ko ? "다음 구매 가능 구간" : "Next affordable breakpoint"}</p>{Boolean(result.breakpoint.shortage.gold || result.breakpoint.shortage.stone || result.breakpoint.shortage.solarCore) && <button type="button" onClick={() => addResource(result.breakpoint.shortage)}>{ko ? "이 재화를 가정" : "Try this budget"}</button>}</article></section>}

        {result && result.alternatives.length > 0 && <section className="v64-alternatives"><header><small>{ko ? "다른 선택" : "ALTERNATIVES"}</small><h3>{ko ? "대안 경로" : "Alternative routes"}</h3></header><div>{result.alternatives.slice(0, 3).map((route, index) => { const alternativeMetric = resultMetric(route); return <button type="button" className={selectedAlternativeId === route.id ? "is-selected" : ""} key={route.id} onClick={() => setSelectedAlternativeId(route.id)}><small>{index === 0 ? (ko ? "효율 대안" : "Efficiency") : index === 1 ? (ko ? "경로 대안" : "Route") : (ko ? "재화 대안" : "Budget")}</small><b>{route.steps.map((step) => nodeName(data, step.nodeId, locale)).join(" → ")}</b><span>{alternativeMetric?.percentGain !== null && alternativeMetric?.percentGain !== undefined ? `+${alternativeMetric.percentGain.toFixed(2)}%` : (ko ? "정량 계산 불가" : "Not quantifiable")} · {route.cost.stone.toLocaleString()} C</span></button>; })}</div>{comparison && selectedAlternative && <div className="v64-comparison"><b>{ko ? "이 경로를 대신 선택하면" : "If you choose this route"}</b><span>Gold {comparison.goldDelta > 0 ? "+" : ""}{comparison.goldDelta.toLocaleString()} · Core {comparison.stoneDelta > 0 ? "+" : ""}{comparison.stoneDelta.toLocaleString()} · Solar {comparison.solarCoreDelta > 0 ? "+" : ""}{comparison.solarCoreDelta.toLocaleString()}</span><button type="button" onClick={() => void requestExplanation(ko ? "선택한 대안이 추천 경로보다 덜 유리한 이유를 설명해줘." : "Explain why the selected alternative is less favorable.")}>{ko ? "AI에게 이유 묻기" : "Ask AI why"}</button></div>}</section>}
        {result && <details className="v64-analysis-details"><summary>{ko ? "분석 기준 상세" : "Analysis details"}</summary><dl><div><dt>{ko ? "클라이언트" : "Client"}</dt><dd>v{data.manifest.clientVersion}</dd></div><div><dt>{ko ? "데이터 해시" : "Data hash"}</dt><dd>{data.manifest.sourceSha256.slice(0, 12)}</dd></div><div><dt>{ko ? "탐색" : "Search"}</dt><dd>{result.search.algorithm} · {result.search.visitedStates.toLocaleString()}</dd></div><div><dt>{ko ? "메타" : "Meta"}</dt><dd>{meta ? `${meta.snapshotDate} · n=${meta.sampleSize}` : (ko ? "적용 안 함" : "Not applied")}</dd></div></dl>{result.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}</details>}
      </section>
    </div>
    <button className="v64-mobile-conditions" type="button" onClick={() => setControlsOpen(true)}>{ko ? "내 조건" : "Conditions"}</button>
    {notice && <div className="v64-notice" role="status">{notice}<button type="button" aria-label={ko ? "알림 닫기" : "Dismiss"} onClick={() => setNotice(undefined)}>×</button></div>}
  </main>;
}
