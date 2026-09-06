import {useMemo,useState} from "react";
import type {PlannerStateV3} from "../../../planner-v3/types";
import {gameDataV3} from "../../../game-data/load";
import {validateImportedPlanner} from "../../../platform/plannerImport";
import {resolveEnemyPresetV3} from "../../../simulation/enemies/presets";
import {CompareView} from "../compare/CompareView";
import {diffBuilds,buildHealth} from "../../../../worker/src/domain/builds";
import {simulatedInvestmentCost} from "../../../planner-v3/costs";

const KEY="dicetree.personal-lab.v1";
type Entry={id:string;name:string;note:string;state:PlannerStateV3;deck:string[];createdAt:string};
function readEntries():Entry[]{
  try{
    const items:unknown=JSON.parse(localStorage.getItem(KEY)??"[]");
    if(!Array.isArray(items))return [];
    return items.slice(0,20).flatMap((item)=>{
      if(!item||typeof item.name!=="string"||typeof item.id!=="string"||typeof item.createdAt!=="string")return [];
      const parsed=validateImportedPlanner(item.state);
      return parsed.ok?[{...item,state:parsed.state,note:String(item.note??""),deck:Array.isArray(item.deck)?item.deck.filter((id:unknown)=>typeof id==="string"):[]}]:[];
    });
  }catch{return [];}
}
function ranks(state:PlannerStateV3){return {...state.ownedRanks,...state.simulatedRanks};}
function comparable(entry:Entry){const cost=simulatedInvestmentCost(gameDataV3.tree,entry.state);return {deck:entry.deck,ranks:ranks(entry.state),gold:cost.gold,core:cost.stone,gameDataVersion:entry.state.dataVersion};}
function input(state:PlannerStateV3){return {...state.scenario,treeRanks:ranks(state),enemy:resolveEnemyPresetV3(state.scenario.enemyPresetId,state.scenario.enemyHpOverride,gameDataV3)};}

