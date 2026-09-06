import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanonicalGameData, DiceFamilyV3, DiceTreeNodeV3 } from "../../../game-data/types";
import { localizeGameKey } from "../../../game-data/load";
import { formatGameText } from "../../../game-data/formatGameText";
import { nextRankCost } from "../../../planner-v3/costs";
import { bindNativeTreeGestureGuardV55, clampTreeScale, MAX_TREE_SCALE, usePanZoom } from "../../tree/usePanZoom";
import { TreeNodeV3 } from "./TreeNodeV3";
import type { TreeHeatmapEntryV3, TreeHeatmapModeV3 } from "../../../optimizer/treeHeatmapV3";

export interface TreeCanvasV3Props {
  data: CanonicalGameData;
  nodes: readonly DiceTreeNodeV3[];
  ownedRanks: Record<string, number>;
  simulatedRanks: Record<string, number>;
  selectedNodeId?: string;
  selectedDiceId?: string;
  recommendedIds?: ReadonlySet<string>;
  heatmap?: ReadonlyMap<string, TreeHeatmapEntryV3>;
  heatmapMode?: TreeHeatmapModeV3;
  showCosts?: boolean;
  focusPrerequisites?: boolean;
  familyFilter?: DiceFamilyV3 | "all";
  query?: string;
  locale: "ko" | "en";
  onSelect: (nodeId: string) => void;
  command?: { id: number; type: "zoomIn" | "zoomOut" | "fit" | "selected" };
}

const FAMILY_LABEL: Record<DiceFamilyV3, { ko: string; en: string }> = {
  nature: { ko: "자연", en: "Nature" },
  chaos: { ko: "혼돈", en: "Chaos" },
  order: { ko: "질서", en: "Order" },
  engineering: { ko: "공학", en: "Engineering" },
  magic: { ko: "마법", en: "Magic" },
};

const FAMILY_ORDER: DiceFamilyV3[] = ["nature", "chaos", "order", "engineering", "magic"];
const INITIAL_VIEW = { x: 0, y: 0, scale: 3.6 };
const FIT_VIEW = { x: 0, y: 0, scale: 0.92 };
const TREE_BASE_IMAGE_URL = `${import.meta.env.BASE_URL}tree-assets/dice-tree-base.webp`;

const FAMILY_COUNTER_POSITION: Record<DiceFamilyV3, { x: number; y: number }> = {
  nature: { x: 0, y: -154 },
  chaos: { x: 226, y: -18 },
  order: { x: -226, y: -18 },
  engineering: { x: -124, y: 158 },
  magic: { x: 124, y: 158 },
};

function rankFor(
  nodeId: string,
  ownedRanks: Record<string, number>,
  simulatedRanks: Record<string, number>,
) {
  return Math.max(ownedRanks[nodeId] ?? 0, simulatedRanks[nodeId] ?? 0);
}

export type FamilyInvestmentLevelsV3 = Record<DiceFamilyV3, number>;

export function familyInvestmentLevelsV3(
  nodes: readonly DiceTreeNodeV3[],
  ownedRanks: Record<string, number>,
  simulatedRanks: Record<string, number>,
): FamilyInvestmentLevelsV3 {
  const levels: FamilyInvestmentLevelsV3 = {
    nature: 0,
    chaos: 0,
    order: 0,
    engineering: 0,
    magic: 0,
  };
  for (const node of nodes) {
    if (node.family === "core" || node.kind === "connector") continue;
    levels[node.family] += Math.min(node.maxRank, rankFor(node.id, ownedRanks, simulatedRanks));
  }
  return levels;
}

