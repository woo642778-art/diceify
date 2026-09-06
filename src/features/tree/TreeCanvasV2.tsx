import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type TouchEvent as ReactTouchEvent } from "react";
import type { Confidence, DiceFamily, ResourceCostV2, TreeNodeV2 } from "../../domain/types";

interface TreeCanvasV2Props {
  nodes: TreeNodeV2[];
  selectedNodeId?: string;
  plannedRanks: Record<string, number>;
  recommendedIds: Set<string>;
  familyFilter: DiceFamily | "all";
  query: string;
  locale: "ko" | "en";
  onSelect: (nodeId: string) => void;
}

const FAMILY_COLOR: Record<DiceFamily | "core", string> = {
  core: "#6d5ce7", nature: "#34a86f", chaos: "#7859d6", order: "#d354ac", engineering: "#d69a20", magic: "#3586e7",
};
const FAMILY_AXIS: Array<{ family: DiceFamily; x: number; y: number; ko: string; en: string }> = [
  { family: "nature", x: 0, y: -92, ko: "자연", en: "NATURE" },
  { family: "chaos", x: -105, y: 8, ko: "혼돈", en: "CHAOS" },
  { family: "order", x: 105, y: 8, ko: "질서", en: "ORDER" },
  { family: "engineering", x: -82, y: 100, ko: "공학", en: "ENGINEERING" },
  { family: "magic", x: 82, y: 100, ko: "마법", en: "MAGIC" },
];
const ICON_GLYPHS: Array<[RegExp, string]> = [
  [/snow/i, "✦"], [/vortex/i, "◉"], [/yinyang/i, "◒"], [/gear/i, "⚙"], [/lightning|bolt/i, "ϟ"],
  [/target/i, "◎"], [/clover/i, "✣"], [/speed/i, "≫"], [/flower/i, "✹"], [/clock/i, "◷"],
  [/curve|spiral/i, "↻"], [/star/i, "✦"], [/character/i, "◆"], [/tiles/i, "▦"], [/arrows/i, "↗"], [/frame/i, "▣"],
];

function glyphFor(node: TreeNodeV2) {
  const key = node.iconKey?.value ?? "";
  return ICON_GLYPHS.find(([pattern]) => pattern.test(key))?.[1] ?? (node.kind === "dice" ? "◇" : node.kind === "core" ? "RD²" : "•");
}
function costText(cost?: ResourceCostV2) {
  if (!cost) return "";
  const values: string[] = [];
  if (cost.gold) values.push(cost.gold.toLocaleString());
  if (cost.blueCard) values.push(`B${cost.blueCard}`);
  if (cost.redCard) values.push(`R${cost.redCard}`);
  if (cost.prismCube) values.push(`◇${cost.prismCube}`);
  return values.join(" + ");
}
function confidenceClass(confidence: Confidence) { return `confidence-${confidence}`; }
function clampScale(scale: number) { return Math.max(0.38, Math.min(2.4, scale)); }
function touchMetrics(touches: ReactTouchEvent<SVGSVGElement>["touches"]) {
  const first = touches[0];
  const second = touches[1];
  if (!first) return null;
  if (!second) return { x: first.clientX, y: first.clientY, distance: 0 };
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
    distance: Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY),
  };
}

