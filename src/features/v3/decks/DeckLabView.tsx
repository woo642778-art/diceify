import type { CanonicalGameData } from "../../../game-data/types";
import { formatGameText } from "../../../game-data/formatGameText";
import { recommendDeckV4, type DeckGoalV4, type DeckRoleV4, type SpendProfileV4 } from "../../../deck-lab/recommendDeck";
import {
  CO_OP_RANKING_SNAPSHOT,
  CO_OP_RANKING_SNAPSHOT_DATE,
  CO_OP_RANKING_SOURCE_COUNT,
  summarizeDiceUsage,
  type CoOpDeckRole,
  type CoOpRankedDeck,
} from "../../../deck-lab/coOpRankingSnapshot";
import { analyzeRosterMeta, NEXT_META_FORECASTS } from "../../../deck-lab/metaForecast";
import { DiceIcon } from "../shared/DiceIcon";
import { MyDeckAnalyzer } from "./MyDeckAnalyzer";
import { MetaTimeMachine } from "./MetaTimeMachine";
import { RivalBuilderV49 } from "./RivalBuilderV49";
import { DiceRankingV49 } from "./DiceRankingV49";

export interface DeckLabViewProps {
  data: CanonicalGameData;
  locale: "ko" | "en";
  goal: DeckGoalV4;
  spendProfile: SpendProfileV4;
  onGoalChange: (goal: DeckGoalV4) => void;
  onSpendProfileChange: (profile: SpendProfileV4) => void;
  onSimulate: (diceId: string) => void;
  activeDeckIds?: string[];
  onActiveDeckChange?: (diceIds: string[]) => void;
}

const ROLE_LABELS: Record<DeckRoleV4, { ko: string; en: string }> = {
  dealer: { ko: "딜러", en: "Dealer" },
  control: { ko: "제어", en: "Control" },
  economy: { ko: "재화·전개", en: "Economy" },
  utility: { ko: "유틸", en: "Utility" },
};

const SNAPSHOT_ROLE_LABELS: Record<CoOpDeckRole, { ko: string; en: string }> = {
  dealer: { ko: "딜러 덱", en: "Dealer deck" },
  support: { ko: "서포트 덱", en: "Support deck" },
};

function localize(data: CanonicalGameData, key: string | undefined, locale: "ko" | "en", fallback: string) {
  return key ? data.localization[locale][key] ?? fallback : fallback;
}

function diceName(data: CanonicalGameData, diceId: string, locale: "ko" | "en") {
  const dice = data.dice.find((entry) => entry.id === diceId);
  return dice ? localize(data, dice.nameKey, locale, dice.id) : diceId;
}

function DiceLineup({ data, diceIds, locale }: { data: CanonicalGameData; diceIds: readonly string[]; locale: "ko" | "en" }) {
  return <div className="v43-dice-lineup">
    {diceIds.map((diceId, index) => <div key={`${diceId}-${index}`} title={diceName(data, diceId, locale)}>
      <DiceIcon diceId={diceId} label={diceName(data, diceId, locale)} />
    </div>)}
  </div>;
}

function RankingLane({ data, decks, locale, role }: { data: CanonicalGameData; decks: readonly CoOpRankedDeck[]; locale: "ko" | "en"; role: CoOpDeckRole }) {
  return <section className={`v43-ranking-lane is-${role}`} data-testid={`v43-${role}-lane`}>
    <header>
      <div className="v43-role-mark" aria-hidden="true">{role === "dealer" ? "D" : "S"}</div>
      <div><small>{role === "dealer" ? "DAMAGE CORE" : "CONTROL CORE"}</small><h3>{SNAPSHOT_ROLE_LABELS[role][locale]}</h3></div>
      <strong>{decks.length}</strong>
    </header>

    <div className="v43-ranked-list">
      {decks.slice(0, 4).map((deck) => <article key={deck.rank}>
        <b>#{deck.rank}</b>
        <DiceLineup data={data} diceIds={deck.diceIds} locale={locale} />
        <small>{deck.score ? deck.score.toLocaleString() : (locale === "ko" ? "구성 확인" : "Composition observed")}</small>
      </article>)}
    </div>
  </section>;
}