function DiceTreeCoreV3({
  levels,
  locale,
}: {
  levels: FamilyInvestmentLevelsV3;
  locale: "ko" | "en";
}) {
  const summary = FAMILY_ORDER
    .map((family) => `${FAMILY_LABEL[family][locale]} ${levels[family]}`)
    .join(", ");

  return <g
    className="v46-tree-core"
    data-testid="v46-tree-core"
    role="group"
    aria-label={`${locale === "ko" ? "다이스 트리" : "Dice Tree"}: ${summary}`}
  >
    <image
      className="v46-tree-core-base"
      href={TREE_BASE_IMAGE_URL}
      x="-150"
      y="-103"
      width="300"
      height="206"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    />
    <g className="v46-tree-core-mark" aria-hidden="true">
      <path className="v46-tree-core-cube is-blue" d="M-31-42l20-11 20 11v23L-11-8l-20-11z" />
      <path className="v46-tree-core-cube is-violet" d="M2-36l18-10 18 10v21L20-5 2-15z" />
      <path className="v46-tree-core-cube-line" d="M-31-42l20 11 20-11M-11-31v23M2-36l18 10 18-10M20-26v21" />
    </g>
    <text className="v46-tree-core-title" x="0" y="39" textAnchor="middle">
      {locale === "ko" ? "다이스 트리" : "DICE TREE"}
    </text>
    {FAMILY_ORDER.map((family) => {
      const position = FAMILY_COUNTER_POSITION[family];
      const level = levels[family];
      return <g
        key={`${family}-${level}`}
        className={`v46-tree-family-count family-${family}`}
        data-testid={`v46-family-count-${family}`}
        data-level={level}
        transform={`translate(${position.x} ${position.y})`}
        aria-hidden="true"
      >
        <text className="v46-tree-family-label" x="0" y="-7" textAnchor="middle">{FAMILY_LABEL[family][locale]}</text>
        <text className="v46-tree-family-level" x="0" y="30" textAnchor="middle">{level}</text>
      </g>;
    })}
  </g>;
}

export function prerequisitesSatisfiedV3(
  node: DiceTreeNodeV3,
  ownedRanks: Record<string, number>,
  simulatedRanks: Record<string, number>,
) {
  return node.prerequisites.every((prerequisite) => (
    rankFor(prerequisite.nodeId, ownedRanks, simulatedRanks) >= prerequisite.minRank
  ));
}

export function canIncrementNodeV3(
  node: DiceTreeNodeV3,
  ownedRanks: Record<string, number>,
  simulatedRanks: Record<string, number>,
) {
  const current = rankFor(node.id, ownedRanks, simulatedRanks);
  return current < node.maxRank && prerequisitesSatisfiedV3(node, ownedRanks, simulatedRanks);
}

export function prerequisiteClosureIdsV57(nodes: readonly DiceTreeNodeV3[], targetId?: string) {
  if (!targetId) return new Set<string>();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result = new Set<string>();
  const visit = (nodeId: string) => {
    if (result.has(nodeId)) return;
    const node = byId.get(nodeId);
    if (!node) return;
    result.add(nodeId);
    node.prerequisites.forEach((entry) => visit(entry.nodeId));
  };
  visit(targetId);
  return result;
}

function boundsOf(nodes: readonly DiceTreeNodeV3[]) {
  if (!nodes.length) return { minX: -100, maxX: 100, minY: -100, maxY: 100, width: 200, height: 200 };
  const xs = nodes.map((node) => node.position.x);
  const ys = nodes.map((node) => -node.position.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

export interface TreeRenderViewportV52 {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function visibleTreeNodeIdsV52(
  nodes: readonly DiceTreeNodeV3[],
  view: { x: number; y: number; scale: number },
  viewport: TreeRenderViewportV52,
  keepIds: ReadonlySet<string> = new Set(),
) {
  const buffer = 180 / Math.max(1, view.scale);
  const minX = (viewport.minX - view.x) / view.scale - buffer;
  const maxX = (viewport.maxX - view.x) / view.scale + buffer;
  const minY = (viewport.minY - view.y) / view.scale - buffer;
  const maxY = (viewport.maxY - view.y) / view.scale + buffer;
  return new Set(nodes
    .filter((node) => {
      if (keepIds.has(node.id)) return true;
      const x = node.position.x;
      const y = -node.position.y;
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    })
    .map((node) => node.id));
}

function useMobileSafeTreeRenderingV52() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const coarse = window.matchMedia("(pointer: coarse)");
    const narrow = window.matchMedia("(max-width: 980px)");
    const update = () => setEnabled(coarse.matches || narrow.matches);
    update();
    coarse.addEventListener?.("change", update);
    narrow.addEventListener?.("change", update);
    return () => {
      coarse.removeEventListener?.("change", update);
      narrow.removeEventListener?.("change", update);
    };
  }, []);
  return enabled;
}

