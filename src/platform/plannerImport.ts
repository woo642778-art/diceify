import {gameDataV3} from "../game-data/load";
import {playableDiceV3} from "../game-data/playableDice";
import {decodeV3} from "../share/codecV3";

export function validateImportedPlanner(value:unknown){
  try{
    const bytes=new TextEncoder().encode(JSON.stringify(value));
    if(bytes.length>256000)return {ok:false as const,error:"state_too_large"};
    let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);
    return decodeV3(`v3.${btoa(binary).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")}`,{
      validNodeIds:new Set(gameDataV3.tree.map((node)=>node.id)),
      maxRanks:new Map(gameDataV3.tree.map((node)=>[node.id,node.maxRank])),
      validDiceIds:new Set(playableDiceV3(gameDataV3).map((dice)=>dice.id)),
    });
  }catch{return {ok:false as const,error:"invalid_state"};}
}
