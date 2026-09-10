import { useMemo,useState } from "react";
import { CO_OP_RANKING_SNAPSHOT,CO_OP_RANKING_SNAPSHOT_DATE,summarizeDiceUsage } from "../../../deck-lab/coOpRankingSnapshot";
import { groupObservedDecks } from "../../../diceify/observedMeta";
import { playableDiceV3 } from "../../../game-data/playableDice";
import type { CanonicalGameData } from "../../../game-data/types";
import type { LiveGameStatusStateV62 } from "../../../live-data/types";
import { DiceIcon } from "../shared/DiceIcon";

type Destination="decks"|"dice"|"tree"|"rankings"|"guild"|"account"|"updates";
const tools:[Destination,string,string][]=[
  ["decks","덱 연구소","관측 랭킹 조합과 게임 데이터를 비교합니다."],
  ["dice","주사위","플레이 가능한 주사위의 능력치와 인게임 설명을 찾습니다."],
  ["tree","다이스 트리","241개 노드의 비용과 선행 경로를 설계합니다."],
  ["rankings","랭킹","보존된 협동 랭킹 1~105위를 확인합니다."],
  ["guild","길드","길드를 등록하고 사이트 관심도를 살펴봅니다."],
];

function name(data:CanonicalGameData,id:string,locale:"ko"|"en"){
  const dice=data.dice.find((entry)=>entry.id===id);
  return dice?.nameKey ? data.localization[locale][dice.nameKey]??id : id;
}