export function normalizeTreeSearchText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[\s·_.:/+%()-]+/g, "");
}

const SEARCH_SYNONYM_GROUPS = [
  ["공격속도", "공속", "attack speed", "attack interval"],
  ["공격력", "대미지", "데미지", "damage", "attack"],
  ["치명타", "크리티컬", "critical", "crit"],
  ["보스", "boss"],
  ["골드", "gold"],
  ["다이스코어", "코어", "stone", "dice core"],
  ["소환", "sp", "summon"],
  ["합성", "merge"],
  ["감속", "slow"],
  ["기절", "stun"],
] as const;

function linkedValues(data: CanonicalGameData, node: DiceTreeNodeV3): Array<number | string | null | undefined> {
  if (node.passiveOrRuneRef?.startsWith("passive:")) {
    const passive = data.passives.find((entry) => entry.id === node.passiveOrRuneRef?.slice(8));
    return passive ? [passive.baseValue, passive.valuePerRank] : [];
  }
  if (node.passiveOrRuneRef?.startsWith("rune:")) {
    const rune = data.runes.find((entry) => entry.id === node.passiveOrRuneRef?.slice(5));
    return rune ? Object.values(rune.values).map((value) => typeof value === "boolean" ? String(value) : value) : [];
  }
  return [];
}

export function treeNodeSearchTextV3(data: CanonicalGameData, node: DiceTreeNodeV3, locale: "ko" | "en") {
  const name = localizeGameKey(node.nameKey ?? undefined, locale, node.id);
  const rawDescription = localizeGameKey(node.descriptionKey ?? undefined, locale, "");
  const linked = node.passiveOrRuneRef?.startsWith("passive:")
    ? data.passives.find((entry) => entry.id === node.passiveOrRuneRef?.slice(8))
    : node.passiveOrRuneRef?.startsWith("rune:")
      ? data.runes.find((entry) => entry.id === node.passiveOrRuneRef?.slice(5))
      : undefined;
  const linkedName = linked?.nameKey ? localizeGameKey(linked.nameKey, locale, "") : "";
  const linkedDescription = linked?.descriptionKey ? localizeGameKey(linked.descriptionKey, locale, "") : "";
  const formatted = formatGameText(`${rawDescription} ${linkedDescription}`, locale, linkedValues(data, node));
  const semanticFields = linked && "values" in linked
    ? `${linked.kind ?? ""} ${linked.grade ?? ""} ${Object.keys(linked.values).join(" ")}`
    : linked ? `${linked.scope} ${linked.valueType ?? ""} ${linked.statKey ?? ""}` : "";
  const base = [name, rawDescription, formatted, linkedName, semanticFields, node.id, node.targetId, node.passiveOrRuneRef, node.kind, node.family].filter(Boolean).join(" ");
  const normalizedBase = normalizeTreeSearchText(base);
  const synonyms = SEARCH_SYNONYM_GROUPS
    .filter((group) => group.some((term) => normalizedBase.includes(normalizeTreeSearchText(term))))
    .flat();
  return normalizeTreeSearchText(`${base} ${synonyms.join(" ")}`);
}