export function PersonalLab({locale,state,deck,onApply}:{locale:"ko"|"en";state:PlannerStateV3;deck:readonly string[];onApply:(state:PlannerStateV3)=>void}){
  const ko=locale==="ko";
  const [entries,setEntries]=useState(readEntries);
  const [name,setName]=useState("");const[note,setNote]=useState("");
  const [extraCore,setExtraCore]=useState(0);const[extraGold,setExtraGold]=useState(0);const[levelDelta,setLevelDelta]=useState(0);
  const [selected,setSelected]=useState<string[]>([]);const[notice,setNotice]=useState("");
  const scenario=useMemo(()=>({...state,inventory:{gold:state.inventory.gold+extraGold,stone:state.inventory.stone+extraCore},scenario:{...state.scenario,diceProgressionLevel:Math.min(100,state.scenario.diceProgressionLevel+levelDelta)}}),[state,extraCore,extraGold,levelDelta]);
  const persist=(next:Entry[])=>{try{localStorage.setItem(KEY,JSON.stringify(next));setEntries(next);return true;}catch{setNotice(ko?"저장 공간이 부족합니다. 기존 연구는 유지됩니다.":"Storage is full. Existing research is preserved.");return false;}};
  const save=()=>{
    if(!name.trim()||entries.length>=20)return;
    if(persist([{id:crypto.randomUUID(),name:name.trim(),note,state:scenario,deck:[...deck],createdAt:new Date().toISOString()},...entries])){setName("");setNotice(ko?"가상 시나리오를 비공개로 저장했습니다.":"Saved a private scenario.");}
  };
  const apply=(entry:Entry)=>{
    // Keep the original before changing the active planner.
    if(entries.length>=20){setNotice(ko?"원본 백업을 위해 저장 공간을 한 칸 비워 주세요.":"Free one slot for the original backup.");return;}
    if(persist([{id:crypto.randomUUID(),name:ko?"적용 전 원본":"Before applying",note:"",state:structuredClone(state),deck:[...deck],createdAt:new Date().toISOString()},...entries]))onApply(entry.state);
  };
  const pair=selected.map((id)=>entries.find((entry)=>entry.id===id)).filter((entry):entry is Entry=>Boolean(entry));
  const difference=pair.length===2?diffBuilds(comparable(pair[0]),comparable(pair[1])):null;
  return <section className="v58-personal-lab" data-testid="personal-lab"><header><small>PERSONAL LAB</small><h2>{ko?"내 연구":"Personal research"}</h2><p>{ko?"현재 계정을 바꾸지 않고 미래 재화와 레벨을 시험하고, 두 시나리오의 차이를 비교하세요. 이 브라우저에 최대 20개를 비공개 저장합니다.":"Test future resources and levels without changing your account. Save up to 20 private scenarios in this browser."}</p></header>
    <div className="v58-online-layout"><section className="v58-compose"><label>{ko?"연구 이름":"Research name"}<input value={name} maxLength={80} onChange={(e)=>setName(e.target.value)}/></label><label>{ko?"추가 골드":"Additional gold"}<input type="number" min={0} max={100000000} value={extraGold} onChange={(e)=>setExtraGold(Math.max(0,Math.min(100000000,Number(e.target.value)||0)))}/></label><label>{ko?"추가 다이스 코어":"Additional cores"}<input type="number" min={0} max={100000} value={extraCore} onChange={(e)=>setExtraCore(Math.max(0,Math.min(100000,Number(e.target.value)||0)))}/></label><label>{ko?"주사위 레벨 증가":"Dice level increase"}<input type="number" min={0} max={20} value={levelDelta} onChange={(e)=>setLevelDelta(Math.max(0,Math.min(20,Number(e.target.value)||0)))}/></label><label>{ko?"비공개 메모":"Private notes"}<textarea value={note} maxLength={2000} onChange={(e)=>setNote(e.target.value)}/></label><button disabled={!name.trim()||entries.length>=20} onClick={save}>{ko?"시나리오 저장":"Save scenario"}</button><p>{ko?"재화 추가만으로 DPS가 오르지는 않습니다. 저장한 시나리오를 적용한 뒤 기존 투자 플래너에서 경로를 계산할 수 있습니다.":"Resources alone do not increase DPS. Apply a saved scenario to evaluate routes in the investment planner."}</p></section>
    <section className="v58-public-grid">{entries.map((entry)=><article key={entry.id}><header><span>{buildHealth(entry.state.dataVersion,state.dataVersion,entry.createdAt)}</span><time>{new Date(entry.createdAt).toLocaleDateString()}</time></header><h3>{entry.name}</h3><p>{entry.note}</p><p>{entry.state.inventory.gold.toLocaleString()} G · {entry.state.inventory.stone.toLocaleString()} C · Lv.{entry.state.scenario.diceProgressionLevel}</p><footer><label><input type="checkbox" checked={selected.includes(entry.id)} disabled={selected.length>=2&&!selected.includes(entry.id)} onChange={(e)=>setSelected(e.target.checked?[...selected,entry.id]:selected.filter((id)=>id!==entry.id))}/>{ko?"비교 선택":"Compare"}</label><button onClick={()=>apply(entry)}>{ko?"원본 보관 후 적용":"Back up and apply"}</button><button onClick={()=>{if(persist(entries.filter((item)=>item.id!==entry.id)))setSelected(selected.filter((id)=>id!==entry.id));}}>{ko?"삭제":"Delete"}</button></footer></article>)}{!entries.length&&<p className="v58-empty">{ko?"저장한 연구가 없습니다. 첫 시나리오를 만들어 보세요.":"No saved research. Create your first scenario."}</p>}</section></div>
    {notice&&<p role="status">{notice}</p>}
    {difference&&<section className="v58-build-diff"><h3>{ko?"두 연구의 차이":"Research differences"}</h3><p>Gold {difference.goldDelta.toLocaleString()} · Core {difference.coreDelta.toLocaleString()} · {ko?"변경 노드":"Changed nodes"} {difference.nodes.length}</p>{difference.versionMismatch&&<p>{ko?"서로 다른 게임 데이터 버전입니다. 현재 데이터 기준 계산을 확인하세요.":"Data versions differ. Calculations use current data."}</p>}<ul>{difference.nodes.map((node)=><li key={node.id}>#{node.id}: {node.before} → {node.after}</li>)}</ul><CompareView data={gameDataV3} locale={locale} left={input(pair[0].state)} right={input(pair[1].state)}/></section>}
  </section>;
}
