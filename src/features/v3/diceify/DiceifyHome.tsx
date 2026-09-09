import { useMemo,useState } from "react";
import { CO_OP_RANKING_SNAPSHOT,CO_OP_RANKING_SNAPSHOT_DATE,summarizeDiceUsage } from "../../../deck-lab/coOpRankingSnapshot";
import { groupObservedDecks } from "../../../diceify/observedMeta";
import type { CanonicalGameData } from "../../../game-data/types";
import { DiceIcon } from "../shared/DiceIcon";

type Destination="decks"|"dice"|"tree"|"rankings"|"guild"|"account";
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

export function DiceifyHome({data,locale,onNavigate,onSelectDice}:{data:CanonicalGameData;locale:"ko"|"en";onNavigate:(to:Destination)=>void;onSelectDice:(id:string)=>void}){
  const [query,setQuery]=useState("");
  const [notice,setNotice]=useState("");
  const groups=useMemo(()=>groupObservedDecks().slice(0,5),[]);
  const usage=useMemo(()=>summarizeDiceUsage().slice(0,5),[]);
  const search=()=>{
    const clean=query.normalize("NFKC").trim().toLocaleLowerCase();
    if(!clean)return;
    const dice=data.dice.find((entry)=>`${entry.id} ${name(data,entry.id,"ko")} ${name(data,entry.id,"en")}`.toLocaleLowerCase().includes(clean));
    if(dice){onSelectDice(dice.id);return;}
    setNotice(locale==="ko"?"현재 닉네임·PID 실시간 조회 공급자가 연결되지 않았습니다. 계정 화면에서 지원 범위를 확인할 수 있습니다.":"Live nickname/PID lookup is not connected. See the account page for availability.");
  };
  return <main className="d60-home" data-testid="diceify-home">
    <section className="d60-home-hero">
      <h1>{locale==="ko"?<>지금 쓰는 덱,<br/><em>근거부터</em> 확인하세요.</>:<>Check the evidence<br/>behind your deck.</>}</h1>
      <p>{locale==="ko"?"최신 클라이언트 데이터와 공개 랭킹 자료를 한곳에서 봅니다.":"Explore current client data and preserved public ranking evidence in one place."}</p>
      <form onSubmit={(event)=>{event.preventDefault();search();}}>
        <input aria-label={locale==="ko"?"Diceify 통합 검색":"Diceify search"} value={query} onChange={(event)=>setQuery(event.target.value)} placeholder={locale==="ko"?"주사위 이름 검색 · 계정 조회 준비 중":"Search dice · account lookup pending"}/>
        <button>{locale==="ko"?"검색":"Search"}</button>
      </form>
      {notice&&<p role="status" className="d60-search-notice">{notice}<button type="button" onClick={()=>onNavigate("account")}>{locale==="ko"?"계정 화면":"Account"}</button></p>}
      <div className="d60-hero-dice" aria-label={locale==="ko"?"랭킹에서 자주 관측된 주사위":"Frequently observed dice"}>{usage.map((entry)=><button key={entry.diceId} type="button" onClick={()=>onSelectDice(entry.diceId)}><DiceIcon diceId={entry.diceId} label={name(data,entry.diceId,locale)}/><span>{name(data,entry.diceId,locale)}</span></button>)}</div>
      <small>{locale==="ko"?`게임 ${data.manifest.clientVersion} · 공개 랭킹 스냅샷 ${CO_OP_RANKING_SNAPSHOT_DATE.replaceAll("-",".")}`:`Game ${data.manifest.clientVersion} · ranking snapshot ${CO_OP_RANKING_SNAPSHOT_DATE}`}</small>
    </section>
    <section className="d60-featured">
      <header><div><h2>{locale==="ko"?"랭킹에서 반복 관측된 덱":"Repeated ranked decks"}</h2><p>{locale==="ko"?"승률 예측이 아니라 동일 조합의 실제 관측 횟수입니다.":"Actual repeated appearances, not estimated win rates."}</p></div><button type="button" onClick={()=>onNavigate("decks")}>{locale==="ko"?"전체 보기":"View all"}</button></header>
      <div>{groups.map((group)=><article key={group.diceIds.join("|")}><div className="d60-deck-icons">{group.diceIds.map((id)=><DiceIcon key={id} diceId={id} label={name(data,id,locale)}/>)}</div><strong>{locale==="ko"?`${group.appearances}회 관측`:`${group.appearances} appearances`}</strong><span>{locale==="ko"?`최고 #${group.bestRank} · ${group.role==="dealer"?"딜러":"서포트"}`:`Best #${group.bestRank} · ${group.role}`}</span></article>)}</div>
    </section>
    <section className="d60-home-lower"><div><h2>{locale==="ko"?"랭킹 등장 주사위":"Dice in the ranking"}</h2>{usage.map((entry,index)=><button type="button" key={entry.diceId} onClick={()=>onSelectDice(entry.diceId)}><b>{index+1}</b><DiceIcon diceId={entry.diceId} label={name(data,entry.diceId,locale)}/><span>{name(data,entry.diceId,locale)}</span><em>{locale==="ko"?`${entry.decks}/${CO_OP_RANKING_SNAPSHOT.length}개 덱`:`${entry.decks}/${CO_OP_RANKING_SNAPSHOT.length} decks`}</em></button>)}</div><div><h2>{locale==="ko"?"빠른 도구":"Quick tools"}</h2>{tools.map(([id,title,description])=><button key={id} type="button" onClick={()=>onNavigate(id)}><span><strong>{locale==="ko"?title:id}</strong><small>{locale==="ko"?description:"Open this Diceify tool."}</small></span><b>→</b></button>)}</div></section>
  </main>;
}
