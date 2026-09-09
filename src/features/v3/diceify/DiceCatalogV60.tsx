import { useMemo,useState } from "react";
import { formatGameText } from "../../../game-data/formatGameText";
import { playableDiceV3 } from "../../../game-data/playableDice";
import type { CanonicalGameData } from "../../../game-data/types";
import { DiceIcon } from "../shared/DiceIcon";

function name(data:CanonicalGameData,id:string,locale:"ko"|"en"){
  const dice=data.dice.find((entry)=>entry.id===id);
  return dice?.nameKey?data.localization[locale][dice.nameKey]??id:id;
}

export function DiceCatalogV60({data,locale,onSimulate}:{data:CanonicalGameData;locale:"ko"|"en";onSimulate:(id:string)=>void}){
  const dice=useMemo(()=>playableDiceV3(data),[data]);
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState(dice[0]?.id??"");
  const filtered=dice.filter((entry)=>`${entry.id} ${name(data,entry.id,"ko")} ${name(data,entry.id,"en")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const detail=dice.find((entry)=>entry.id===selected)??filtered[0];
  return <main className="d60-catalog" data-testid="diceify-dice-catalog">
    <header><div><h1>{locale==="ko"?"주사위":"Dice"}</h1><p>{locale==="ko"?`${data.manifest.clientVersion} 클라이언트에서 확인한 플레이 가능 주사위 ${dice.length}종입니다.`:`${dice.length} playable dice from client ${data.manifest.clientVersion}.`}</p></div><input aria-label={locale==="ko"?"주사위 이름 검색":"Search dice"} placeholder={locale==="ko"?"주사위 이름 검색":"Search dice"} value={query} onChange={(e)=>setQuery(e.target.value)}/></header>
    <div className="d60-catalog-layout"><section className="d60-dice-list">{filtered.map((entry)=><button type="button" key={entry.id} className={detail?.id===entry.id?"is-active":""} onClick={()=>setSelected(entry.id)}><DiceIcon diceId={entry.id} label={name(data,entry.id,locale)}/><span><strong>{name(data,entry.id,locale)}</strong><small>{entry.family??"-"} · ID {entry.numericId??entry.id}</small></span></button>)}</section>{detail&&<aside><header><DiceIcon diceId={detail.id} label={name(data,detail.id,locale)}/><div><h2>{name(data,detail.id,locale)}</h2><span>{detail.family??"-"} · ID {detail.numericId??detail.id}</span></div></header><p>{formatGameText(detail.descriptionKey?data.localization[locale][detail.descriptionKey]??"":"",locale)|| (locale==="ko"?"클라이언트 설명 데이터가 없습니다.":"No client description is available.")}</p><dl><div><dt>{locale==="ko"?"공격력":"Attack"}</dt><dd>{detail.baseStats.attack??"-"}</dd></div><div><dt>{locale==="ko"?"공격 간격":"Interval"}</dt><dd>{detail.baseStats.attackInterval??"-"}</dd></div><div><dt>{locale==="ko"?"공격 대상":"Target"}</dt><dd>{String(detail.baseStats.extra.TargetType??"-")}</dd></div></dl><small>{locale==="ko"?"출처: 1.1.0 클라이언트 테이블. 미확인 특수 공식은 계산하지 않습니다.":"Source: client 1.1.0 tables. Unknown special formulas are excluded."}</small><button type="button" onClick={()=>onSimulate(detail.id)}>{locale==="ko"?"시뮬레이터에서 열기":"Open in simulator"}</button></aside>}</div>
  </main>;
}
