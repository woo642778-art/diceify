import { useEffect, useMemo, useRef } from "react";
import type { DiceFamily, Recommendation, TreeNodeDefinition } from "../../domain/types";
import { useI18n } from "../../i18n/I18nContext";
import { strings } from "../../i18n/strings";
import { usePanZoom } from "./usePanZoom";

const colors: Record<DiceFamily, string> = {
  order: "#69d8ff",
  chaos: "#ff5dcf",
  magic: "#a67cff",
  engineering: "#ffb454",
  nature: "#5ee69a",
};

const VIEWBOX_MIN = -1100;
const VIEWBOX_SIZE = 2200;

interface Props {
  nodes: TreeNodeDefinition[];
  ranks: Record<string, number>;
  selectedNodeId?: string;
  onSelect: (id: string) => void;
  recommendations: Recommendation[];
  familyFilter: DiceFamily | "all";
  search: string;
}

export function TreeCanvas({ nodes, ranks, selectedNodeId, onSelect, recommendations, familyFilter, search }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<SVGSVGElement>(null);
  const { view, resetView, bindNativeWheel, bind } = usePanZoom();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return bindNativeWheel(canvas);
  }, [bindNativeWheel]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const recommended = new Set(recommendations.map((item) => item.nodeId));
  const query = search.trim().toLocaleLowerCase();
  const visible = (node: TreeNodeDefinition) => familyFilter === "all" || node.family === familyFilter;
  const matches = (node: TreeNodeDefinition) => {
    if (!query) return true;
    const localizedNames = [strings.ko[node.localizationKey], strings.en[node.localizationKey]].filter(Boolean);
    return localizedNames.some((name) => name.toLocaleLowerCase().includes(query))
      || node.id.toLocaleLowerCase().includes(query)
      || node.tags.some((tag) => tag.toLocaleLowerCase().includes(query));
  };

  return (
    <section className="tree-stage" aria-label="Dice tree">
      <div className="tree-hud">
        <span>{t("tree.zoomHelp")}</span>
        <button type="button" className="icon-button" onClick={resetView} aria-label="Reset view">⌖</button>
      </div>
      <svg
        ref={canvasRef}
        className="tree-canvas"
        {...bind}
        data-testid="tree-canvas"
        viewBox={`${VIEWBOX_MIN} ${VIEWBOX_MIN} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="dot-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,.08)" />
          </pattern>
          <filter id="node-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <rect x={VIEWBOX_MIN} y={VIEWBOX_MIN} width={VIEWBOX_SIZE} height={VIEWBOX_SIZE} fill="url(#dot-grid)" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          <circle r="86" className="tree-core-ring" />
          <circle r="54" className="tree-core" />
          <text y="6" textAnchor="middle" className="tree-core-text">DICE</text>

          {nodes.filter(visible).flatMap((node) => (node.visualParentIds ?? []).map((parentId) => {
            const parent = byId.get(parentId);
            if (!parent || !visible(parent)) return null;
            const invested = (ranks[node.id] ?? 0) > 0 && (ranks[parent.id] ?? 0) > 0;
            return <line key={`${parentId}-${node.id}`} x1={parent.position.x} y1={parent.position.y} x2={node.position.x} y2={node.position.y} className={`tree-edge ${invested ? "is-invested" : ""}`} />;
          }))}

          {nodes.filter(visible).map((node) => {
            const rank = ranks[node.id] ?? 0;
            const isSelected = node.id === selectedNodeId;
            const isRecommended = recommended.has(node.id);
            const isUnverified = node.verification.status === "unverified";
            const isMatch = matches(node);
            return (
              <g
                key={node.id}
                transform={`translate(${node.position.x} ${node.position.y})`}
                role="button"
                tabIndex={0}
                aria-label={t(node.localizationKey)}
                data-testid={`node-${node.id}`}
                className={`tree-node family-${node.family} ${rank ? "is-invested" : ""} ${isSelected ? "is-selected" : ""} ${isRecommended ? "is-recommended" : ""} ${isUnverified ? "is-unverified" : ""} ${!isMatch ? "is-dim" : ""}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => { event.stopPropagation(); onSelect(node.id); }}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(node.id); }}
                style={{ "--family-color": colors[node.family] } as React.CSSProperties}
              >
                {isRecommended && <circle r="32" className="recommend-ring" aria-hidden="true" pointerEvents="none" style={{ animation: "none" }} />}
                <circle r="24" className="node-shell" />
                <circle r="18" className="node-inner" />
                <text textAnchor="middle" y="5" className="node-symbol">{isUnverified ? "?" : node.tags.includes("attack-speed") ? "≫" : "◆"}</text>
                {rank > 0 && <text x="20" y="-18" className="rank-badge">{rank}</text>}
                {!isUnverified && <text y="43" textAnchor="middle" className="node-label">{t(node.localizationKey)}</text>}
              </g>
            );
          })}
        </g>
      </svg>
    </section>
  );
}
