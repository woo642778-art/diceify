import { useMemo, useState } from "react";
import {
  CO_OP_RANKING_SNAPSHOT,
  CO_OP_RANKING_SNAPSHOT_DATE,
  CO_OP_RANKING_SOURCE_COUNT,
  type CoOpDeckRole,
} from "../../../deck-lab/coOpRankingSnapshot";
import type { DeckGoalV4, SpendProfileV4 } from "../../../deck-lab/recommendDeck";
import { groupObservedDecks } from "../../../diceify/observedMeta";
import { formatGameText } from "../../../game-data/formatGameText";
import type { CanonicalGameData } from "../../../game-data/types";
import { DiceIcon } from "../shared/DiceIcon";
import { MyDeckAnalyzer } from "./MyDeckAnalyzer";

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

const roleLabel: Record<CoOpDeckRole, { ko: string; en: string }> = {
  dealer: { ko: "딜러", en: "Dealer" },
  support: { ko: "서포트", en: "Support" },
};

function diceName(data: CanonicalGameData, diceId: string, locale: "ko" | "en") {
  const dice = data.dice.find((entry) => entry.id === diceId);
  return dice?.nameKey ? data.localization[locale][dice.nameKey] ?? diceId : diceId;
}

function diceDescription(data: CanonicalGameData, diceId: string, locale: "ko" | "en") {
  const dice = data.dice.find((entry) => entry.id === diceId);
  const source = dice?.descriptionKey ? data.localization[locale][dice.descriptionKey] ?? "" : "";
  return formatGameText(source, locale) || (locale === "ko" ? "클라이언트 설명 데이터 없음" : "No client description available");
}