export function DeckLabView(props: DeckLabViewProps) {
  const { data, locale, goal, spendProfile } = props;
  const recommendation = recommendDeckV4(data, goal, spendProfile);
  const byId = new Map(data.dice.map((dice) => [dice.id, dice]));
  const dealerDecks = CO_OP_RANKING_SNAPSHOT.filter((deck) => deck.role === "dealer");
  const supportDecks = CO_OP_RANKING_SNAPSHOT.filter((deck) => deck.role === "support");
  const usage = summarizeDiceUsage().slice(0, 8);
  const roster = analyzeRosterMeta(data);

  return <main className="v4-deck-lab" data-testid="v4-deck-lab">
    <header className="v4-deck-hero">
      <div>
        <small>{locale === "ko" ? "협동 랭킹 · 전체 주사위 분석" : "CO-OP RANKING · FULL ROSTER ANALYSIS"}</small>
        <h1>{locale === "ko" ? "덱 연구소" : "Deck Lab"}</h1>
        <p>{locale === "ko" ? "검증된 8월 16일 협동 랭킹 조합과 1.1.0 전체 플레이 가능 주사위의 능력치·효과를 구분해 분석합니다." : "Separately analyzes the verified August 16 co-op ranking and all playable dice stats and effects from client 1.1.0."}</p>
      </div>
      <aside className="v4-meta-status" data-testid="v4-meta-status">
        <strong>{locale === "ko" ? `${CO_OP_RANKING_SNAPSHOT_DATE.replaceAll("-", ".")} 협동 랭킹 스냅샷` : `Co-op ranking snapshot · ${CO_OP_RANKING_SNAPSHOT_DATE}`}</strong>
        <p>{locale === "ko" ? `사용자 제공 랭킹 화면 ${CO_OP_RANKING_SOURCE_COUNT}장에서 1~105위의 525개 슬롯을 판독했습니다. 실시간 API가 아니므로 이후 순위 변동은 자동 반영되지 않습니다.` : `Read 525 slots across ranks 1–105 from ${CO_OP_RANKING_SOURCE_COUNT} supplied ranking captures. This is a dated snapshot, not a live API.`}</p>
      </aside>
    </header>

    <section className="v59-meta-watch" data-testid="v59-meta-watch">
      <DiceIcon diceId="solar" label={diceName(data, "solar", locale)} />
      <div><small>{locale === "ko" ? "1.1.0 신규 · 랭킹 관측과 분리" : "NEW IN 1.1.0 · SEPARATE FROM RANKING"}</small><h2>{locale === "ko" ? "태양 주사위 메타 관찰" : "Solar Dice meta watch"}</h2><p>{locale === "ko" ? "태양 주사위와 전용 트리 2개 노드는 최신 클라이언트 데이터에 반영했습니다. 다만 보존된 8월 16일 랭킹은 출시 이전 자료이므로 사용률이나 티어를 꾸며내지 않고 신규 실험 후보로만 분리합니다." : "Solar Dice and its two dedicated tree nodes are included from the latest client. The preserved August 16 ranking predates this release, so no usage rate or tier is fabricated; Solar remains a separate experiment candidate."}</p></div>
      <dl><div><dt>{locale === "ko" ? "클라이언트" : "Client"}</dt><dd>1.1.0</dd></div><div><dt>{locale === "ko" ? "트리 노드" : "Tree nodes"}</dt><dd>{data.tree.length}</dd></div><div><dt>{locale === "ko" ? "상태" : "Status"}</dt><dd>{locale === "ko" ? "관찰 중" : "Watch"}</dd></div></dl>
    </section>

    <MyDeckAnalyzer
      data={data}
      locale={locale}
      diceIds={props.activeDeckIds ?? recommendation.dice.map((entry) => entry.diceId)}
      onChange={props.onActiveDeckChange ?? (() => undefined)}
      onSimulate={props.onSimulate}
    />

    <RivalBuilderV49 data={data} locale={locale} diceIds={props.activeDeckIds ?? recommendation.dice.map((entry) => entry.diceId)} onApplyRevision={props.onActiveDeckChange ?? (() => undefined)} />

    <DiceRankingV49 data={data} locale={locale} onSelectDice={props.onSimulate} />

    <section className="v43-ranking-snapshot" data-testid="v43-ranking-snapshot">
      <header className="v43-section-heading">
        <div><small>{locale === "ko" ? "관측 데이터" : "OBSERVED DATA"}</small><h2>{locale === "ko" ? "랭킹 덱 역할 분류" : "Ranked decks by role"}</h2></div>
        <div className="v43-snapshot-count"><strong>{CO_OP_RANKING_SNAPSHOT.length}</strong><span>{locale === "ko" ? "개 랭킹 덱" : "ranked decks"}</span></div>
      </header>
      <div className="v43-role-lanes">
        <RankingLane data={data} decks={dealerDecks} locale={locale} role="dealer" />
        <RankingLane data={data} decks={supportDecks} locale={locale} role="support" />
      </div>
      <div className="v43-usage-strip" aria-label={locale === "ko" ? "랭킹 주사위 사용 빈도" : "Ranked dice usage"}>
        <b>{locale === "ko" ? "메타 코어" : "Meta core"}</b>
        {usage.map((entry) => <span key={entry.diceId}>
          <DiceIcon diceId={entry.diceId} label={diceName(data, entry.diceId, locale)} />
          <em>{diceName(data, entry.diceId, locale)}</em>
          <strong>{Math.round(entry.share * 100)}%</strong>
        </span>)}
      </div>
      <footer>{locale === "ko" ? "딜러 덱은 포식·전기·톱날처럼 직접 피해 핵심이 확인된 조합, 서포트 덱은 해당 핵심 없이 제어·전개에 집중한 조합으로 분류했습니다." : "Dealer decks contain an observed direct-damage core such as Predator, Electric or Saw. Support decks focus on control and board development without one of those cores."}</footer>
    </section>

    <MetaTimeMachine data={data} locale={locale} />

    <section className="v43-forecast" data-testid="v43-forecast">
      <header className="v43-section-heading">
        <div><small>{locale === "ko" ? "예측 · 랭킹 사실 아님" : "FORECAST · NOT A RANKING FACT"}</small><h2>{locale === "ko" ? "차기 메타 후보" : "Next-meta candidates"}</h2></div>
        <div className="v43-roster-facts">
          <span><strong>{roster.analyzedDice}</strong>{locale === "ko" ? "종 전수 분석" : " dice analyzed"}</span>
          <span><strong>{roster.rankedDice}</strong>{locale === "ko" ? "종 랭킹 등장" : " ranked"}</span>
          <span><strong>{roster.unrankedDice}</strong>{locale === "ko" ? "종 미등장" : " unseen"}</span>
        </div>
      </header>
      <div className="v43-forecast-grid">
        {NEXT_META_FORECASTS.map((forecast) => <article key={forecast.id} className={`is-${forecast.role}`}>
          <header><span>{locale === "ko" ? "예측" : "Forecast"}</span><b>{SNAPSHOT_ROLE_LABELS[forecast.role][locale]}</b><em>{forecast.confidence}%</em></header>
          <h3>{forecast.title[locale]}</h3>
          <DiceLineup data={data} diceIds={forecast.diceIds} locale={locale} />
          <p>{forecast.reason[locale]}</p>
          <small>{locale === "ko" ? `관측 순위 ${forecast.observedRanks.map((rank) => `#${rank}`).join(" · ")}` : `Observed at ${forecast.observedRanks.map((rank) => `#${rank}`).join(" · ")}`}</small>
          <footer><b>{locale === "ko" ? "리스크" : "Risk"}</b>{forecast.risk[locale]}</footer>
        </article>)}
      </div>
    </section>

    <section className="v4-deck-controls" aria-label={locale === "ko" ? "덱 추천 조건" : "Deck recommendation settings"}>
      <label>{locale === "ko" ? "플레이 역할" : "Play role"}
        <select aria-label={locale === "ko" ? "플레이 역할" : "Play role"} value={goal} onChange={(event) => props.onGoalChange(event.target.value as DeckGoalV4)}>
          <option value="dealer">{locale === "ko" ? "딜러 중심" : "Dealer focus"}</option>
          <option value="support">{locale === "ko" ? "서포트 중심" : "Support focus"}</option>
          <option value="balanced">{locale === "ko" ? "균형 조합" : "Balanced"}</option>
        </select>
      </label>
      <label>{locale === "ko" ? "투자 성향" : "Investment profile"}
        <select aria-label={locale === "ko" ? "투자 성향" : "Investment profile"} value={spendProfile} onChange={(event) => props.onSpendProfileChange(event.target.value as SpendProfileV4)}>
          <option value="free">{locale === "ko" ? "무과금형 · 단순·검증 우선" : "Free · simple and verified"}</option>
          <option value="light">{locale === "ko" ? "소과금형 · 균형" : "Light · balanced"}</option>
          <option value="invested">{locale === "ko" ? "고투자형 · 고점·기믹" : "Invested · ceiling and mechanics"}</option>
        </select>
      </label>
      <p>{locale === "ko" ? "투자 성향은 실제 결제 효율이나 보유 여부가 아니라, 단순성과 기믹 의존도를 조절하는 추천 프리셋입니다." : "Investment profile adjusts simplicity and mechanic dependence. It does not assert payment efficiency or ownership."}</p>
    </section>

    <section className="v4-deck-result">
      <div className="v4-deck-title">
        <div><small>{locale === "ko" ? "내 조건에 맞춘 별도 추천" : "PERSONALIZED RECOMMENDATION"}</small><h2>{locale === "ko" ? "추천 5주사위" : "Recommended five dice"}</h2></div>
        <button type="button" onClick={() => props.onSimulate(recommendation.primaryDiceId)}>{locale === "ko" ? "주 딜러 시뮬레이션" : "Simulate primary dealer"}</button>
      </div>
      <div className="v4-deck-grid">
        {recommendation.dice.map((entry, index) => {
          const dice = byId.get(entry.diceId)!;
          const name = localize(data, dice.nameKey, locale, dice.id);
          return <article key={entry.diceId} className={`family-${dice.family ?? "order"}`} data-testid={`deck-slot-${index + 1}`}>
            <span className="v4-deck-slot">{index + 1}</span>
            <div className="v4-deck-token"><DiceIcon diceId={entry.diceId} label={name} /></div>
            <div className="v4-deck-card-copy">
              <h3>{name}{entry.diceId === recommendation.primaryDiceId ? <b>{locale === "ko" ? "주 딜러" : "Primary"}</b> : null}</h3>
              <div>{entry.roles.map((role) => <span key={role}>{ROLE_LABELS[role][locale]}</span>)}</div>
              <p>{formatGameText(entry.evidence, locale)}</p>
              <small>{entry.basicDps === null
                ? (locale === "ko" ? "기본 DPS 근거 없음" : "No basic-DPS evidence")
                : `${locale === "ko" ? "특수효과 제외 기본 DPS" : "Basic DPS excluding effects"} ${entry.basicDps.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</small>
            </div>
          </article>;
        })}
      </div>
      <footer>{locale === "ko" ? "개인 추천의 역할 태그와 DPS는 게임 내 능력치와 효과 설명을 바탕으로 계산했습니다. 특수 공식이 미확인된 경우 기본 공격만 표시합니다." : "Personalized role tags and DPS use in-game stats and effect descriptions. Unresolved special formulas are excluded."}</footer>
    </section>
  </main>;
}
