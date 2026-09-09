import { useState } from "react";
import { CO_OP_RANKING_SNAPSHOT,CO_OP_RANKING_SNAPSHOT_DATE,CO_OP_RANKING_SOURCE_COUNT } from "../../../deck-lab/coOpRankingSnapshot";
import type { CanonicalGameData } from "../../../game-data/types";
import { DiceIcon } from "../shared/DiceIcon";

function name(data:CanonicalGameData,id:string,locale:"ko"|"en"){
  const dice=data.dice.find((entry)=>entry.id===id);return dice?.nameKey?data.localization[locale][dice.nameKey]??id:id;
}
export function RankingDirectoryV60({data,locale,onApply}:{data:CanonicalGameData;locale:"ko"|"en";onApply:(ids:string[])=>void}){
  const [role,setRole]=useState<"all"|"dealer"|"support">("all");
  const decks=CO_OP_RANKING_SNAPSHOT.filter((entry)=>role==="all"||entry.role===role);
  return <main className="d60-ranking" data-testid="diceify-ranking"><header><div><h1>{locale==="ko"?"협동 랭킹":"Co-op ranking"}</h1><p>{locale==="ko"?`${CO_OP_RANKING_SOURCE_COUNT}장의 공개 화면에서 판독한 1~105위 덱입니다.`:`Ranks 1–105 transcribed from ${CO_OP_RANKING_SOURCE_COUNT} public captures.`}</p></div><small>{CO_OP_RANKING_SNAPSHOT_DATE.replaceAll("-",".")} · {locale==="ko"?"실시간 아님":"not live"}</small></header><nav aria-label={locale==="ko"?"랭킹 역할 필터":"Ranking role filter"}>{(["all","dealer","support"] as const).map((item)=><button type="button" key={item} className={role===item?"is-active":""} onClick={()=>setRole(item)}>{item==="all"?(locale==="ko"?"전체":"All"):item==="dealer"?(locale==="ko"?"딜러":"Dealer"):(locale==="ko"?"서포트":"Support")}</button>)}</nav><section>{decks.map((deck)=><article key={deck.rank}><b>#{deck.rank}</b><div>{deck.diceIds.map((id)=><span key={id}><DiceIcon diceId={id} label={name(data,id,locale)}/><small>{name(data,id,locale)}</small></span>)}</div><em>{deck.role==="dealer"?(locale==="ko"?"딜러":"Dealer"):(locale==="ko"?"서포트":"Support")}</em><strong>{deck.score?.toLocaleString()??(locale==="ko"?"점수 미확인":"Score unavailable")}</strong><button type="button" onClick={()=>onApply([...deck.diceIds])}>{locale==="ko"?"덱 분석":"Analyze"}</button></article>)}</section><footer>{locale==="ko"?"점수는 화면에서 확인된 상위 7개 항목에만 표시합니다. 나머지 값을 추정하지 않습니다.":"Scores appear only for the seven entries visible in the source captures; missing values are not estimated."}</footer></main>;
}
