export interface ComparableBuild {
  deck: readonly string[];
  ranks: Record<string,number>;
  gold: number;
  core: number;
  gameDataVersion: string;
}

export function diffBuilds(before: ComparableBuild, after: ComparableBuild) {
  const nodes = [...new Set([...Object.keys(before.ranks),...Object.keys(after.ranks)])].sort().flatMap((id) => {
    const a = before.ranks[id] ?? 0, b = after.ranks[id] ?? 0;
    return a === b ? [] : [{ id,before:a,after:b,delta:b-a }];
  });
  return { addedDice:after.deck.filter((id) => !before.deck.includes(id)),removedDice:before.deck.filter((id) => !after.deck.includes(id)),nodes,goldDelta:after.gold-before.gold,coreDelta:after.core-before.core,versionMismatch:before.gameDataVersion!==after.gameDataVersion };
}

export function buildHealth(version: string, currentVersion: string, updatedAt: string, currentTime=Date.now()) {
  if (version !== currentVersion) return "outdated" as const;
  const age = currentTime-Date.parse(updatedAt);
  if (!Number.isFinite(age)) return "unknown" as const;
  return age>90*86400000 ? "review" as const : "current" as const;
}
