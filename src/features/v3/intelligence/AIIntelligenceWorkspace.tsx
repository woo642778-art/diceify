import { useEffect, useMemo, useRef, useState } from "react";
import type { CanonicalGameData, TreeCost } from "../../../game-data/types";
import type { SimulationInputV3 } from "../../../simulation/engine/types";
import { compareIntelligenceRoutesV63 } from "../../../intelligence/optimizer";
import { runIntelligenceOptimizerV63 } from "../../../intelligence/optimizerClient";
import {
  buildGroundedPromptV63,
  deterministicExplanationV63,
  parseDeterministicIntentV63,
  validateGroundedExplanationV63,
} from "../../../intelligence/grounding";
import { currentMetaEvidenceV63 } from "../../../intelligence/meta";
import { LOCAL_MODEL_OPTIONS_V63, localAiCapabilityV63, type LocalModelTierV63 } from "../../../intelligence/local-ai/modelCatalog";
import { deleteSavedIntelligenceV63, loadSavedIntelligenceV63, saveIntelligenceRecommendationV63 } from "../../../intelligence/storage";
import type { IntelligenceGoalV63, IntelligenceRequestV63, IntelligenceResultV63 } from "../../../intelligence/types";

interface AIIntelligenceWorkspaceProps {
  data: CanonicalGameData;
  locale: "ko" | "en";
  input: SimulationInputV3;
  resources: TreeCost;
  activeDeckIds: string[];
  onApplyRanks: (ranks: Record<string, number>) => void;
  onViewTree: (result: IntelligenceResultV63) => void;
  onInspectNode: (result: IntelligenceResultV63, nodeId: string) => void;
}

const GOALS: Array<{ id: IntelligenceGoalV63; ko: string; en: string }> = [
  { id: "basic-dps", ko: "기본 공격 DPS", en: "Basic attack DPS" },
  { id: "resource-efficiency", ko: "재화 효율", en: "Resource efficiency" },
  { id: "target-dice", ko: "목표 주사위 경로", en: "Target dice route" },
  { id: "pvp", ko: "대전", en: "PvP" },
  { id: "coop", ko: "협동", en: "Co-op" },
];

function money(cost: TreeCost) {
  return `${cost.gold.toLocaleString()} G · ${cost.stone.toLocaleString()} C · ${(cost.solarCore ?? 0).toLocaleString()} S`;
}

function nodeName(data: CanonicalGameData, nodeId: string, locale: "ko" | "en") {
  const node = data.tree.find((entry) => entry.id === nodeId);
  return node?.nameKey ? data.localization[locale][node.nameKey] ?? nodeId : nodeId;
}