export function DiceifyHome({data,locale,onNavigate,onSelectDice,gold,core,solarCore,plannedNodes,targetDiceId,activeDeckIds,liveStatus}:{data:CanonicalGameData;locale:"ko"|"en";onNavigate:(to:Destination)=>void;onSelectDice:(id:string)=>void;gold:number;core:number;solarCore:number;plannedNodes:number;targetDiceId:string;activeDeckIds:readonly string[];liveStatus:LiveGameStatusStateV62}){
  const [query,setQuery]=useState("");
  const [notice,setNotice]=useState("");
  const groups=useMemo(()=>groupObservedDecks().slice(0,5),[]);
  const usage=useMemo(()=>summarizeDiceUsage().slice(0,5),[]);
  const playableCount=useMemo(()=>playableDiceV3(data).length,[data]);
  const versionsMatch=liveStatus.data.officialStore.version===data.manifest.clientVersion;
  const search=()=>{
    const clean=query.normalize("NFKC").trim().toLocaleLowerCase();
    if(!clean)return;
    const dice=data.dice.find((entry)=>`${entry.id} ${name(data,entry.id,"ko")} ${name(data,entry.id,"en")}`.toLocaleLowerCase().includes(clean));
    if(dice){onSelectDice(dice.id);return;}
    setNotice(locale==="ko"?"현재 닉네임·PID 실시간 조회 공급자가 연결되지 않았습니다. 계정 화면에서 지원 범위를 확인할 수 있습니다.":"Live nickname/PID lookup is not connected. See the account page for availability.");
  };
  return <main className="d60-home" data-testid="diceify-home">
    <div className="d63-hero-stage">
      <div className="d63-atmosphere" aria-hidden="true">
        <i className="d63-atmosphere-top"/>
        <i className="d63-atmosphere-left"/>
        <i className="d63-atmosphere-right"/>
        <i className="d63-atmosphere-art"/>
      </div>
      <section className="d61-home-hero">
        <div className="d61-hero-copy">
          <small>{locale==="ko"?`RANDOM DICE 2 · 클라이언트 ${data.manifest.clientVersion}`:`RANDOM DICE 2 · CLIENT ${data.manifest.clientVersion}`}</small>
          <h1><span>diceify</span>{locale==="ko"?<>덱의 근거를 보고,<br/>트리를 더 멀리.</>:<>Read the deck.<br/>Push the tree further.</>}</h1>
          <p>{locale==="ko"?"확인된 게임 데이터로 주사위를 비교하고, 241개 노드의 투자 경로를 설계하세요.":"Compare dice with verified game data and plan an investment route across 241 nodes."}</p>
          <button type="button" onClick={()=>onNavigate("tree")}>{locale==="ko"?"다이스 트리 열기":"Open Dice Tree"}</button>
        </div>
        <img src={`${import.meta.env.BASE_URL}hero/diceify-topology-v4.png`} alt="" aria-hidden="true" className="d61-hero-topology"/>
      </section>
      <div className="d63-hero-transition" aria-hidden="true"/>
    </div>
    <section className={`v62-home-freshness ${versionsMatch?"is-current":"is-outdated"}`} aria-label={locale==="ko"?"최신 데이터 상태":"Live data status"}>
      <div><i aria-hidden="true"/><span><small>{locale==="ko"?(liveStatus.phase==="live"?"실시간 확인":"최근 확인본"):liveStatus.phase==="live"?"LIVE CHECK":"LATEST SNAPSHOT"}</small><strong>{locale==="ko"?`공식 v${liveStatus.data.officialStore.version}`:`Official v${liveStatus.data.officialStore.version}`}</strong></span></div>
      <dl>
        <div><dt>{locale==="ko"?"계산 데이터":"Calculator"}</dt><dd>v{data.manifest.clientVersion}</dd></div>
        <div><dt>{locale==="ko"?"실제 주사위":"Playable dice"}</dt><dd>{playableCount}</dd></div>
        <div><dt>{locale==="ko"?"트리":"Tree"}</dt><dd>{data.tree.length}</dd></div>
        <div><dt>{locale==="ko"?"공개 교차검증":"Public cross-check"}</dt><dd>{liveStatus.data.publicCrossCheck.latestChangeDate.replaceAll("-",".")}</dd></div>
      </dl>
      <button type="button" onClick={()=>onNavigate("updates")}>{locale==="ko"?"출처·갱신 상태":"Sources & freshness"}</button>
    </section>
    <section className="d61-home-utility">
      <header><small>{locale==="ko"?"바로 시작":"START HERE"}</small><h2>{locale==="ko"?"현재 계획에서 이어가기":"Continue from your current plan"}</h2></header>
      <div className="d61-utility-grid">
        <article className="d61-resume-panel">
          <div><DiceIcon diceId={targetDiceId} label={name(data,targetDiceId,locale)}/><span><small>{locale==="ko"?"목표 주사위":"Target dice"}</small><strong>{name(data,targetDiceId,locale)}</strong></span></div>
          <dl><div><dt>{locale==="ko"?"계획 노드":"Planned nodes"}</dt><dd>{plannedNodes}</dd></div><div><dt>{locale==="ko"?"골드":"Gold"}</dt><dd>{gold.toLocaleString()}</dd></div><div><dt>{locale==="ko"?"코어":"Core"}</dt><dd>{core.toLocaleString()}</dd></div><div><dt>{locale==="ko"?"태양":"Solar"}</dt><dd>{solarCore.toLocaleString()}</dd></div></dl>
          <button type="button" onClick={()=>onNavigate("tree")}>{locale==="ko"?"계획 계속하기":"Continue planning"}</button>
        </article>
        <article className="d61-search-panel">
          <div><small>{locale==="ko"?"주사위 찾기":"FIND A DIE"}</small><h3>{locale==="ko"?"인게임 설명과 능력치 검색":"Search client descriptions and stats"}</h3></div>
          <form onSubmit={(event)=>{event.preventDefault();search();}}>
            <input aria-label={locale==="ko"?"Diceify 통합 검색":"Diceify search"} value={query} onChange={(event)=>setQuery(event.target.value)} placeholder={locale==="ko"?"주사위 이름 검색":"Search dice name"}/>
            <button>{locale==="ko"?"검색":"Search"}</button>
          </form>
          <p>{locale==="ko"?"닉네임·PID 계정 조회는 승인된 공급자 연결 전까지 사용할 수 없습니다.":"Nickname and PID lookup stays unavailable until an authorized provider is connected."}</p>
          {notice&&<p role="status" className="d60-search-notice">{notice}<button type="button" onClick={()=>onNavigate("account")}>{locale==="ko"?"계정 화면":"Account"}</button></p>}
        </article>
      </div>
      <div className="d61-current-deck"><span>{locale==="ko"?"내 분석 덱":"My analysis deck"}</span><div>{activeDeckIds.map((id)=><DiceIcon key={id} diceId={id} label={name(data,id,locale)}/>)}</div><button type="button" onClick={()=>onNavigate("decks")}>{locale==="ko"?"덱 연구소":"Deck Lab"}</button></div>
    </section>
    <section className="d61-workflow" aria-label={locale==="ko"?"다이스 트리 이용 흐름":"Dice Tree workflow"}>
      <header><small>{locale==="ko"?"핵심 흐름":"CORE WORKFLOW"}</small><h2>{locale==="ko"?"재화를 넣고, 목표를 고르고, 경로를 확인합니다.":"Set resources, choose a target, inspect the route."}</h2></header>
      <ol><li><b>01</b><span><strong>{locale==="ko"?"재화 입력":"Set resources"}</strong><small>{locale==="ko"?"골드와 코어 보유량":"Gold and core balance"}</small></span></li><li><b>02</b><span><strong>{locale==="ko"?"목표 선택":"Choose target"}</strong><small>{locale==="ko"?"주사위와 투자 성향":"Dice and investment intent"}</small></span></li><li><b>03</b><span><strong>{locale==="ko"?"최적 경로":"Inspect route"}</strong><small>{locale==="ko"?"선행 조건과 총비용":"Prerequisites and total cost"}</small></span></li></ol>
    </section>
    <section className="d60-featured">
      <header><div><h2>{locale==="ko"?"랭킹에서 반복 관측된 덱":"Repeated ranked decks"}</h2><p>{locale==="ko"?"승률 예측이 아니라 동일 조합의 실제 관측 횟수입니다.":"Actual repeated appearances, not estimated win rates."}</p></div><button type="button" onClick={()=>onNavigate("decks")}>{locale==="ko"?"전체 보기":"View all"}</button></header>
      <div>{groups.map((group)=><article key={group.diceIds.join("|")}><div className="d60-deck-icons">{group.diceIds.map((id)=><DiceIcon key={id} diceId={id} label={name(data,id,locale)}/>)}</div><strong>{locale==="ko"?`${group.appearances}회 관측`:`${group.appearances} appearances`}</strong><span>{locale==="ko"?`최고 #${group.bestRank} · ${group.role==="dealer"?"딜러":"서포트"}`:`Best #${group.bestRank} · ${group.role}`}</span></article>)}</div>
    </section>
    <div className="d60-hero-dice" aria-label={locale==="ko"?"랭킹에서 자주 관측된 주사위":"Frequently observed dice"}>{usage.map((entry)=><button key={entry.diceId} type="button" onClick={()=>onSelectDice(entry.diceId)}><DiceIcon diceId={entry.diceId} label={name(data,entry.diceId,locale)}/><span>{name(data,entry.diceId,locale)}</span></button>)}</div>
    <p className="d61-source-line">{locale==="ko"?`공식 스토어 ${liveStatus.data.officialStore.version} · 계산 ${data.manifest.clientVersion} · 공개 랭킹 보존본 ${CO_OP_RANKING_SNAPSHOT_DATE.replaceAll("-",".")}`:`Official ${liveStatus.data.officialStore.version} · calculator ${data.manifest.clientVersion} · preserved ranking ${CO_OP_RANKING_SNAPSHOT_DATE}`}</p>
    <section className="d60-home-lower"><div><h2>{locale==="ko"?"랭킹 등장 주사위":"Dice in the ranking"}</h2>{usage.map((entry,index)=><button type="button" key={entry.diceId} onClick={()=>onSelectDice(entry.diceId)}><b>{index+1}</b><DiceIcon diceId={entry.diceId} label={name(data,entry.diceId,locale)}/><span>{name(data,entry.diceId,locale)}</span><em>{locale==="ko"?`${entry.decks}/${CO_OP_RANKING_SNAPSHOT.length}개 덱`:`${entry.decks}/${CO_OP_RANKING_SNAPSHOT.length} decks`}</em></button>)}</div><div><h2>{locale==="ko"?"빠른 도구":"Quick tools"}</h2>{tools.map(([id,title,description])=><button key={id} type="button" onClick={()=>onNavigate(id)}><span><strong>{locale==="ko"?title:id}</strong><small>{locale==="ko"?description:"Open this Diceify tool."}</small></span><b>→</b></button>)}</div></section>
  </main>;
}