export function TreeCanvasV2({ nodes, selectedNodeId, plannedRanks, recommendedIds, familyFilter, query, locale, onSelect }: TreeCanvasV2Props) {
  const canvasRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 10, scale: 1 });
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const touch = useRef<{ x: number; y: number; distance: number } | null>(null);
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const visibleIds = useMemo(() => {
    if (!normalizedQuery && familyFilter === "all") return new Set(nodes.map((node) => node.id));
    const ids = new Set<string>();
    for (const node of nodes) {
      const familyMatches = familyFilter === "all" || node.family === familyFilter || node.family === "core";
      const name = node.name.value?.[locale] ?? node.name.value?.ko ?? "";
      const queryMatches = !normalizedQuery || name.toLocaleLowerCase().includes(normalizedQuery) || node.tags.some((tag) => tag.includes(normalizedQuery));
      if (familyMatches && queryMatches) ids.add(node.id);
    }
    return ids;
  }, [familyFilter, locale, nodes, normalizedQuery]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setView((current) => ({ ...current, scale: clampScale(current.scale * Math.exp(-event.deltaY * 0.0012)) }));
    };
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, []);
  const pointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "touch" || (event.target as Element).closest("[data-tree-node='true']")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const pointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "touch" || !pointer.current || pointer.current.id !== event.pointerId) return;
    const dx = event.clientX - pointer.current.x;
    const dy = event.clientY - pointer.current.y;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  };
  const pointerEnd = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== "touch" && pointer.current?.id === event.pointerId) pointer.current = null;
  };
  const touchStart = (event: ReactTouchEvent<SVGSVGElement>) => {
    const metrics = touchMetrics(event.touches);
    if (metrics) touch.current = metrics;
  };
  const touchMove = (event: ReactTouchEvent<SVGSVGElement>) => {
    const next = touchMetrics(event.touches);
    const previous = touch.current;
    if (!next || !previous) return;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const ratio = previous.distance > 0 && next.distance > 0 ? next.distance / previous.distance : 1;
    setView((current) => ({ x: current.x + dx, y: current.y + dy, scale: clampScale(current.scale * ratio) }));
    touch.current = next;
  };
  const touchEnd = (event: ReactTouchEvent<SVGSVGElement>) => { touch.current = touchMetrics(event.touches); };
  const fit = () => setView({ x: 0, y: 10, scale: 1 });
  const zoom = (delta: number) => setView((current) => ({ ...current, scale: clampScale(current.scale + delta) }));

  return <div className="tree-canvas-wrap">
    <svg ref={canvasRef} className="tree-canvas-v2" data-testid="tree-canvas" viewBox="-1100 -930 2200 1860" role="tree"
      aria-label={locale === "ko" ? "랜덤다이스2 다이스 트리" : "Random Dice 2 Dice Tree"}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
      onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd} onTouchCancel={touchEnd}>
      <defs>
        <filter id="soft-shadow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#392f7d" floodOpacity="0.16" /></filter>
        <linearGradient id="recommended-line" x1="0" x2="1"><stop offset="0" stopColor="#765ce9"/><stop offset="1" stopColor="#d8a83d"/></linearGradient>
      </defs>
      <g data-testid="tree-transform" transform={`translate(${view.x / view.scale} ${view.y / view.scale}) scale(${view.scale})`}>
        {nodes.flatMap((node) => (node.visualParentIds ?? []).map((parentId) => {
          const parent = nodeMap.get(parentId);
          if (!parent) return null;
          const recommended = recommendedIds.has(node.id) && recommendedIds.has(parent.id);
          const planned = Boolean(plannedRanks[node.id]) && (Boolean(plannedRanks[parent.id]) || parent.kind === "core");
          const dim = !visibleIds.has(node.id) && !visibleIds.has(parent.id);
          return <line key={`${parentId}-${node.id}`} x1={parent.position.x} y1={parent.position.y} x2={node.position.x} y2={node.position.y}
            className={`edge-v2 ${planned ? "is-planned" : ""} ${recommended ? "is-recommended" : ""} ${dim ? "is-dim" : ""}`} />;
        }))}
        <g className="family-axis-labels" aria-hidden="true">
          {FAMILY_AXIS.map((axis) => <g key={axis.family} transform={`translate(${axis.x} ${axis.y})`}>
            <circle r="15" className={`family-axis-dot family-axis-${axis.family}`} />
            <text textAnchor="middle" dominantBaseline="central">{locale === "ko" ? axis.ko : axis.en.slice(0, 2)}</text>
          </g>)}
        </g>
        {nodes.map((node) => {
          const selected = node.id === selectedNodeId;
          const planned = Boolean(plannedRanks[node.id]);
          const recommended = recommendedIds.has(node.id);
          const dim = !visibleIds.has(node.id);
          const color = FAMILY_COLOR[node.family];
          const radius = node.kind === "core" ? 38 : node.kind === "capstone" ? 28 : node.kind === "milestone" ? 25 : node.kind === "dice" ? 24 : 18;
          const rank = node.displayedRank?.value;
          const cost = node.observedNextCost?.value;
          const label = node.name.value?.[locale] ?? node.name.value?.ko ?? (locale === "ko" ? "상세 미확인" : "Detail pending");
          const square = node.kind === "dice" || node.kind === "core";
          return <g key={node.id} className={`node-token-v2 ${confidenceClass(node.fieldConfidence.effect ?? "unknown")} ${selected ? "is-selected" : ""} ${planned ? "is-planned" : ""} ${recommended ? "is-recommended" : ""} ${dim ? "is-dim" : ""}`}
            data-testid={`node-${node.id}`} data-tree-node="true" role="treeitem" tabIndex={dim ? -1 : 0} aria-label={label} aria-selected={selected}
            transform={`translate(${node.position.x} ${node.position.y})`} style={{ "--family": color } as CSSProperties}
            onPointerDown={(event) => event.stopPropagation()} onTouchStart={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); onSelect(node.id); }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.id); } }}>
            {recommended && <circle className="recommend-orbit" r={radius + 12} />}
            {selected && <circle className="selection-halo" r={radius + 8} />}
            {square ? <rect className="token-shell" x={-radius} y={-radius} width={radius * 2} height={radius * 2} rx={node.kind === "core" ? 15 : 10} /> : <circle className="token-shell" r={radius} />}
            {square ? <rect className="token-face" x={-radius + 5} y={-radius + 5} width={(radius - 5) * 2} height={(radius - 5) * 2} rx={8} /> : <circle className="token-face" r={radius - 5} />}
            <text className={`token-glyph ${node.kind === "core" ? "core-glyph" : ""}`} textAnchor="middle" dominantBaseline="central">{glyphFor(node)}</text>
            {rank && <g className="rank-chip" transform={`translate(${radius + 4} ${-radius - 2})`}><rect x="-4" y="-10" width="42" height="18" rx="9"/><text x="17" y="3" textAnchor="middle">{rank.current}/{rank.max}</text></g>}
            {cost && <g className="cost-chip" transform={`translate(${-radius - 5} ${radius + 16})`}><rect x="-2" y="-10" width={Math.max(42, costText(cost).length * 7 + 13)} height="20" rx="8"/><text x="6" y="4">{costText(cost)}</text></g>}
            {planned && <g className="plan-check" transform={`translate(${radius - 2} ${radius - 3})`}><circle r="10"/><path d="M-5 0l3.4 3.5L5-4"/></g>}
          </g>;
        })}
      </g>
    </svg>
    <div className="canvas-controls" aria-label={locale === "ko" ? "트리 보기 조절" : "Tree view controls"}>
      <button type="button" onClick={() => zoom(-0.12)} aria-label="Zoom out">−</button><button type="button" className="fit-control" onClick={fit}>{locale === "ko" ? "전체" : "Fit"}</button><button type="button" onClick={() => zoom(0.12)} aria-label="Zoom in">+</button>
    </div>
  </div>;
}
