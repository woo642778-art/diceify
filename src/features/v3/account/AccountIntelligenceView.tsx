import { useMemo, useState } from "react";
import { analyzeBuildHealthV48 } from "../../../account/buildHealthV48";
import type { UserDigitalTwinV48 } from "../../../account/digitalTwinV48";
import {
  CO_OP_RANKING_SNAPSHOT,
  CO_OP_RANKING_SNAPSHOT_DATE,
} from "../../../deck-lab/coOpRankingSnapshot";
import {
  buildDiceKnowledgeV48,
  searchDiceKnowledgeV48,
} from "../../../deck-lab/diceKnowledgeV48";
import {
  clusterMetaDecksV48,
  metaEnvironmentScoresV48,
} from "../../../deck-lab/metaIntelligenceV48";
import type { CanonicalGameData } from "../../../game-data/types";
import {
  compareCoreBudgetsV48,
  optimizeNextActionsV48,
  solveTargetPerformanceV48,
  type ReversePlanV48,
} from "../../../optimizer/accountOptimizerV48";
import type { PlannerStateV3 } from "../../../planner-v3/types";
import {
  projectResources,
  simulatedInvestmentCost,
} from "../../../planner-v3/costs";
import type { SimulationInputV3 } from "../../../simulation/engine/types";
import { DiceIcon } from "../shared/DiceIcon";
import type {
  FullAccountImportV49,
  ObservedAccountV49,
} from "../../../account/accountImportV49";
import { AccountImportPanelV49 } from "./AccountImportPanelV49";
import type { ScreenshotAccountDraftV52 } from "../../../account/screenshotImportV52";
import { OptimizationSuiteV52 } from "./OptimizationSuiteV52";

type AccountSection = "overview" | "optimizer" | "knowledge" | "meta";

const LABELS = {
  "predator-carry": { ko: "포식 중심 딜러", en: "Predator carry" },
  "control-support": { ko: "제어 서포트", en: "Control support" },
  "alternative-carry": { ko: "대체 딜러", en: "Alternative carry" },
  hybrid: { ko: "하이브리드", en: "Hybrid" },
} as const;

function Confidence({
  value,
  locale,
}: {
  value: "verified" | "partial" | "unavailable";
  locale: "ko" | "en";
}) {
  const label =
    value === "verified"
      ? locale === "ko"
        ? "검증"
        : "Verified"
      : value === "partial"
        ? locale === "ko"
          ? "부분 검증"
          : "Partial"
        : locale === "ko"
          ? "데이터 필요"
          : "Data needed";
  return <span className={`v48-confidence is-${value}`}>{label}</span>;
}

function diceName(
  data: CanonicalGameData,
  diceId: string,
  locale: "ko" | "en",
) {
  const dice = data.dice.find((entry) => entry.id === diceId);
  return dice?.nameKey
    ? (data.localization[locale][dice.nameKey] ?? diceId)
    : diceId;
}

