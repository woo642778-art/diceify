import type { CSSProperties, KeyboardEvent } from "react";
import type { DiceTreeNodeV3, TreeCost } from "../../../game-data/types";
import { diceIconUrl } from "../shared/DiceIcon";
import type { TreeHeatmapEntryV3 } from "../../../optimizer/treeHeatmapV3";

const FAMILY_COLOR: Record<DiceTreeNodeV3["family"], string> = {
  core: "#6f5de7",
  nature: "#36a86d",
  chaos: "#db5e76",
  order: "#7259d2",
  engineering: "#7a8596",
  magic: "#3b7cde",
};

export interface TreeNodeV3Props {
  node: DiceTreeNodeV3;
  label: string;
  ownedRank: number;
  simulatedRank: number;
  selected: boolean;
  recommended: boolean;
  dimmed: boolean;
  canIncrement: boolean;
  showCost?: boolean;
  nextCost: TreeCost | null;
  heatmap?: TreeHeatmapEntryV3;
  onSelect: (nodeId: string) => void;
  onPointerSelect?: (nodeId: string) => void;
}

function compactCost(value: number) {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 10_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return value.toLocaleString("en-US");
}

function treeNodeIconUrl(nodeId: string) {
  return `${import.meta.env.BASE_URL}tree-node-icons/node-${encodeURIComponent(nodeId)}.webp`;
}

function currencyIconUrl(currency: "gold" | "stone" | "solar-core") {
  return `${import.meta.env.BASE_URL}tree-node-icons/currency-${currency}.webp`;
}

function glyphFor(node: DiceTreeNodeV3) {
  if (node.kind === "connector") return "•";
  return "";
}

function radiusFor(node: DiceTreeNodeV3) {
  if (node.kind === "dice") return 72;
  if (node.kind === "milestone") return 58;
  if (node.kind === "perk") return 52;
  if (node.kind === "connector") return 30;
  return 44;
}

