import { describe,expect,it } from "vitest";
import { groupObservedDecks } from "./observedMeta";

describe("groupObservedDecks",()=>{
  it("groups exact observed compositions without inventing win rates",()=>{
    const groups=groupObservedDecks([
      {rank:1,diceIds:["a","b","c","d","e"],role:"dealer"},
      {rank:4,diceIds:["e","d","c","b","a"],role:"dealer"},
      {rank:2,diceIds:["a","b","c","d","f"],role:"support"},
    ]);
    expect(groups[0]).toMatchObject({appearances:2,bestRank:1,ranks:[1,4]});
    expect(groups[0]).not.toHaveProperty("winRate");
  });
});