export function DeckLabView(props: DeckLabViewProps) {
  const { data, locale } = props;
  const ko = locale === "ko";
  const [selectedBestRank, setSelectedBestRank] = useState(1);
  const grouped = useMemo(() => groupObservedDecks(), []);
  const roleFilter: CoOpDeckRole | "all" = props.goal === "balanced" ? "all" : props.goal;
  const visible = grouped.filter((entry) => roleFilter === "all" || entry.role === roleFilter);
  const selected = visible.find((entry) => entry.bestRank === selectedBestRank) ?? visible[0] ?? grouped[0];
  const manualDeck = props.activeDeckIds?.length === 5 ? props.activeDeckIds : selected?.diceIds ?? [];

  return <main className="d60-deck-lab" data-testid="v4-deck-lab">
    <header className="d60-deck-header">
      <div>
        <h1>{ko ? "덱 연구소" : "Deck Lab"}</h1>
        <p>{ko ? "공개 협동 랭킹에서 실제로 확인된 조합을 반복 관측 횟수와 최고 순위로 비교합니다." : "Compare exact compositions observed in the public co-op ranking by appearances and best rank."}</p>
      </div>
      <aside>
        <strong>{CO_OP_RANKING_SNAPSHOT_DATE.replaceAll("-", ".")}</strong>
        <span>{ko ? `${CO_OP_RANKING_SOURCE_COUNT}장 · 1~${CO_OP_RANKING_SNAPSHOT.length}위` : `${CO_OP_RANKING_SOURCE_COUNT} captures · ranks 1–${CO_OP_RANKING_SNAPSHOT.length}`}</span>
        <small>{ko ? "보존 스냅샷 · 실시간 아님" : "Preserved snapshot · not live"}</small>
      </aside>
    </header>

    <section className="d60-deck-workspace">
      <aside className="d60-deck-filters">
        <h2>{ko ? "조건" : "Filters"}</h2>
        <label>{ko ? "플레이 역할" : "Role"}
          <select value={props.goal} onChange={(event) => props.onGoalChange(event.target.value as DeckGoalV4)}>
            <option value="balanced">{ko ? "전체" : "All"}</option>
            <option value="dealer">{ko ? "딜러" : "Dealer"}</option>
            <option value="support">{ko ? "서포트" : "Support"}</option>
          </select>
        </label>
        <fieldset>
          <legend>{ko ? "게임 모드" : "Game mode"}</legend>
          <label><input type="radio" checked readOnly />{ko ? "협동" : "Co-op"}</label>
          <label className="is-disabled"><input type="radio" disabled />{ko ? "대전 · 자료 없음" : "Versus · no source"}</label>
        </fieldset>
        <p>{ko ? "동일한 5종 조합은 슬롯 순서와 관계없이 한 그룹으로 집계합니다." : "The same five dice are grouped regardless of slot order."}</p>
      </aside>

      <section className="d60-observed-decks" aria-label={ko ? "관측 덱 목록" : "Observed deck list"}>
        <header><span>{ko ? "정확한 조합" : "Exact composition"}</span><span>{ko ? "관측" : "Seen"}</span><span>{ko ? "최고" : "Best"}</span></header>
        {visible.map((group) => <button type="button" key={group.diceIds.join("|")} className={selected?.bestRank === group.bestRank ? "is-active" : ""} onClick={() => setSelectedBestRank(group.bestRank)}>
          <span className="d60-deck-icons">{group.diceIds.map((diceId) => <DiceIcon key={diceId} diceId={diceId} label={diceName(data, diceId, locale)} />)}</span>
          <strong>{group.appearances}{ko ? "회" : "x"}</strong>
          <em>#{group.bestRank}</em>
        </button>)}
      </section>

      {selected && <aside className="d60-deck-detail">
        <small>{roleLabel[selected.role][locale]} · {ko ? `${selected.appearances}회 관측` : `${selected.appearances} appearances`}</small>
        <h2>{ko ? `최고 #${selected.bestRank} 조합` : `Best rank #${selected.bestRank}`}</h2>
        <div className="d60-deck-detail-dice">{selected.diceIds.map((diceId) => <article key={diceId}>
          <DiceIcon diceId={diceId} label={diceName(data, diceId, locale)} />
          <div><strong>{diceName(data, diceId, locale)}</strong><p>{diceDescription(data, diceId, locale)}</p></div>
        </article>)}</div>
        <dl><div><dt>{ko ? "관측 순위" : "Observed ranks"}</dt><dd>{[...selected.ranks].sort((a, b) => a - b).map((rank) => `#${rank}`).join(", ")}</dd></div></dl>
        <button type="button" onClick={() => props.onActiveDeckChange?.([...selected.diceIds])}>{ko ? "내 덱 분석기에 적용" : "Apply to my analyzer"}</button>
        <p>{ko ? "승률과 사용률은 공식 API로 확인되지 않아 표시하지 않습니다." : "Win and use rates are not shown because no official API source is available."}</p>
      </aside>}
    </section>

    <section className="d60-manual-lab">
      <header>
        <div><small>{ko ? "수동 비교 도구" : "MANUAL COMPARISON"}</small><h2>{ko ? "내 덱 구성 점검" : "Check my composition"}</h2></div>
        <label>{ko ? "비교 성향" : "Comparison profile"}<select value={props.spendProfile} onChange={(event) => props.onSpendProfileChange(event.target.value as SpendProfileV4)}><option value="free">{ko ? "단순 전개" : "Simple setup"}</option><option value="light">{ko ? "균형" : "Balanced"}</option><option value="invested">{ko ? "기믹 활용" : "Mechanic-heavy"}</option></select></label>
      </header>
      <p>{ko ? "아래 점수는 게임 서버의 전적이나 승률이 아닌, 클라이언트 능력치와 역할 규칙을 이용한 상대 비교값입니다." : "Scores below are comparative values from client stats and role rules, not game-server records or win rates."}</p>
      {manualDeck.length === 5 && <MyDeckAnalyzer data={data} locale={locale} diceIds={[...manualDeck]} onChange={props.onActiveDeckChange ?? (() => undefined)} onSimulate={props.onSimulate} />}
    </section>
  </main>;
}