export function AccountIntelligenceView({
  data,
  locale,
  state,
  input,
  deckIds,
  twin,
  onTwinChange,
  onApplyRanks,
  onDeckChange,
  onLocalAccount,
  onObservedAccountImport,
  onFullAccountImport,
  onScreenshotImport,
  onOpenTree,
  onOpenSimulator,
}: {
  data: CanonicalGameData;
  locale: "ko" | "en";
  state: PlannerStateV3;
  input: SimulationInputV3;
  deckIds: string[];
  twin: UserDigitalTwinV48;
  onTwinChange: (next: UserDigitalTwinV48) => void;
  onApplyRanks: (ranks: Record<string, number>) => void;
  onDeckChange: (diceIds: string[]) => void;
  onLocalAccount: (nickname: string, pid?: string) => "loaded" | "created";
  onObservedAccountImport: (account: ObservedAccountV49) => void;
  onFullAccountImport: (account: FullAccountImportV49) => void;
  onScreenshotImport: (draft: ScreenshotAccountDraftV52) => void;
  onOpenTree: () => void;
  onOpenSimulator: () => void;
}) {
  const [section, setSection] = useState<AccountSection>("overview");
  const [targetGain, setTargetGain] = useState(
    Math.max(1, twin.goal.targetGainPercent ?? 10),
  );
  const [reversePlan, setReversePlan] = useState<ReversePlanV48>();
  const [budgetPlans, setBudgetPlans] =
    useState<ReturnType<typeof compareCoreBudgetsV48>>();
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeId, setKnowledgeId] = useState(input.diceId);
  const health = useMemo(
    () => analyzeBuildHealthV48(data, state, deckIds, input),
    [data, deckIds, input, state],
  );
  const actions = useMemo(
    () =>
      optimizeNextActionsV48(input, data, deckIds, {
        bannedNodeIds: twin.preferences.bannedNodeIds,
        bannedDiceIds: twin.preferences.bannedDiceIds,
        lockedDiceIds: twin.preferences.lockedDiceIds,
      }),
    [
      data,
      deckIds,
      input,
      twin.preferences.bannedDiceIds,
      twin.preferences.bannedNodeIds,
      twin.preferences.lockedDiceIds,
    ],
  );
  const knowledgeResults = useMemo(
    () => searchDiceKnowledgeV48(data, knowledgeQuery).slice(0, 12),
    [data, knowledgeQuery],
  );
  const knowledge = useMemo(
    () => buildDiceKnowledgeV48(data, knowledgeId),
    [data, knowledgeId],
  );
  const clusters = useMemo(
    () => clusterMetaDecksV48(CO_OP_RANKING_SNAPSHOT),
    [],
  );
  const environment = useMemo(
    () => metaEnvironmentScoresV48(CO_OP_RANKING_SNAPSHOT),
    [],
  );
  const targetInput = useMemo(
    () => ({ ...input, diceId: twin.goal.targetDiceId }),
    [input, twin.goal.targetDiceId],
  );
  const projectedResources = useMemo(
    () =>
      projectResources(
        state.inventory,
        simulatedInvestmentCost(data.tree, state),
      ),
    [data.tree, state],
  );
  const remainingGold = Math.max(0, projectedResources.remaining.gold);
  const remainingCore = Math.max(0, projectedResources.remaining.stone);
  const topAction = actions.find(
    (action) => !action.dominated && action.kind !== "data-required",
  );
  const primaryDeck = twin.decks.find((deck) => deck.id === twin.primaryDeckId);
  const accountConnected = Boolean(twin.identity);

  const patchGoal = (patch: Partial<UserDigitalTwinV48["goal"]>) =>
    onTwinChange({ ...twin, goal: { ...twin.goal, ...patch } });
  const patchResources = (patch: Partial<UserDigitalTwinV48["resources"]>) =>
    onTwinChange({ ...twin, resources: { ...twin.resources, ...patch } });
  const patchPreferences = (
    patch: Partial<UserDigitalTwinV48["preferences"]>,
  ) =>
    onTwinChange({ ...twin, preferences: { ...twin.preferences, ...patch } });
  const runReverse = () => {
    const plan = solveTargetPerformanceV48(targetInput, data, {
      targetGainPercent: targetGain,
      budget: { gold: remainingGold, stone: remainingCore },
      bannedNodeIds: twin.preferences.bannedNodeIds,
      maxSteps: 10,
    });
    setReversePlan(plan);
    patchGoal({ targetGainPercent: targetGain });
  };

  return (
    <main className="v48-account" data-testid="v48-account-intelligence">
      <header className="v48-account-hero">
        <div>
          <small>ACCOUNT DIGITAL TWIN · V4.9</small>
          <h1>
            {locale === "ko" ? "내 계정 인텔리전스" : "Account Intelligence"}
          </h1>
          <p>
            {locale === "ko"
              ? "트리, 덱, 재화, 목표를 하나의 상태로 묶어 다음 행동을 계산합니다."
              : "One state connects your tree, deck, resources, and goals to calculate the next action."}
          </p>
          {twin.identity && (
            <div className="v49-identity-chip">
              <b>{twin.identity.nickname}</b>
              {twin.identity.publicRank && (
                <span>#{twin.identity.publicRank}</span>
              )}
              {twin.identity.pid && <small>PID {twin.identity.pid}</small>}
              <em>
                {twin.identity.source === "verified-import"
                  ? locale === "ko"
                    ? "검증된 가져오기"
                    : "Verified import"
                  : twin.identity.source === "local-profile"
                    ? locale === "ko"
                      ? "이 브라우저 계정"
                      : "Browser account"
                    : locale === "ko"
                      ? "관측 랭킹"
                      : "Observed ranking"}
              </em>
            </div>
          )}
        </div>
        <div
          className={`v48-health-orbit ${accountConnected ? "" : "is-disconnected"}`}
          data-score={accountConnected ? health.score : undefined}
          style={
            {
              "--score": accountConnected ? health.score : 0,
            } as React.CSSProperties
          }
        >
          <strong>{accountConnected ? health.score : "—"}</strong>
          <span>
            {accountConnected
              ? locale === "ko"
                ? "입력 상태 평가"
                : "Input-state score"
              : locale === "ko"
                ? "계정 미연결"
                : "Not connected"}
          </span>
          <Confidence
            value={accountConnected ? health.confidence : "unavailable"}
            locale={locale}
          />
        </div>
      </header>

      <nav
        className="v48-account-nav"
        aria-label={
          locale === "ko" ? "계정 분석 메뉴" : "Account analysis menu"
        }
      >
        {(
          ["overview", "optimizer", "knowledge", "meta"] as AccountSection[]
        ).map((item) => (
          <button
            key={item}
            type="button"
            className={section === item ? "is-active" : ""}
            onClick={() => setSection(item)}
          >
            {item === "overview"
              ? locale === "ko"
                ? "대시보드"
                : "Dashboard"
              : item === "optimizer"
                ? locale === "ko"
                  ? "전역 최적화"
                  : "Global optimizer"
                : item === "knowledge"
                  ? locale === "ko"
                    ? "주사위 백과"
                    : "Dice encyclopedia"
                  : locale === "ko"
                    ? "메타 인텔리전스"
                    : "Meta intelligence"}
          </button>
        ))}
      </nav>

      {section === "overview" && (
        <div className="v48-overview-grid">
          <AccountImportPanelV49
            data={data}
            locale={locale}
            state={state}
            deckIds={deckIds}
            onLocalAccount={onLocalAccount}
            onObservedImport={onObservedAccountImport}
            onFullImport={onFullAccountImport}
            onScreenshotImport={onScreenshotImport}
          />
          {!accountConnected && (
            <section
              className="v48-command-card v59-account-locked"
              data-testid="v59-account-locked"
            >
              <header>
                <small>
                  {locale === "ko" ? "분석 대기" : "ANALYSIS LOCKED"}
                </small>
                <Confidence value="unavailable" locale={locale} />
              </header>
              <h2>
                {locale === "ko"
                  ? "계정 상태를 먼저 연결하세요"
                  : "Connect an account state first"}
              </h2>
              <p>
                {locale === "ko"
                  ? "닉네임·PID로 브라우저 프로필을 만들거나, 스크린샷·검증 JSON으로 실제 트리와 재화를 입력한 뒤에만 평가 점수와 추천을 계산합니다."
                  : "Create a browser profile with nickname and PID, or import screenshots or validated JSON. Scores and recommendations appear only after account state is connected."}
              </p>
            </section>
          )}
          {accountConnected && (
            <>
              <section className="v48-command-card is-primary">
                <header>
                  <small>
                    {locale === "ko" ? "지금 할 일" : "NEXT DECISION"}
                  </small>
                  <Confidence
                    value={topAction?.confidence ?? "unavailable"}
                    locale={locale}
                  />
                </header>
                <h2>
                  {topAction?.title[locale] ??
                    (locale === "ko"
                      ? "계정 데이터를 더 입력하세요"
                      : "Add more account data")}
                </h2>
                <p>
                  {topAction?.reason[locale] ??
                    (locale === "ko"
                      ? "보유 트리와 덱을 입력하면 다음 행동을 계산합니다."
                      : "Enter the owned tree and deck to calculate your next action.")}
                </p>
                <div>
                  {topAction ? (
                    <>
                      <b>+{topAction.gain.toFixed(2)}</b>
                      <span>
                        {topAction.kind === "tree"
                          ? "% DPS"
                          : locale === "ko"
                            ? "점 구성"
                            : " comp score"}
                      </span>
                      <em>
                        {topAction.cost.gold.toLocaleString()} G ·{" "}
                        {topAction.cost.stone} C
                      </em>
                    </>
                  ) : null}
                </div>
                {topAction?.payload?.targetRanks && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyRanks(topAction.payload!.targetRanks!);
                      onOpenTree();
                    }}
                  >
                    {locale === "ko" ? "트리에 미리 적용" : "Preview on tree"}
                  </button>
                )}
              </section>

              <section className="v48-command-card">
                <header>
                  <small>
                    {locale === "ko" ? "빌드 진단" : "BUILD DIAGNOSTIC"}
                  </small>
                  <strong>{health.issues.length}</strong>
                </header>
                <div className="v48-issue-list">
                  {health.issues.length ? (
                    health.issues.slice(0, 4).map((issue) => (
                      <article
                        key={issue.code}
                        className={`is-${issue.severity}`}
                      >
                        <b>{issue.title[locale]}</b>
                        <p>{issue.detail[locale]}</p>
                      </article>
                    ))
                  ) : (
                    <p>
                      {locale === "ko"
                        ? "현재 입력에서 큰 구조적 병목을 찾지 못했습니다."
                        : "No major structural bottleneck was found."}
                    </p>
                  )}
                </div>
              </section>

              <section className="v48-command-card">
                <header>
                  <small>
                    {locale === "ko" ? "내 디지털 트윈" : "MY DIGITAL TWIN"}
                  </small>
                  <span>{primaryDeck?.diceIds.length ?? 0}/5</span>
                </header>
                <div className="v48-deck-row">
                  {(primaryDeck?.diceIds ?? deckIds).map((diceId) => (
                    <DiceIcon
                      key={diceId}
                      diceId={diceId}
                      label={diceName(data, diceId, locale)}
                    />
                  ))}
                </div>
                <dl>
                  <div>
                    <dt>{locale === "ko" ? "트리 투자" : "Tree invested"}</dt>
                    <dd>
                      {health.invested.gold.toLocaleString()} G ·{" "}
                      {health.invested.stone} C
                    </dd>
                  </div>
                  <div>
                    <dt>{locale === "ko" ? "실전 DPS" : "Practical DPS"}</dt>
                    <dd>
                      {health.practicalDps === null
                        ? locale === "ko"
                          ? "미확정"
                          : "Unresolved"
                        : health.practicalDps.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                    </dd>
                  </div>
                  <div>
                    <dt>{locale === "ko" ? "덱 점수" : "Deck score"}</dt>
                    <dd>{health.deck.scores.overall}/100</dd>
                  </div>
                </dl>
                <button type="button" onClick={onOpenSimulator}>
                  {locale === "ko" ? "현재 빌드 검증" : "Test current build"}
                </button>
              </section>

              <section className="v48-command-card">
                <header>
                  <small>
                    {locale === "ko" ? "성장 속도" : "RESOURCE FORECAST"}
                  </small>
                  <span>{locale === "ko" ? "로컬 저장" : "Local"}</span>
                </header>
                <label>
                  {locale === "ko" ? "하루 골드 수급" : "Daily Gold"}
                  <input
                    type="number"
                    min="0"
                    value={twin.resources.dailyGold}
                    onChange={(event) =>
                      patchResources({
                        dailyGold: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                  />
                </label>
                <label>
                  {locale === "ko" ? "하루 코어 수급" : "Daily Core"}
                  <input
                    type="number"
                    min="0"
                    value={twin.resources.dailyCore}
                    onChange={(event) =>
                      patchResources({
                        dailyCore: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                  />
                </label>
                <p>
                  {locale === "ko"
                    ? "목표 역산 결과가 나오면 구매와 기다리기의 도달 시간을 같은 기준으로 비교합니다."
                    : "After reverse planning, purchase and wait time are compared on the same target."}
                </p>
              </section>
            </>
          )}
        </div>
      )}

      {section === "optimizer" && !accountConnected && (
        <div className="v48-optimizer-layout">
          <section className="v48-command-card v59-account-locked">
            <header>
              <small>
                {locale === "ko" ? "전역 최적화 대기" : "OPTIMIZER LOCKED"}
              </small>
              <Confidence value="unavailable" locale={locale} />
            </header>
            <h2>
              {locale === "ko"
                ? "대시보드에서 계정을 먼저 연결하세요"
                : "Connect an account from the dashboard first"}
            </h2>
            <p>
              {locale === "ko"
                ? "기본 예시 상태를 실제 계정처럼 평가하지 않습니다. 입력 근거가 생기면 목표 역산과 다음 행동 계산을 활성화합니다."
                : "The starter example is never evaluated as a real account. Target solvers activate after an account state is supplied."}
            </p>
            <button type="button" onClick={() => setSection("overview")}>
              {locale === "ko" ? "계정 연결로 이동" : "Go to account connect"}
            </button>
          </section>
        </div>
      )}
      {section === "optimizer" && accountConnected && (
        <div className="v48-optimizer-layout">
          <OptimizationSuiteV52
            data={data}
            locale={locale}
            state={state}
            input={input}
            deckIds={deckIds}
            twin={twin}
            onTwinChange={onTwinChange}
            onApplyRanks={onApplyRanks}
          />
          <section className="v48-target-console">
            <header>
              <div>
                <small>GOAL BACKSOLVER</small>
                <h2>
                  {locale === "ko"
                    ? "목표 성능 역산"
                    : "Target performance solver"}
                </h2>
              </div>
              <Confidence
                value={
                  reversePlan?.stopReason === "unverified"
                    ? "unavailable"
                    : "verified"
                }
                locale={locale}
              />
            </header>
            <div className="v48-goal-inputs">
              <label>
                {locale === "ko" ? "목표 주사위" : "Target dice"}
                <select
                  value={twin.goal.targetDiceId}
                  onChange={(event) =>
                    patchGoal({ targetDiceId: event.target.value })
                  }
                >
                  {data.dice
                    .filter((dice) => dice.nameKey)
                    .map((dice) => (
                      <option key={dice.id} value={dice.id}>
                        {diceName(data, dice.id, locale)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {locale === "ko" ? "목표 성능 증가" : "Target gain"}
                <span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={targetGain}
                    onChange={(event) =>
                      setTargetGain(
                        Math.max(1, Number(event.target.value) || 1),
                      )
                    }
                  />
                  %
                </span>
              </label>
              <label>
                {locale === "ko" ? "사용 가능 예산" : "Available budget"}
                <span>
                  {remainingGold.toLocaleString()} G ·{" "}
                  {remainingCore.toLocaleString()} C
                </span>
              </label>
              <label>
                {locale === "ko" ? "제외할 노드" : "Excluded nodes"}
                <input
                  type="text"
                  value={twin.preferences.bannedNodeIds.join(", ")}
                  onChange={(event) =>
                    patchPreferences({
                      bannedNodeIds: [
                        ...new Set(
                          event.target.value
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                        ),
                      ],
                    })
                  }
                  placeholder={
                    locale === "ko" ? "예: 1205, 2004" : "Example: 1205, 2004"
                  }
                />
              </label>
              <button type="button" onClick={runReverse}>
                {locale === "ko" ? "역산 시작" : "Solve backwards"}
              </button>
            </div>
            {reversePlan && (
              <div
                className="v48-reverse-result"
                data-testid="v48-reverse-result"
              >
                <div className="v48-result-meter">
                  <strong>{reversePlan.achievedGainPercent.toFixed(2)}%</strong>
                  <span>
                    {reversePlan.reached
                      ? locale === "ko"
                        ? "목표 달성"
                        : "Target reached"
                      : locale === "ko"
                        ? "현재 예산에서 도달"
                        : "Reached within budget"}
                  </span>
                  <em>
                    {reversePlan.totalCost.gold.toLocaleString()} G ·{" "}
                    {reversePlan.totalCost.stone} C
                  </em>
                </div>
                {reversePlan.stopReason === "unverified" ? (
                  <p className="v48-data-gap">
                    {locale === "ko"
                      ? "선택한 주사위의 실전 공식이 검증되지 않아 역산 수치를 만들지 않았습니다. 시뮬레이터의 계산 트레이스에서 누락 항목을 확인할 수 있습니다."
                      : "The practical formula is unresolved, so no reverse-solved number was fabricated. Inspect missing items in the simulator trace."}
                  </p>
                ) : (
                  <ol>
                    {reversePlan.steps.map((step) => (
                      <li key={`${step.order}:${step.nodeId}`}>
                        <b>{step.order}</b>
                        <span>
                          {locale === "ko"
                            ? `노드 ${step.nodeId}`
                            : `Node ${step.nodeId}`}
                        </span>
                        <strong>+{step.gainPercent.toFixed(2)}%</strong>
                        <small>
                          {step.cumulativeCost.gold.toLocaleString()} G ·{" "}
                          {step.cumulativeCost.stone} C
                        </small>
                      </li>
                    ))}
                  </ol>
                )}
                <small className="v48-search-disclosure">
                  {locale === "ko"
                    ? `검증된 다음 행동을 비용 효율 순으로 최대 10단계 탐색했습니다. 미검증 공식은 후보에서 제외되므로 전수 최적해를 보장하지 않습니다. 탐색 라운드 ${reversePlan.evaluatedRounds}회.`
                    : `Searched up to 10 verified next actions by cost efficiency. Unverified formulas are excluded, so this is not claimed as an exhaustive optimum. ${reversePlan.evaluatedRounds} rounds evaluated.`}
                </small>
                {reversePlan.steps.at(-1)?.targetRanks && (
                  <button
                    type="button"
                    onClick={() =>
                      onApplyRanks(reversePlan.steps.at(-1)!.targetRanks)
                    }
                  >
                    {locale === "ko"
                      ? "전체 경로를 트리에 미리 적용"
                      : "Preview full route on tree"}
                  </button>
                )}
                {(twin.resources.dailyGold > 0 ||
                  twin.resources.dailyCore > 0) &&
                  !reversePlan.reached && (
                    <p>
                      {locale === "ko"
                        ? `현재 수급 기준 예상 대기: 약 ${Math.max(Math.ceil(Math.max(0, reversePlan.totalCost.gold - remainingGold) / Math.max(1, twin.resources.dailyGold)), Math.ceil(Math.max(0, reversePlan.totalCost.stone - remainingCore) / Math.max(1, twin.resources.dailyCore)))}일`
                        : "Wait-time estimate uses your entered daily income."}
                    </p>
                  )}
              </div>
            )}
          </section>

          <section className="v48-pareto-board">
            <header>
              <div>
                <small>PARETO FRONTIER</small>
                <h2>
                  {locale === "ko"
                    ? "계정 전체 다음 행동"
                    : "Account-wide next actions"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() =>
                  setBudgetPlans(
                    compareCoreBudgetsV48(
                      targetInput,
                      data,
                      Math.max(remainingGold, 1_000_000),
                      25,
                    ),
                  )
                }
              >
                {locale === "ko"
                  ? "100·300·500 코어 비교"
                  : "Compare 100·300·500 Core"}
              </button>
            </header>
            <div className="v48-action-list">
              {actions.slice(0, 10).map((action) => (
                <article
                  key={action.id}
                  className={`${action.dominated ? "is-dominated" : "is-frontier"} is-${action.kind}`}
                >
                  <header>
                    <span>
                      {action.kind === "tree"
                        ? locale === "ko"
                          ? "트리"
                          : "Tree"
                        : action.kind === "deck"
                          ? locale === "ko"
                            ? "덱"
                            : "Deck"
                          : action.kind === "save"
                            ? locale === "ko"
                              ? "저장"
                              : "Save"
                            : locale === "ko"
                              ? "제외됨"
                              : "Excluded"}
                    </span>
                    <Confidence value={action.confidence} locale={locale} />
                  </header>
                  <h3>{action.title[locale]}</h3>
                  <p>{action.reason[locale]}</p>
                  <footer>
                    <strong>
                      {action.gain > 0
                        ? `+${action.gain.toFixed(2)}${action.gainUnit === "percent-dps" ? "%" : locale === "ko" ? "점" : " pts"}`
                        : "—"}
                    </strong>
                    <span>
                      {action.cost.gold.toLocaleString()} G ·{" "}
                      {action.cost.stone} C
                    </span>
                    {action.payload?.targetRanks && (
                      <button
                        type="button"
                        onClick={() =>
                          onApplyRanks(action.payload!.targetRanks!)
                        }
                      >
                        {locale === "ko" ? "적용" : "Apply"}
                      </button>
                    )}
                    {action.payload?.slot !== undefined &&
                      action.payload.diceId && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = [...deckIds];
                            next[action.payload!.slot!] =
                              action.payload!.diceId!;
                            onDeckChange(next);
                          }}
                        >
                          {locale === "ko" ? "교체" : "Replace"}
                        </button>
                      )}
                  </footer>
                </article>
              ))}
            </div>
            {budgetPlans && (
              <div className="v48-budget-scenarios">
                {budgetPlans.map(({ core, plan }) => (
                  <article key={core}>
                    <strong>{core} C</strong>
                    <span>{plan.achievedGainPercent.toFixed(2)}%</span>
                    <small>
                      {plan.totalCost.gold.toLocaleString()} G ·{" "}
                      {plan.steps.length}
                      {locale === "ko" ? "단계" : " steps"}
                    </small>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {section === "knowledge" && (
        <div className="v48-knowledge-layout">
          <aside>
            <header>
              <small>DICE ENCYCLOPEDIA</small>
              <h2>
                {locale === "ko"
                  ? "이 주사위 왜 쓰는 거야?"
                  : "Why use this dice?"}
              </h2>
            </header>
            <input
              aria-label={
                locale === "ko" ? "백과사전 검색" : "Encyclopedia search"
              }
              value={knowledgeQuery}
              onChange={(event) => setKnowledgeQuery(event.target.value)}
              placeholder={
                locale === "ko"
                  ? "이름·역할·효과 검색"
                  : "Search name, role, effect"
              }
            />
            <div>
              {knowledgeResults.map((entry) => (
                <button
                  key={entry.diceId}
                  type="button"
                  className={entry.diceId === knowledgeId ? "is-active" : ""}
                  onClick={() => setKnowledgeId(entry.diceId)}
                >
                  <DiceIcon diceId={entry.diceId} label={entry.name[locale]} />
                  <span>
                    <b>{entry.name[locale]}</b>
                    <small>{entry.roles.join(" · ")}</small>
                  </span>
                </button>
              ))}
            </div>
          </aside>
          {knowledge && (
            <section className="v48-knowledge-detail">
              <header>
                <DiceIcon
                  diceId={knowledge.diceId}
                  label={knowledge.name[locale]}
                />
                <div>
                  <small>{knowledge.roles.join(" · ")}</small>
                  <h2>{knowledge.name[locale]}</h2>
                </div>
                <Confidence value={knowledge.confidence} locale={locale} />
              </header>
              <div className="v48-roster-controls">
                <label>
                  <input
                    type="checkbox"
                    checked={twin.roster[knowledge.diceId]?.owned ?? false}
                    onChange={(event) =>
                      onTwinChange({
                        ...twin,
                        roster: {
                          ...twin.roster,
                          [knowledge.diceId]: {
                            owned: event.target.checked,
                            level: twin.roster[knowledge.diceId]?.level ?? 1,
                          },
                        },
                      })
                    }
                  />
                  {locale === "ko" ? "보유" : "Owned"}
                </label>
                <label>
                  {locale === "ko" ? "레벨" : "Level"}
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={twin.roster[knowledge.diceId]?.level ?? 1}
                    onChange={(event) =>
                      onTwinChange({
                        ...twin,
                        roster: {
                          ...twin.roster,
                          [knowledge.diceId]: {
                            owned: true,
                            level: Math.max(1, Number(event.target.value) || 1),
                          },
                        },
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  className={
                    twin.preferences.lockedDiceIds.includes(knowledge.diceId)
                      ? "is-active"
                      : ""
                  }
                  onClick={() =>
                    patchPreferences({
                      lockedDiceIds: twin.preferences.lockedDiceIds.includes(
                        knowledge.diceId,
                      )
                        ? twin.preferences.lockedDiceIds.filter(
                            (id) => id !== knowledge.diceId,
                          )
                        : [...twin.preferences.lockedDiceIds, knowledge.diceId],
                      bannedDiceIds: twin.preferences.bannedDiceIds.filter(
                        (id) => id !== knowledge.diceId,
                      ),
                    })
                  }
                >
                  {locale === "ko" ? "교체 금지" : "Lock in deck"}
                </button>
                <button
                  type="button"
                  className={
                    twin.preferences.bannedDiceIds.includes(knowledge.diceId)
                      ? "is-danger"
                      : ""
                  }
                  onClick={() =>
                    patchPreferences({
                      bannedDiceIds: twin.preferences.bannedDiceIds.includes(
                        knowledge.diceId,
                      )
                        ? twin.preferences.bannedDiceIds.filter(
                            (id) => id !== knowledge.diceId,
                          )
                        : [...twin.preferences.bannedDiceIds, knowledge.diceId],
                      lockedDiceIds: twin.preferences.lockedDiceIds.filter(
                        (id) => id !== knowledge.diceId,
                      ),
                    })
                  }
                >
                  {locale === "ko" ? "추천 제외" : "Exclude"}
                </button>
              </div>
              <p className="v48-effect-copy">{knowledge.summary[locale]}</p>
              <div className="v48-knowledge-columns">
                <article>
                  <h3>{locale === "ko" ? "강점" : "Strengths"}</h3>
                  {knowledge.strengths[locale].map((value) => (
                    <p key={value}>{value}</p>
                  ))}
                </article>
                <article>
                  <h3>{locale === "ko" ? "약점" : "Weaknesses"}</h3>
                  {knowledge.weaknesses[locale].map((value) => (
                    <p key={value}>{value}</p>
                  ))}
                </article>
              </div>
              <div className="v48-pair-grid">
                <article>
                  <h3>
                    {locale === "ko"
                      ? "함께 쓰기 좋은 주사위"
                      : "Good partners"}
                  </h3>
                  {knowledge.partners.length ? (
                    knowledge.partners.map((entry) => (
                      <button
                        type="button"
                        key={entry.diceId}
                        onClick={() => setKnowledgeId(entry.diceId)}
                      >
                        <DiceIcon
                          diceId={entry.diceId}
                          label={diceName(data, entry.diceId, locale)}
                        />
                        <span>
                          <b>{diceName(data, entry.diceId, locale)}</b>
                          <small>{entry.reason[locale]}</small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p>
                      {locale === "ko"
                        ? "검증된 조합 설명이 아직 없습니다."
                        : "No verified pair explanation yet."}
                    </p>
                  )}
                </article>
                <article>
                  <h3>{locale === "ko" ? "주의할 조합" : "Risky pairings"}</h3>
                  {knowledge.conflicts.length ? (
                    knowledge.conflicts.map((entry) => (
                      <button
                        type="button"
                        key={entry.diceId}
                        onClick={() => setKnowledgeId(entry.diceId)}
                      >
                        <DiceIcon
                          diceId={entry.diceId}
                          label={diceName(data, entry.diceId, locale)}
                        />
                        <span>
                          <b>{diceName(data, entry.diceId, locale)}</b>
                          <small>{entry.reason[locale]}</small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p>
                      {locale === "ko"
                        ? "구조적 충돌 자료가 없습니다."
                        : "No structural conflict is documented."}
                    </p>
                  )}
                </article>
              </div>
            </section>
          )}
        </div>
      )}

      {section === "meta" && (
        <div className="v48-meta-layout">
          <header>
            <div>
              <small>{CO_OP_RANKING_SNAPSHOT_DATE} · 105 DECKS</small>
              <h2>
                {locale === "ko"
                  ? "메타 군집과 환경 점수"
                  : "Meta clusters and environment"}
              </h2>
            </div>
            <p>
              {locale === "ko"
                ? "랭킹 스냅샷의 구성 유사도를 역할군으로 묶은 관측 결과입니다. 실시간 순위가 아닙니다."
                : "Observed role clusters from the dated ranking snapshot. This is not a live ranking."}
            </p>
          </header>
          <section className="v48-environment-radar">
            {Object.entries(environment).map(([key, value]) => (
              <article key={key}>
                <span>{key}</span>
                <div>
                  <i style={{ width: `${value}%` }} />
                </div>
                <strong>{value}</strong>
              </article>
            ))}
          </section>
          <section className="v48-cluster-grid">
            {clusters.map((cluster, index) => (
              <article key={cluster.id}>
                <header>
                  <b>0{index + 1}</b>
                  <span>{cluster.role}</span>
                </header>
                <h3>{LABELS[cluster.label][locale]}</h3>
                <div className="v48-deck-row">
                  {cluster.coreDiceIds.map((diceId) => (
                    <DiceIcon
                      key={diceId}
                      diceId={diceId}
                      label={diceName(data, diceId, locale)}
                    />
                  ))}
                </div>
                <dl>
                  <div>
                    <dt>{locale === "ko" ? "점유율" : "Share"}</dt>
                    <dd>{Math.round(cluster.share * 100)}%</dd>
                  </div>
                  <div>
                    <dt>{locale === "ko" ? "평균 순위" : "Avg rank"}</dt>
                    <dd>#{cluster.averageRank.toFixed(1)}</dd>
                  </div>
                  <div>
                    <dt>{locale === "ko" ? "구성 다양성" : "Diversity"}</dt>
                    <dd>{Math.round(cluster.diversity * 100)}%</dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}