export function TreeNodeV3({
  node,
  label,
  ownedRank,
  simulatedRank,
  selected,
  recommended,
  dimmed,
  canIncrement,
  showCost = true,
  nextCost,
  heatmap,
  onSelect,
  onPointerSelect,
}: TreeNodeV3Props) {
  const rank = Math.max(ownedRank, simulatedRank);
  const simulatedOnly = simulatedRank > ownedRank;
  const maxed = rank >= node.maxRank;
  const radius = radiusFor(node);
  const square = node.kind === "dice";
  const state = maxed
    ? "maxed"
    : rank > 0
      ? simulatedOnly
        ? "simulated"
        : "owned"
      : canIncrement
        ? "reachable"
        : "locked";
  const className = [
    "v3-tree-node",
    `v3-tree-node-${node.kind}`,
    `is-${state}`,
    selected ? "is-selected" : "",
    recommended ? "is-recommended" : "",
    dimmed ? "is-dimmed" : "",
    heatmap
      ? `is-heat-${heatmap.grade.toLowerCase().replace("?", "unknown")}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const activate = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(node.id);
    }
  };

  return (
    <g
      className={className}
      data-testid={`v3-node-${node.id}`}
      data-tree-node="true"
      data-node-state={state}
      data-can-increment={String(canIncrement)}
      data-owned-rank={ownedRank}
      data-simulated-rank={simulatedRank}
      data-roi-grade={heatmap?.grade}
      transform={`translate(${node.position.x} ${-node.position.y})`}
      style={{ "--family": FAMILY_COLOR[node.family] } as CSSProperties}
      role="treeitem"
      tabIndex={dimmed ? -1 : 0}
      aria-label={`${label}, ${rank}/${node.maxRank}`}
      aria-selected={selected}
      onClick={(event) => {
        event.stopPropagation();
        (onPointerSelect ?? onSelect)(node.id);
      }}
      onKeyDown={activate}
    >
      {showCost &&
        nextCost &&
        (nextCost.gold > 0 ||
          nextCost.stone > 0 ||
          (nextCost.solarCore ?? 0) > 0) && (
          <g
            className="v41-node-cost"
            data-testid={`v41-cost-${node.id}`}
            transform={`translate(0 ${-radius - 47})`}
            aria-hidden="true"
          >
            {(() => {
              const entries = [
                nextCost.gold > 0
                  ? { id: "gold" as const, value: nextCost.gold }
                  : null,
                nextCost.stone > 0
                  ? { id: "stone" as const, value: nextCost.stone }
                  : null,
                (nextCost.solarCore ?? 0) > 0
                  ? {
                      id: "solar-core" as const,
                      value: nextCost.solarCore ?? 0,
                    }
                  : null,
              ].filter(
                (
                  entry,
                ): entry is {
                  id: "gold" | "stone" | "solar-core";
                  value: number;
                } => Boolean(entry),
              );
              const width = Math.max(
                92,
                entries.reduce(
                  (sum, entry) =>
                    sum + 34 + compactCost(entry.value).length * 10,
                  12,
                ),
              );
              let cursor = -width / 2 + 14;
              return (
                <>
                  <rect
                    x={-width / 2}
                    y="-19"
                    width={width}
                    height="38"
                    rx="11"
                  />
                  {entries.map((entry) => {
                    const itemWidth = 34 + compactCost(entry.value).length * 10;
                    const x = cursor;
                    cursor += itemWidth;
                    return (
                      <g key={entry.id} transform={`translate(${x} 0)`}>
                        <image
                          className="v59-cost-icon"
                          href={currencyIconUrl(entry.id)}
                          x="0"
                          y="-12"
                          width="24"
                          height="24"
                        />
                        <text
                          x="28"
                          textAnchor="start"
                          dominantBaseline="central"
                        >
                          {compactCost(entry.value)}
                        </text>
                      </g>
                    );
                  })}
                </>
              );
            })()}
          </g>
        )}
      {recommended && (
        <circle
          className="v3-recommend-orbit"
          r={radius + 24}
          aria-hidden="true"
        />
      )}
      {selected && (
        <g className="v57-focus-rings" aria-hidden="true">
          <circle className="v57-focus-ring is-outer" r={radius + 37} />
          <circle className="v57-focus-ring is-inner" r={radius + 24} />
          <circle className="v3-selection-halo" r={radius + 15} />
        </g>
      )}
      {square ? (
        <rect
          className="v3-node-shell"
          x={-radius}
          y={-radius}
          width={radius * 2}
          height={radius * 2}
          rx="25"
        />
      ) : (
        <circle className="v3-node-shell" r={radius} />
      )}
      {square ? (
        <rect
          className="v3-node-face"
          x={-radius + 8}
          y={-radius + 8}
          width={(radius - 8) * 2}
          height={(radius - 8) * 2}
          rx="20"
        />
      ) : (
        <circle className="v3-node-face" r={Math.max(10, radius - 8)} />
      )}
      {node.kind === "dice" && node.targetId ? (
        <image
          className="v42-tree-dice-icon"
          href={diceIconUrl(node.targetId)}
          x={-radius + 9}
          y={-radius + 9}
          width={(radius - 9) * 2}
          height={(radius - 9) * 2}
          preserveAspectRatio="xMidYMid meet"
          data-dice-id={node.targetId}
          aria-hidden="true"
        />
      ) : node.kind !== "connector" ? (
        <image
          className="v59-tree-node-art"
          href={treeNodeIconUrl(node.id)}
          x={-radius + 7}
          y={-radius + 7}
          width={(radius - 7) * 2}
          height={(radius - 7) * 2}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        />
      ) : (
        <text
          className="v3-node-glyph"
          textAnchor="middle"
          dominantBaseline="central"
          aria-hidden="true"
        >
          {glyphFor(node)}
        </text>
      )}
      {rank > 0 && (
        <g
          className="v3-rank-chip"
          transform={`translate(${radius - 5} ${-radius + 5})`}
          aria-hidden="true"
        >
          <circle r="24" />
          <text textAnchor="middle" dominantBaseline="central">
            {maxed ? "M" : rank}
          </text>
        </g>
      )}
      {simulatedOnly && (
        <circle
          className="v3-simulated-dot"
          cx={-radius + 5}
          cy={-radius + 5}
          r="10"
          aria-hidden="true"
        />
      )}
      {heatmap && (
        <g
          className={`v47-heat-grade is-${heatmap.grade.toLowerCase().replace("?", "unknown")}`}
          transform={`translate(${-radius + 2} ${radius - 2})`}
          aria-hidden="true"
        >
          <circle r="22" />
          <text textAnchor="middle" dominantBaseline="central">
            {heatmap.grade}
          </text>
        </g>
      )}
    </g>
  );
}
