import { useEffect, useMemo, useState } from "react";
import type { CanonicalGameData } from "../../../game-data/types";
import { playableDiceV3 } from "../../../game-data/playableDice";
import type { LiveGameStatusStateV62 } from "../../../live-data/types";
import { OFFICIAL_PATCH_HISTORY_V47 } from "../../../updates/patchHistory";
import { parseClientDiffV47, summarizePatchImpactV47, type ClientDiffV47 } from "../../../updates/patchImpact";
import { createCommunityContributionV55, communityIssueUrlV55, type ContributionKindV55 } from "../../../updates/communityContributionV55";
import { hasUnreadUpdateV55, markUpdateSeenV55 } from "../../../updates/updateWatchV55";
import { downloadTextFileV55 } from "../../../utils/downloadV55";
import { DiceIcon } from "../shared/DiceIcon";
import type { PlannerStateV3 } from "../../../planner-v3/types";

function nameOf(data: CanonicalGameData, diceId: string, locale: "ko" | "en") {
  const dice = data.dice.find((entry) => entry.id === diceId);
  return dice?.nameKey ? data.localization[locale][dice.nameKey] ?? diceId : diceId;
}

export function UpdateCenterView({ data, locale, activeDeckIds, state, liveStatus, onRefreshLiveData, onUpdateSeen }: { data: CanonicalGameData; locale: "ko" | "en"; activeDeckIds: string[]; state: PlannerStateV3; liveStatus: LiveGameStatusStateV62; onRefreshLiveData: () => void; onUpdateSeen?: () => void }) {
  const [diff, setDiff] = useState<ClientDiffV47>();
  const [error, setError] = useState<string>();
  const liveVersion = liveStatus.data.officialStore.version;
  const [unread, setUnread] = useState(() => hasUnreadUpdateV55(liveVersion));
  const [contributionKind, setContributionKind] = useState<ContributionKindV55>("data-correction");
  const [contributionSource, setContributionSource] = useState("");
  const [contributionDate, setContributionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [contributionNote, setContributionNote] = useState("");
  const [contributionNotice, setContributionNotice] = useState<string>();
  const activeTreeRanks = useMemo(() => ({ ...state.ownedRanks, ...state.simulatedRanks }), [state.ownedRanks, state.simulatedRanks]);
  const playableCount = useMemo(() => playableDiceV3(data).length, [data]);
  const impact = useMemo(() => diff ? summarizePatchImpactV47(diff, activeDeckIds, activeTreeRanks) : undefined, [activeDeckIds, activeTreeRanks, diff]);
  const contributionInput = { kind: contributionKind, sourceUrl: contributionSource, observedOn: contributionDate, note: contributionNote };
  const versionsMatch = liveVersion === data.manifest.clientVersion && liveStatus.data.publicCrossCheck.gameVersion === data.manifest.clientVersion;
  const checkedLabel = new Date(liveStatus.data.checkedAt).toLocaleString(locale === "ko" ? "ko-KR" : "en-US", { dateStyle: "medium", timeStyle: "short" });

  useEffect(() => setUnread(hasUnreadUpdateV55(liveVersion)), [liveVersion]);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    try { setDiff(parseClientDiffV47(await file.text())); setError(undefined); }
    catch (caught) { setDiff(undefined); setError(caught instanceof Error ? caught.message : String(caught)); }
  };
  const acknowledgeLatest = () => {
    markUpdateSeenV55(liveVersion);
    setUnread(false);
    onUpdateSeen?.();
  };
  const downloadContribution = () => {
    const packet = createCommunityContributionV55(data, contributionInput);
    downloadTextFileV55(`dicetree-${contributionKind}-${contributionDate || "evidence"}.json`, JSON.stringify(packet, null, 2));
    setContributionNotice(locale === "ko" ? "검토용 JSON 패킷을 저장했습니다. GitHub 제보에 첨부하거나 보관하세요." : "Review JSON saved. Attach it to a GitHub report or keep it for reference.");
  };

  return <main className="v47-update-center" data-testid="v47-update-center">
    <header className="v47-update-hero"><div><small>PATCH INTELLIGENCE</small><h1>{locale === "ko" ? "랜덤 다이스 2 업데이트" : "Random Dice 2 updates"}</h1><p>{locale === "ko" ? "공식 스토어 공지와 클라이언트 데이터 차이를 분리해서 보여줍니다." : "Separates official store announcements from measured client-data differences."}</p></div><aside><span>{locale === "ko" ? "사이트 데이터" : "Site data"}</span><strong>v{data.manifest.clientVersion}</strong><small>{locale === "ko" ? `추출일 ${data.manifest.extractedAt.slice(0, 10)}` : `Extracted ${data.manifest.extractedAt.slice(0, 10)}`}</small></aside></header>

    <section className={`v62-live-sources ${versionsMatch ? "is-current" : "is-outdated"}`} data-testid="v62-live-sources">
      <header><div><small>{locale === "ko" ? "외부 출처 자동 확인" : "AUTOMATED EXTERNAL CHECK"}</small><h2>{locale === "ko" ? "현재 게임 정보" : "Current game information"}</h2><p>{locale === "ko" ? "사이트를 열 때 공식 App Store와 공개 교차검증 저장소를 직접 확인하며, 15분마다 다시 조회합니다." : "Checks the official App Store and a public cross-check repository on load, then refreshes every 15 minutes."}</p></div><button type="button" onClick={onRefreshLiveData} disabled={liveStatus.phase === "refreshing"}>{liveStatus.phase === "refreshing" ? (locale === "ko" ? "확인 중" : "Checking") : (locale === "ko" ? "지금 다시 확인" : "Check now")}</button></header>
      {liveStatus.phase === "error" && <p className="v62-live-error" role="status">{locale === "ko" ? "실시간 연결에 실패해 마지막 검증본을 표시합니다." : "Live connection failed. Showing the last verified snapshot."}</p>}
      {!versionsMatch && <p className="v62-version-warning" role="alert">{locale === "ko" ? `공식 버전 v${liveVersion}과 계산 데이터 v${data.manifest.clientVersion}이 다릅니다. 새 계산 데이터가 검증될 때까지 기존 수치를 최신으로 표시하지 않습니다.` : `Official v${liveVersion} differs from calculator v${data.manifest.clientVersion}. Existing values are not labeled current until new data is verified.`}</p>}
      <div className="v62-live-grid">
        <article><span>{locale === "ko" ? "공식 배포" : "Official release"}</span><strong>v{liveVersion}</strong><small>{liveStatus.phase === "live" ? (locale === "ko" ? "실시간 응답" : "Live response") : (locale === "ko" ? "마지막 검증본" : "Last verified snapshot")}</small><ul>{liveStatus.data.officialStore.releaseNotes.map((note) => <li key={note}>{note}</li>)}</ul><footer>{liveStatus.data.officialStore.averageRating === null ? null : <span>{liveStatus.data.officialStore.averageRating.toFixed(2)} / 5 · {liveStatus.data.officialStore.ratingCount?.toLocaleString() ?? "-"}</span>}<a href={liveStatus.data.officialStore.url} target="_blank" rel="noreferrer">Apple App Store</a></footer></article>
        <article><span>{locale === "ko" ? "공개 교차검증" : "Public cross-check"}</span><strong>v{liveStatus.data.publicCrossCheck.gameVersion}</strong><small>{liveStatus.data.publicCrossCheck.latestChangeDate} · {liveStatus.data.publicCrossCheck.commitSha.slice(0, 12)}</small><dl><div><dt>{locale === "ko" ? "주사위" : "Dice"}</dt><dd>{liveStatus.data.publicCrossCheck.counts.dice}</dd></div><div><dt>{locale === "ko" ? "트리" : "Tree"}</dt><dd>{liveStatus.data.publicCrossCheck.counts.treeNodes}</dd></div><div><dt>{locale === "ko" ? "보스" : "Bosses"}</dt><dd>{liveStatus.data.publicCrossCheck.counts.bosses}</dd></div><div><dt>{locale === "ko" ? "전술" : "Tactics"}</dt><dd>{liveStatus.data.publicCrossCheck.counts.tactics}</dd></div><div><dt>{locale === "ko" ? "균열 효과" : "Rift effects"}</dt><dd>{liveStatus.data.publicCrossCheck.counts.riftEffects}</dd></div></dl><footer><a href={liveStatus.data.publicCrossCheck.commitUrl} target="_blank" rel="noreferrer">rd2-wiki · MIT data structure</a></footer></article>
      </div>
      <footer><span>{locale === "ko" ? `마지막 확인 ${checkedLabel}` : `Last checked ${checkedLabel}`}</span><span>{locale === "ko" ? "계정·실시간 랭킹 API는 확인되지 않아 자동 갱신 대상에서 제외" : "Account and live ranking APIs remain excluded because no verified public provider is available"}</span></footer>
    </section>

    {unread && <section className="v55-update-alert" role="status" data-testid="v55-update-alert"><div><small>{locale === "ko" ? "새 공식 기록" : "NEW OFFICIAL RECORD"}</small><strong>{locale === "ko" ? `v${liveVersion} 업데이트를 아직 확인하지 않았습니다.` : `You have not reviewed v${liveVersion} yet.`}</strong><span>{locale === "ko" ? "버전 기록과 내 덱 영향 분석기를 확인한 뒤 읽음으로 표시할 수 있습니다." : "Review the version history and your build impact, then mark it read."}</span></div><button type="button" onClick={acknowledgeLatest}>{locale === "ko" ? "확인 완료" : "Mark as read"}</button></section>}

    <section className="v55-data-trust" data-testid="v55-data-trust">
      <header><div><small>{locale === "ko" ? "데이터 신뢰도" : "DATA TRUST"}</small><h2>{locale === "ko" ? "계산 데이터의 출처와 최신성" : "Calculation-data source and freshness"}</h2></div><p>{locale === "ko" ? "공식 공지, 정규화된 클라이언트 데이터, 커뮤니티 제보를 서로 다른 근거로 취급합니다." : "Official notes, normalized client data, and community submissions are treated as different evidence sources."}</p></header>
      <dl>
        <div><dt>{locale === "ko" ? "계산 스냅샷" : "Calculation snapshot"}</dt><dd>v{data.manifest.clientVersion}</dd><small>{locale === "ko" ? `추출 ${data.manifest.extractedAt.slice(0, 10)}` : `Extracted ${data.manifest.extractedAt.slice(0, 10)}`}</small></div>
        <div><dt>{locale === "ko" ? "공식 공지" : "Official notice"}</dt><dd>v{liveVersion}</dd><small>{locale === "ko" ? `자동 확인 ${liveStatus.data.checkedAt.slice(0, 10)}` : `Checked ${liveStatus.data.checkedAt.slice(0, 10)}`}</small></div>
        <div><dt>{locale === "ko" ? "정규 데이터" : "Canonical data"}</dt><dd>{playableCount} / {data.tree.length}</dd><small>{locale === "ko" ? "실제 주사위 / 트리 노드" : "playable dice / tree nodes"}</small></div>
        <div><dt>{locale === "ko" ? "원본 식별" : "Source fingerprint"}</dt><dd>{data.manifest.sourceSha256.slice(0, 12)}</dd><small>SHA-256</small></div>
      </dl>
      <footer><a href="https://github.com/woo642778-art/diceify/blob/main/docs/data/v3-client-1.1.0-extraction.md" target="_blank" rel="noreferrer">{locale === "ko" ? "1.1.0 추출·검증 방법 보기" : "View 1.1.0 extraction and validation"}</a><span>{locale === "ko" ? "클라이언트 표의 주사위·노드·룬과 비용만 계산에 반영하며, 스토어 공지에 없는 전투 수치는 추정하지 않습니다." : "Only client-table dice, nodes, runes, and costs enter calculations; unpublished combat values are not inferred."}</span></footer>
    </section>

    <section className="v47-official-patches">
      <header><div><small>{locale === "ko" ? "공식 확인" : "OFFICIALLY VERIFIED"}</small><h2>{locale === "ko" ? "버전 기록" : "Version history"}</h2></div><p>{locale === "ko" ? "스토어가 구체적인 수치를 공개하지 않은 경우 임의로 상향·하향을 추정하지 않습니다." : "No buff or nerf is inferred when store notes omit concrete values."}</p></header>
      <div>{OFFICIAL_PATCH_HISTORY_V47.map((patch, index) => <article key={patch.version} className={index === 0 ? "is-current" : ""}><header><span>v{patch.version}</span><time>{patch.releasedOn}</time><b>{patch.specificity === "generic" ? (locale === "ko" ? "일반 공지" : "Generic note") : (locale === "ko" ? "구체 공지" : "Specific note")}</b></header><h3>{patch.title[locale]}</h3>{patch.notes[locale].map((note) => <p key={note}>{note}</p>)}<footer>{patch.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} · {source.checkedOn}</a>)}</footer></article>)}</div>
    </section>

    <section className="v47-patch-impact" data-testid="v47-patch-impact">
      <header><div><small>{locale === "ko" ? "실측 데이터" : "MEASURED DATA"}</small><h2>{locale === "ko" ? "패치 영향 분석기" : "Patch impact analyzer"}</h2><p>{locale === "ko" ? "새 클라이언트 추출 후 diff_clients.py가 만든 JSON을 불러오면 변경 주사위·트리와 현재 덱 영향을 계산합니다." : "Import JSON from diff_clients.py to calculate changed dice, tree nodes, and active-deck impact."}</p></div><label>{locale === "ko" ? "클라이언트 diff 불러오기" : "Import client diff"}<input type="file" accept="application/json,.json" onChange={(event) => void readFile(event.target.files?.[0])} /></label></header>
      {error && <p className="v47-import-error" role="alert">{error}</p>}
      {!impact ? <div className="v47-impact-empty"><strong>{locale === "ko" ? `v${data.manifest.clientVersion} 계산 스냅샷이 적용되었습니다.` : `The v${data.manifest.clientVersion} calculation snapshot is active.`}</strong><p>{locale === "ko" ? `현재 실제 주사위 ${playableCount}종, 트리 노드 ${data.tree.length}개, 룬 ${data.runes.length}개를 사용합니다. 태양 주사위·태양 코어 비용은 반영했지만, 특수 전투 공식이 검증되지 않은 결과는 계속 '부분 검증'으로 표시합니다.` : `The site uses ${playableCount} playable dice, ${data.tree.length} tree nodes, and ${data.runes.length} runes. Solar Dice and Solar Core costs are included; unresolved special formulas remain marked Partial.`}</p></div> : <div className="v47-impact-grid">
        <article><span>{locale === "ko" ? "변경 주사위" : "Changed dice"}</span><strong>{impact.changedDiceIds.length}</strong><small>{impact.changedDiceIds.join(" · ") || (locale === "ko" ? "없음" : "None")}</small></article>
        <article><span>{locale === "ko" ? "트리 변경" : "Tree changes"}</span><strong>{impact.changedTreeNodeIds.length}</strong><small>{(impact.counts.treeCosts ?? 0)} {locale === "ko" ? "비용" : "cost"} · {(impact.counts.treeTopology ?? 0)} {locale === "ko" ? "구조" : "topology"}</small></article>
        <article><span>{locale === "ko" ? "내 투자 트리 영향" : "My invested tree"}</span><strong>{impact.affectedInvestedTreeNodeIds.length}</strong><small>{impact.affectedInvestedTreeNodeIds.join(" · ") || (locale === "ko" ? "영향 없음" : "No affected ranks")}</small></article>
        <article><span>{locale === "ko" ? "내 덱 영향" : "My deck affected"}</span><strong>{impact.affectedActiveDiceIds.length}</strong><div>{impact.affectedActiveDiceIds.map((id) => <span key={id}><DiceIcon diceId={id} label={nameOf(data, id, locale)} />{nameOf(data, id, locale)}</span>)}</div></article>
        <article><span>{locale === "ko" ? "기본 DPS 변화" : "Basic DPS deltas"}</span><strong>{impact.basicDpsDeltas.length}</strong><small>{impact.basicDpsDeltas.map((entry) => `${nameOf(data, entry.diceId, locale)} ${entry.percent >= 0 ? "+" : ""}${entry.percent.toFixed(1)}%`).join(" · ") || (locale === "ko" ? "계산 가능한 변경 없음" : "No calculable changes")}</small></article>
      </div>}
      <footer>{locale === "ko" ? "기본 DPS 변화는 diff에 공격력과 공격 간격의 전후 값이 모두 있을 때만 표시합니다. 특수 기믹과 전체 덱 DPS는 새·이전 정규 데이터셋이 모두 있어야 계산할 수 있습니다." : "Basic DPS is shown only when the diff contains both attack and interval before and after. Special mechanics and whole-deck DPS require both canonical datasets."}</footer>
    </section>

    <section className="v55-community-contribution" data-testid="v55-community-contribution">
      <header><div><small>{locale === "ko" ? "커뮤니티 검토 흐름" : "COMMUNITY REVIEW FLOW"}</small><h2>{locale === "ko" ? "랭킹·데이터 제보 패킷" : "Ranking and data evidence packet"}</h2><p>{locale === "ko" ? "제보는 자동으로 계산 데이터에 반영되지 않습니다. 근거를 JSON으로 보관하거나 GitHub 검토 이슈로 보내면 확인 후 반영할 수 있습니다." : "Submissions never alter calculation data automatically. Keep evidence as JSON or send it to a GitHub review issue for verification."}</p></div></header>
      <div className="v55-community-form">
        <label>{locale === "ko" ? "제보 종류" : "Submission type"}<select value={contributionKind} onChange={(event) => setContributionKind(event.target.value as ContributionKindV55)}><option value="data-correction">{locale === "ko" ? "데이터 정정" : "Data correction"}</option><option value="ranking-snapshot">{locale === "ko" ? "랭킹 스냅샷" : "Ranking snapshot"}</option><option value="patch-note">{locale === "ko" ? "패치 공지" : "Patch note"}</option></select></label>
        <label>{locale === "ko" ? "관측일" : "Observed date"}<input type="date" value={contributionDate} onChange={(event) => setContributionDate(event.target.value)} /></label>
        <label>{locale === "ko" ? "공개 출처 URL" : "Public source URL"}<input type="url" value={contributionSource} onChange={(event) => setContributionSource(event.target.value)} placeholder="https://" /></label>
        <label className="v55-community-note">{locale === "ko" ? "관측 내용과 근거" : "Observed difference and evidence"}<textarea value={contributionNote} onChange={(event) => setContributionNote(event.target.value)} placeholder={locale === "ko" ? "무엇이 다르고, 어느 화면·버전에서 확인했는지 적어주세요." : "Describe what differs and where it was observed."} /></label>
      </div>
      <footer><button type="button" onClick={downloadContribution}>{locale === "ko" ? "검토 패킷 저장" : "Save review packet"}</button><a href={communityIssueUrlV55(contributionInput)} target="_blank" rel="noreferrer">{locale === "ko" ? "GitHub 검토 이슈 열기" : "Open GitHub review issue"}</a></footer>
      {contributionNotice && <p role="status">{contributionNotice}</p>}
    </section>
  </main>;
}