export function AIIntelligenceWorkspace({ data, locale, input, resources, activeDeckIds, onApplyRanks, onViewTree, onInspectNode }: AIIntelligenceWorkspaceProps) {
  const ko = locale === "ko";
  const dataVersion = `${data.manifest.clientVersion}:${data.manifest.sourceSha256.slice(0, 12)}`;
  const [goal, setGoal] = useState<IntelligenceGoalV63>("target-dice");
  const [horizon, setHorizon] = useState(4);
  const [question, setQuestion] = useState(ko ? "지금 재화로 목표 주사위 경로 다음 4개를 어떻게 찍어야 해?" : "What are the next 4 purchases for my target dice?");
  const [result, setResult] = useState<IntelligenceResultV63 | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [explanation, setExplanation] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [modelTier, setModelTier] = useState<LocalModelTierV63>("lite");
  const [modelState, setModelState] = useState<"idle" | "loading" | "ready" | "generating" | "error">("idle");
  const [modelProgress, setModelProgress] = useState(0);
  const [modelProgressText, setModelProgressText] = useState("");
  const [modelCached, setModelCached] = useState(false);
  const [saved, setSaved] = useState(loadSavedIntelligenceV63);
  const calculationRun = useRef(0);
  const capability = useMemo(localAiCapabilityV63, []);
  const meta = useMemo(() => currentMetaEvidenceV63(data), [data]);
  const selectedModel = LOCAL_MODEL_OPTIONS_V63.find((entry) => entry.tier === modelTier)!;
  const diceName = data.dice.find((dice) => dice.id === input.diceId)?.nameKey;
  const localizedDice = diceName ? data.localization[locale][diceName] ?? input.diceId : input.diceId;

  useEffect(() => {
    calculationRun.current += 1;
    setCalculating(false);
    setResult(null);
    setExplanation(undefined);
  }, [dataVersion, input.diceId, input.treeRanks, resources.gold, resources.stone, resources.solarCore]);

  const request = (nextGoal = goal, nextHorizon = horizon): IntelligenceRequestV63 => ({
    schemaVersion: 1,
    dataVersion,
    input,
    resources,
    goal: nextGoal,
    maxPurchases: nextHorizon,
    activeDeckIds,
  });

  const calculate = async (nextGoal = goal, nextHorizon = horizon) => {
    const run = ++calculationRun.current;
    setCalculating(true);
    setNotice(undefined);
    try {
      const next = await runIntelligenceOptimizerV63(data, request(nextGoal, nextHorizon));
      if (calculationRun.current !== run) return;
      setResult(next);
      setExplanation(deterministicExplanationV63(next, locale));
    } catch (error) {
      if (calculationRun.current !== run) return;
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      if (calculationRun.current === run) setCalculating(false);
    }
  };

  const ask = async () => {
    let intent = parseDeterministicIntentV63(question);
    if (modelState === "ready") {
      try {
        const client = await import("../../../intelligence/local-ai/client");
        intent = await client.parseIntentWithLocalModelV63(question);
      } catch {
        setNotice(ko ? "로컬 의도 해석이 유효하지 않아 안전한 규칙 기반 해석을 사용했습니다." : "Local intent parsing was invalid, so the safe rule-based parser was used.");
      }
    }
    const nextGoal = intent.goal ?? goal;
    const nextHorizon = intent.maxPurchases ?? horizon;
    setGoal(nextGoal);
    setHorizon(nextHorizon);
    await calculate(nextGoal, nextHorizon);
  };

  const loadModel = async () => {
    if (!capability.supported) return;
    setModelState("loading");
    setModelProgress(0);
    try {
      const client = await import("../../../intelligence/local-ai/client");
      await client.startLocalModelV63(selectedModel, (progress) => {
        setModelProgress(Math.max(0, Math.min(1, progress.progress)));
        setModelProgressText(progress.text);
      });
      setModelState("ready");
      setModelCached(true);
    } catch (error) {
      setModelState("error");
      setModelProgressText(error instanceof Error ? error.message : String(error));
    }
  };

  const deleteModel = async () => {
    try {
      const client = await import("../../../intelligence/local-ai/client");
      await client.deleteLocalModelV63(selectedModel.modelId);
      setModelCached(false);
      setModelState("idle");
      setModelProgress(0);
      setModelProgressText(ko ? "브라우저 캐시에서 모델을 삭제했습니다." : "Deleted the model from browser cache.");
    } catch (error) {
      setModelState("error");
      setModelProgressText(error instanceof Error ? error.message : String(error));
    }
  };

  const explainLocally = async () => {
    if (!result || modelState !== "ready") return;
    setModelState("generating");
    try {
      const client = await import("../../../intelligence/local-ai/client");
      const generated = await client.explainWithLocalModelV63(buildGroundedPromptV63(question, result, locale));
      const grounded = validateGroundedExplanationV63(generated, result, data);
      if (!grounded.ok || !generated) {
        setExplanation(deterministicExplanationV63(result, locale));
        setNotice(ko ? "로컬 모델 답변에 근거 없는 수치가 있어 계산 엔진 설명으로 대체했습니다." : "The local answer introduced ungrounded facts, so the deterministic explanation was used.");
      } else setExplanation(generated);
      setModelState("ready");
    } catch (error) {
      setModelState("error");
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const save = () => {
    if (!result) return;
    const id = crypto.randomUUID();
    saveIntelligenceRecommendationV63({
      schemaVersion: 1,
      id,
      name: `${localizedDice} · ${GOALS.find((entry) => entry.id === goal)?.[locale]}`,
      savedAt: new Date().toISOString(),
      dataVersion,
      request: request(),
      result,
    });
    const nextSaved = loadSavedIntelligenceV63();
    setSaved(nextSaved);
    setNotice(ko ? `기기에 저장했습니다. 저장된 분석 ${nextSaved.length}개` : `Saved on this device. ${nextSaved.length} analyses stored.`);
  };

  const restoreSaved = (id: string) => {
    const entry = saved.find((candidate) => candidate.id === id);
    if (!entry || entry.dataVersion !== dataVersion) return;
    setGoal(entry.request.goal);
    setHorizon(entry.request.maxPurchases);
    setResult(entry.result);
    setExplanation(deterministicExplanationV63(entry.result, locale));
  };

  const removeSaved = (id: string) => {
    deleteSavedIntelligenceV63(id);
    setSaved(loadSavedIntelligenceV63());
  };

  const primary = result?.primary;
  const mainMetric = primary?.metrics.find((metric) => metric.absoluteGain > 0);
  const renderedExplanation = explanation?.split(/(\[node:[^\]]+\])/g).map((part, index) => {
    const match = part.match(/^\[node:([^\]]+)\]$/);
    if (!match || !result) return part;
    return <button className="v63-node-citation" type="button" key={`${part}:${index}`} onClick={() => onInspectNode(result, match[1])}>{part}</button>;
  });

  return <main className="v63-ai" data-testid="v63-ai-workspace">
    <header className="v63-ai-hero">
      <div><small>DICEIFY INTELLIGENCE · LOCAL FIRST</small><h1>{ko ? "결정의 근거를 먼저 계산합니다" : "Calculate the decision before explaining it"}</h1><p>{ko ? "숫자는 게임 엔진이 계산하고, 로컬 모델은 그 결과만 설명합니다. 모델이 비용이나 효율을 바꿀 수 없습니다." : "The game engine owns every number. The local model can only explain its result."}</p></div>
      <dl><div><dt>{ko ? "클라이언트" : "Client"}</dt><dd>v{data.manifest.clientVersion}</dd></div><div><dt>{ko ? "데이터 해시" : "Data hash"}</dt><dd>{data.manifest.sourceSha256.slice(0, 8)}</dd></div><div><dt>{ko ? "메타 표본" : "Meta sample"}</dt><dd>{meta ? `${meta.snapshotDate} · n=${meta.sampleSize}` : (ko ? "없음" : "None")}</dd></div></dl>
    </header>

    <div className="v63-ai-grid">
      <aside className="v63-ai-inputs">
        <section><small>01 · DECISION INPUT</small><h2>{ko ? "내 조건" : "My constraints"}</h2><div className="v63-context-chip"><span>{localizedDice}</span><b>{activeDeckIds.length}/5 DECK</b></div>
          <label>{ko ? "목표" : "Goal"}<select value={goal} onChange={(event) => setGoal(event.target.value as IntelligenceGoalV63)}>{GOALS.map((entry) => <option key={entry.id} value={entry.id}>{entry[locale]}</option>)}</select></label>
          <label>{ko ? "정확 탐색 범위" : "Exact search horizon"}<select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}>{[2,3,4,5,6].map((value) => <option key={value} value={value}>{ko ? `다음 ${value}회 구매` : `Next ${value} purchases`}</option>)}</select></label>
          <div className="v63-resource-stack"><span>{resources.gold.toLocaleString()} <i>GOLD</i></span><span>{resources.stone.toLocaleString()} <i>CORE</i></span><span>{(resources.solarCore ?? 0).toLocaleString()} <i>SOLAR</i></span></div>
          <button className="is-primary" type="button" disabled={calculating} onClick={() => void calculate()}>{calculating ? (ko ? "전체 경로 탐색 중" : "Searching all paths") : (ko ? "경로 계산" : "Calculate route")}</button>
        </section>
        <section className="v63-ai-command"><small>ASK DICEIFY</small><label><span>{ko ? "자연어로 조건 변경" : "Change constraints naturally"}</span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} /></label><button type="button" onClick={() => void ask()}>{ko ? "질문을 계산으로 변환" : "Convert question to calculation"}</button></section>
      </aside>

      <section className="v63-ai-route">
        <header><div><small>02 · EXACT ROUTE</small><h2>{primary ? (ko ? "우선 투자 경로" : "Priority investment route") : (ko ? "계산 대기" : "Waiting for calculation")}</h2></div>{result && <span className={`v63-confidence is-${primary?.confidence ?? "partial"}`}>{primary?.confidence === "verified" ? (ko ? "검증됨" : "Verified") : (ko ? "부분 검증" : "Partial")}</span>}</header>
        {!result && <div className="v63-empty"><b>01</b><p>{ko ? "목표와 탐색 범위를 정한 뒤 계산하세요. 입력 전에는 점수나 추천을 표시하지 않습니다." : "Set a goal and search horizon. No score or recommendation appears before calculation."}</p></div>}
        {result && !primary && <div className="v63-empty"><b>00</b><p>{result.search.visitedStates > 1
          ? (ko ? "실행 가능한 구매는 있지만, 현재 데이터로 검증된 성능 이득은 없습니다." : "Purchases are feasible, but the current data verifies no performance gain.")
          : (ko ? "현재 재화로 실행 가능한 경로가 없습니다." : "No route is feasible with the current resources.")}</p></div>}
        {primary && <>
          <div className="v63-route-metric"><div><small>{mainMetric ? (mainMetric.id === "practical-dps" ? "PRACTICAL DPS" : "BASIC ATTACK DPS") : "VERIFIED PERFORMANCE"}</small><strong>{mainMetric?.percentGain !== null && mainMetric?.percentGain !== undefined ? `+${mainMetric.percentGain.toFixed(2)}%` : (ko ? "수치 미확정" : "Not quantified")}</strong></div><div><small>TOTAL COST</small><strong>{money(primary.cost)}</strong></div></div>
          <ol className="v63-route-steps">{primary.steps.map((step, index) => <li key={`${step.nodeId}:${step.toRank}`}><span>{String(index + 1).padStart(2,"0")}</span><div><b>{nodeName(data, step.nodeId, locale)}</b><small>{step.fromRank} → {step.toRank} · {money(step.cost)}</small></div><button type="button" onClick={() => onInspectNode(result, step.nodeId)}>{ko ? "트리" : "Tree"}</button></li>)}</ol>
          <div className="v63-route-actions"><button type="button" onClick={() => onViewTree(result)}>{ko ? "트리 오버레이" : "Tree overlay"}</button><button type="button" onClick={save}>{ko ? "분석 저장" : "Save analysis"}</button><button className="is-primary" type="button" onClick={() => onApplyRanks(primary.rankChanges)}>{ko ? "가상 계획에 적용" : "Apply to plan"}</button></div>
        </>}
        {result && <footer className="v63-search-proof"><span className={result.search.complete ? "" : "is-limited"}>{result.search.complete ? (ko ? "완전 탐색" : "Complete search") : (ko ? "범위 제한" : "Search capped")}</span><b>{result.search.visitedStates.toLocaleString()} states</b><small>{result.search.scope} · {result.search.elapsedMs.toFixed(1)} ms</small></footer>}
      </section>

      <aside className="v63-ai-analysis">
        <section><small>03 · EVIDENCE</small><h2>{ko ? "왜 이 경로인가" : "Why this route"}</h2><p className="v63-explanation">{renderedExplanation ?? (ko ? "계산 후 비용, 선행 조건, 확인 가능한 성능 변화만 설명합니다." : "Only verified costs, prerequisites, and measurable changes are explained after calculation.")}</p>
          {result?.limitations.map((limitation) => <p className="v63-limitation" key={limitation}>{limitation}</p>)}
        </section>
        {result && <section><small>ALTERNATIVES · TRADE-OFFS</small><div className="v63-alternatives">{result.alternatives.length ? result.alternatives.map((route, index) => { const compared = primary ? compareIntelligenceRoutesV63(route, primary) : null; return <article key={route.id}><b>{ko ? `대안 ${index + 1}` : `Alternative ${index + 1}`}</b><span>{money(route.cost)}</span><small>{result.goal === "target-dice"
          ? (ko ? "동일 목표 도달 · 비용 구조 비교" : "Same target · compare cost mix")
          : compared?.scoreDelta == null
            ? (ko ? "성능 비교 미확정" : "Performance comparison unavailable")
            : `${compared.scoreDelta > 0 ? "+" : ""}${compared.scoreDelta.toFixed(2)} score`}</small></article>; }) : <p>{ko ? "동일 조건의 비지배 대안이 없습니다." : "No non-dominated alternative in this scope."}</p>}</div></section>}
        {result && <section className="v63-breakpoint"><small>RESOURCE FRONTIER</small><h3>{result.breakpoint.decision === "spend" ? (ko ? "지금 투자 가능" : "Spend now") : result.breakpoint.decision === "save" ? (ko ? "다음 경계까지 모으기" : "Save to the next frontier") : (ko ? "검증값 대기" : "Await verified metrics")}</h3>{result.breakpoint.nextCost && <p>{ko ? "최소 부족분" : "Minimum shortage"}: {money(result.breakpoint.shortage)}</p>}</section>}
        <section className="v63-local-model"><small>LOCAL EXPLANATION MODEL</small><h2>{ko ? "기기 안에서만 설명" : "Explain on this device"}</h2><select value={modelTier} disabled={modelState === "loading" || modelState === "generating"} onChange={(event) => setModelTier(event.target.value as LocalModelTierV63)}>{LOCAL_MODEL_OPTIONS_V63.map((model) => <option key={model.tier} value={model.tier}>{model.label}</option>)}</select><p>{selectedModel.approximateDownload} · {selectedModel.license}</p>
          {!capability.supported ? <p className="v63-limitation">{capability.reason} {ko ? "계산 엔진 설명을 사용합니다." : "Using the deterministic explanation."}</p> : modelState === "ready" || modelState === "generating" ? <button type="button" disabled={!result || modelState === "generating"} onClick={() => void explainLocally()}>{modelState === "generating" ? (ko ? "설명 생성 중" : "Generating") : (ko ? "로컬 모델로 다시 설명" : "Explain with local model")}</button> : <button type="button" disabled={modelState === "loading"} onClick={() => void loadModel()}>{modelState === "loading" ? (ko ? `다운로드 ${Math.round(modelProgress * 100)}%` : `Downloading ${Math.round(modelProgress * 100)}%`) : (ko ? "모델 다운로드 및 시작" : "Download and start")}</button>}
          {modelCached && <button className="v63-delete-model" type="button" onClick={() => void deleteModel()}>{ko ? "다운로드한 모델 삭제" : "Delete downloaded model"}</button>}
          {modelProgressText && <small className="v63-model-progress">{modelProgressText}</small>}
        </section>
        {saved.length > 0 && <section className="v63-saved"><small>SAVED · VERSIONED</small><h2>{ko ? "저장한 분석" : "Saved analyses"}</h2>{saved.slice(0,4).map((entry) => { const current = entry.dataVersion === dataVersion; return <article key={entry.id}><div><b>{entry.name}</b><small>{current ? new Date(entry.savedAt).toLocaleDateString(locale) : (ko ? "데이터 업데이트로 다시 계산 필요" : "Recalculation required after data update")}</small></div><button type="button" disabled={!current} onClick={() => restoreSaved(entry.id)}>{ko ? "열기" : "Open"}</button><button type="button" onClick={() => removeSaved(entry.id)}>{ko ? "삭제" : "Delete"}</button></article>; })}</section>}
      </aside>
    </div>
    {meta && <footer className="v63-meta-disclosure"><b>{ko ? "메타 정보 범위" : "Meta evidence scope"}</b><span>{meta.limitation}</span><small>v{meta.clientVersion} · {meta.source} · {meta.snapshotDate} · n={meta.sampleSize}</small></footer>}
    {notice && <div className="v63-notice" role="status">{notice}</div>}
  </main>;
}