export function TreeCanvasV3({
  data,
  nodes,
  ownedRanks,
  simulatedRanks,
  selectedNodeId,
  selectedDiceId,
  recommendedIds = new Set<string>(),
  heatmap = new Map<string, TreeHeatmapEntryV3>(),
  heatmapMode = "none",
  showCosts = true,
  focusPrerequisites = true,
  familyFilter = "all",
  query = "",
  locale,
  onSelect,
  command,
}: TreeCanvasV3Props) {
  const canvasRef = useRef<SVGSVGElement>(null);
  const transformRef = useRef<SVGGElement>(null);
  const minimapViewportRef = useRef<SVGRectElement>(null);
  const minimapWorldRef = useRef({ x: -100, y: -100, width: 200, height: 200 });
  const updateMinimapViewport = useCallback((next: { x: number; y: number; scale: number }) => {
    const viewport = minimapViewportRef.current;
    if (!viewport) return;
    const world = minimapWorldRef.current;
    viewport.setAttribute("x", String((world.x - next.x) / next.scale));
    viewport.setAttribute("y", String((world.y - next.y) / next.scale));
    viewport.setAttribute("width", String(world.width / next.scale));
    viewport.setAttribute("height", String(world.height / next.scale));
  }, []);
  const renderTransientView = useCallback((next: { x: number; y: number; scale: number }) => {
    transformRef.current?.setAttribute("transform", `translate(${next.x} ${next.y}) scale(${next.scale})`);
    canvasRef.current?.setAttribute("data-scale", next.scale.toFixed(2));
    updateMinimapViewport(next);
  }, [updateMinimapViewport]);
  const markInteraction = useCallback((active: boolean) => {
    if (canvasRef.current) canvasRef.current.dataset.interacting = String(active);
  }, []);
  const { view, setView, consumePointerClick, bind } = usePanZoom(INITIAL_VIEW, {
    onTransientView: renderTransientView,
    onInteractionChange: markInteraction,
  });
  const [gestureHintVisible, setGestureHintVisible] = useState(() => {
    try { return window.localStorage.getItem("dicetree:v53:tree-gesture-seen") !== "1"; }
    catch { return true; }
  });
  const mobileSafeRendering = useMobileSafeTreeRenderingV52();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return bindNativeTreeGestureGuardV55(canvas);
  }, []);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const bounds = useMemo(() => boundsOf(nodes), [nodes]);
  const margin = Math.max(260, Math.max(bounds.width, bounds.height) * 0.05);
  const viewBox = `${bounds.minX - margin} ${bounds.minY - margin} ${bounds.width + margin * 2} ${bounds.height + margin * 2}`;
  minimapWorldRef.current = {
    x: bounds.minX - margin,
    y: bounds.minY - margin,
    width: bounds.width + margin * 2,
    height: bounds.height + margin * 2,
  };
  const center = useMemo(() => ({
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  }), [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY]);
  const normalizedQuery = normalizeTreeSearchText(query.trim());
  const familyLevels = useMemo(
    () => familyInvestmentLevelsV3(nodes, ownedRanks, simulatedRanks),
    [nodes, ownedRanks, simulatedRanks],
  );
  const prerequisiteFocusIds = useMemo(
    () => focusPrerequisites ? prerequisiteClosureIdsV57(nodes, selectedNodeId) : new Set<string>(),
    [focusPrerequisites, nodes, selectedNodeId],
  );

  useEffect(() => updateMinimapViewport(view), [updateMinimapViewport, view]);

  const matchingNodes = useMemo(() => {
    const matches: DiceTreeNodeV3[] = [];
    for (const node of nodes) {
      const familyMatches = familyFilter === "all" || node.family === "core" || node.family === familyFilter;
      const family = node.family === "core" ? "core" : `${node.family} ${FAMILY_LABEL[node.family][locale]}`;
      const searchableText = `${treeNodeSearchTextV3(data, node, locale)}${normalizeTreeSearchText(family)}`;
      const queryMatches = !normalizedQuery
        || searchableText.includes(normalizedQuery);
      if (familyMatches && queryMatches) matches.push(node);
    }
    return matches;
  }, [data, familyFilter, locale, nodes, normalizedQuery]);

  const visibleIds = useMemo(() => new Set(matchingNodes.map((node) => node.id)), [matchingNodes]);
  const renderIds = useMemo(() => {
    if (!mobileSafeRendering || view.scale < 1.15) return new Set(nodes.map((node) => node.id));
    const keepIds = new Set<string>([...recommendedIds, ...visibleIds, ...prerequisiteFocusIds]);
    if (!normalizedQuery) keepIds.clear();
    if (selectedNodeId) keepIds.add(selectedNodeId);
    return visibleTreeNodeIdsV52(nodes, view, {
      minX: bounds.minX - margin,
      maxX: bounds.maxX + margin,
      minY: bounds.minY - margin,
      maxY: bounds.maxY + margin,
    }, keepIds);
  }, [bounds.maxX, bounds.maxY, bounds.minX, bounds.minY, margin, mobileSafeRendering, nodes, normalizedQuery, prerequisiteFocusIds, recommendedIds, selectedNodeId, view, visibleIds]);

  const jumpToNodes = useCallback((targets: readonly DiceTreeNodeV3[], minimumScale = 1.15) => {
    if (!targets.length) return;
    const targetX = targets.reduce((sum, node) => sum + node.position.x, 0) / targets.length;
    const targetY = targets.reduce((sum, node) => sum - node.position.y, 0) / targets.length;
    setView((current) => {
      const scale = Math.max(minimumScale, current.scale);
      return {
        x: center.x - targetX * scale,
        y: center.y - targetY * scale,
        scale,
      };
    });
  }, [center.x, center.y, setView]);

  useEffect(() => {
    if (!normalizedQuery || matchingNodes.length === 0) return;
    jumpToNodes(matchingNodes, 2.8);
  }, [jumpToNodes, matchingNodes, normalizedQuery]);

  const selectedDiceNodes = selectedDiceId
    ? nodes.filter((node) => node.targetId === selectedDiceId || node.id === selectedDiceId)
    : [];

  const zoomBy = (delta: number) => setView((current) => ({
    ...current,
    scale: clampTreeScale(current.scale + delta),
  }));

  useEffect(() => {
    if (!command) return;
    if (command.type === "fit") setView(FIT_VIEW);
    if (command.type === "zoomIn") zoomBy(0.3);
    if (command.type === "zoomOut") zoomBy(-0.25);
    if (command.type === "selected" && selectedNodeId) {
      const target = byId.get(selectedNodeId);
      if (target) jumpToNodes([target], 2.8);
    }
  // command.id is the explicit event nonce; helper identities are stable enough for one-shot controls.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.id]);

  const dismissGestureHint = () => {
    setGestureHintVisible(false);
    try { window.localStorage.setItem("dicetree:v53:tree-gesture-seen", "1"); } catch { /* Optional preference. */ }
  };

  const selectFromPointer = (nodeId: string) => {
    if (!consumePointerClick()) onSelect(nodeId);
  };

  return <div className="v3-tree-wrap">
    <svg
      ref={canvasRef}
      className="v3-tree-canvas"
      data-testid="v3-tree-canvas"
      data-scale={view.scale.toFixed(2)}
      data-render-profile={mobileSafeRendering ? "mobile-safe" : "full"}
      data-rendered-nodes={renderIds.size}
      data-interacting="false"
      viewBox={viewBox}
      role="tree"
      aria-label={locale === "ko" ? "랜덤다이스2 인게임 다이스 트리" : "Random Dice 2 in-game Dice Tree"}
      {...bind}
    >
      <defs>
        <linearGradient id="v3-recommend-edge" x1="0" x2="1">
          <stop offset="0" stopColor="#765ce9" />
          <stop offset="1" stopColor="#e7b34e" />
        </linearGradient>
      </defs>
      <rect
        className="v3-tree-background"
        x={bounds.minX - margin}
        y={bounds.minY - margin}
        width={bounds.width + margin * 2}
        height={bounds.height + margin * 2}
        aria-hidden="true"
      />
      <g ref={transformRef} className="v3-tree-transform" data-testid="v3-tree-transform" transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
        {nodes.flatMap((node) => node.prerequisites.map((prerequisite) => {
          const parent = byId.get(prerequisite.nodeId);
          if (!parent || (!renderIds.has(parent.id) && !renderIds.has(node.id))) return null;
          const parentRank = rankFor(parent.id, ownedRanks, simulatedRanks);
          const nodeRank = rankFor(node.id, ownedRanks, simulatedRanks);
          const parentSimulated = (simulatedRanks[parent.id] ?? 0) > (ownedRanks[parent.id] ?? 0);
          const nodeSimulated = (simulatedRanks[node.id] ?? 0) > (ownedRanks[node.id] ?? 0);
          const invested = parentRank >= prerequisite.minRank && nodeRank > 0;
          const simulated = invested && (parentSimulated || nodeSimulated);
          const recommended = recommendedIds.has(parent.id) && recommendedIds.has(node.id);
          const dimmed = !visibleIds.has(parent.id) && !visibleIds.has(node.id);
          const focusPath = prerequisiteFocusIds.has(parent.id) && prerequisiteFocusIds.has(node.id);
          const contextDimmed = prerequisiteFocusIds.size > 0 && !focusPath;
          return <line
            key={`${parent.id}-${node.id}`}
            data-testid={`v3-edge-${parent.id}-${node.id}`}
            className={`v3-tree-edge ${invested ? "is-invested" : ""} ${simulated ? "is-simulated" : ""} ${recommended ? "is-recommended" : ""} ${focusPath ? "is-focus-path" : ""} ${contextDimmed ? "is-context-dimmed" : ""} ${dimmed ? "is-dimmed" : ""}`}
            x1={parent.position.x}
            y1={-parent.position.y}
            x2={node.position.x}
            y2={-node.position.y}
          />;
        }))}
        <DiceTreeCoreV3 levels={familyLevels} locale={locale} />
        {nodes.filter((node) => renderIds.has(node.id)).map((node) => {
          const ownedRank = ownedRanks[node.id] ?? 0;
          const simulatedRank = Math.max(ownedRank, simulatedRanks[node.id] ?? ownedRank);
          return <TreeNodeV3
            key={node.id}
            node={node}
            label={localizeGameKey(node.nameKey ?? undefined, locale, node.id)}
            ownedRank={ownedRank}
            simulatedRank={simulatedRank}
            selected={selectedNodeId === node.id}
            recommended={recommendedIds.has(node.id)}
            dimmed={!visibleIds.has(node.id) || (prerequisiteFocusIds.size > 0 && !prerequisiteFocusIds.has(node.id))}
            canIncrement={canIncrementNodeV3(node, ownedRanks, simulatedRanks)}
            showCost={showCosts}
            nextCost={nextRankCost(node, simulatedRank)}
            heatmap={heatmap.get(node.id)}
            onSelect={onSelect}
            onPointerSelect={selectFromPointer}
          />;
        })}
      </g>
    </svg>

    <button
      className="v57-tree-minimap"
      type="button"
      aria-label={locale === "ko" ? "미니맵에서 트리 위치 이동" : "Move through the tree with the minimap"}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const world = minimapWorldRef.current;
        const targetX = world.x + ((event.clientX - rect.left) / Math.max(1, rect.width)) * world.width;
        const targetY = world.y + ((event.clientY - rect.top) / Math.max(1, rect.height)) * world.height;
        setView((current) => ({
          ...current,
          x: center.x - targetX * current.scale,
          y: center.y - targetY * current.scale,
        }));
      }}
    >
      <svg viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
        {nodes.flatMap((node) => node.prerequisites.map((entry) => {
          const parent = byId.get(entry.nodeId);
          return parent ? <line key={`${parent.id}-${node.id}`} x1={parent.position.x} y1={-parent.position.y} x2={node.position.x} y2={-node.position.y} /> : null;
        }))}
        {nodes.map((node) => <circle key={node.id} cx={node.position.x} cy={-node.position.y} r={node.kind === "dice" ? 28 : 15} className={`family-${node.family} ${selectedNodeId === node.id ? "is-selected" : ""}`} />)}
        <rect ref={minimapViewportRef} className="v57-minimap-window" />
      </svg>
      <span>{Math.round(view.scale * 100)}%</span>
    </button>

    {normalizedQuery && <div className={`v44-tree-search-status ${matchingNodes.length ? "has-results" : "is-empty"}`} role="status" data-testid="v44-tree-search-status">
      <strong>{matchingNodes.length}</strong>
      <span>{locale === "ko" ? "개 검색 결과" : "search results"}</span>
      <small>{matchingNodes.length
        ? (locale === "ko" ? "결과 위치로 이동했습니다." : "View moved to the results.")
        : (locale === "ko" ? "이름이나 효과를 다시 확인해 주세요." : "Try another node or effect term.")}</small>
    </div>}

    {heatmapMode !== "none" && <div className="v47-heat-legend" data-testid="v47-heat-legend"><strong>{heatmapMode === "gold" ? (locale === "ko" ? "골드 1만당 효과" : "Effect per 10k Gold") : heatmapMode === "stone" ? (locale === "ko" ? "코어 1개당 효과" : "Effect per Core") : (locale === "ko" ? "경로 포함 ROI" : "Path-inclusive ROI")}</strong><span><i className="is-s">S</i><i className="is-a">A</i><i className="is-b">B</i><i className="is-c">C</i><i className="is-unknown">?</i></span><small>{heatmapMode === "path" ? (locale === "ko" ? "대미지 증가·골드·코어를 동시에 비교한 파레토 등급" : "Pareto grade across gain, Gold, and Core") : (locale === "ko" ? "검증된 기본 DPS 증가 후보 내 상대 등급" : "Relative grade among verified basic-DPS gains")}</small></div>}

    {!selectedNodeId && gestureHintVisible && <button className="v53-tree-gesture-hint" type="button" onClick={dismissGestureHint}><strong>{locale === "ko" ? "한 손가락으로 이동 · 두 손가락으로 확대" : "Drag to move · pinch to zoom"}</strong><small>{locale === "ko" ? "한 번 누르면 안내를 닫습니다" : "Tap once to dismiss"}</small></button>}

    <div className="v3-tree-family-jumps" aria-label={locale === "ko" ? "계열로 이동" : "Jump to family"}>
      {FAMILY_ORDER.map((family) => <button key={family} type="button" onClick={() => jumpToNodes(nodes.filter((node) => node.family === family))}>
        {FAMILY_LABEL[family][locale]}
      </button>)}
      {selectedDiceNodes.length > 0 && <button type="button" data-testid="jump-selected-dice" onClick={() => jumpToNodes(selectedDiceNodes)}>
        {locale === "ko" ? "선택 주사위" : "Selected dice"}
      </button>}
    </div>

    <div className="v3-tree-zoom-controls" aria-label={locale === "ko" ? "트리 보기 조절" : "Tree view controls"}>
      <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-0.15)}>−</button>
      <button type="button" data-testid="v3-fit-tree" onClick={() => setView(FIT_VIEW)}>{locale === "ko" ? "전체" : "Fit"}</button>
      <button type="button" aria-label="Zoom in" onClick={() => zoomBy(0.2)} disabled={view.scale >= MAX_TREE_SCALE}>+</button>
    </div>
  </div>;
}
