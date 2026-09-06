import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiceTreeNodeV3 } from "../../../game-data/types";
import { gameDataV3 } from "../../../game-data/load";
import { TreeCanvasV3, canIncrementNodeV3, familyInvestmentLevelsV3, normalizeTreeSearchText, prerequisiteClosureIdsV57, prerequisitesSatisfiedV3, visibleTreeNodeIdsV52 } from "./TreeCanvasV3";

afterEach(cleanup);

const nodes: DiceTreeNodeV3[] = [
  {
    id: "root", family: "core", kind: "milestone", position: { x: 0, y: 0 }, prerequisites: [],
    maxRank: 2, costsByRank: [{ gold: 100, stone: 0 }, { gold: 200, stone: 1 }], sourceRefs: [],
  },
  {
    id: "child", family: "chaos", kind: "passive", position: { x: -300, y: 280 },
    prerequisites: [{ nodeId: "root", minRank: 1 }], maxRank: 3,
    costsByRank: [{ gold: 1000, stone: 0 }, { gold: 2000, stone: 1 }, { gold: 3000, stone: 1 }], sourceRefs: [],
  },
  {
    id: "locked", family: "chaos", kind: "dice", position: { x: -650, y: 520 }, targetId: "predator",
    prerequisites: [{ nodeId: "root", minRank: 2 }], maxRank: 1,
    costsByRank: [{ gold: 5000, stone: 2 }], sourceRefs: [],
  },
];

function renderTree(overrides: Partial<ComponentProps<typeof TreeCanvasV3>> = {}) {
  const onSelect = vi.fn();
  render(<TreeCanvasV3
    data={gameDataV3}
    nodes={nodes}
    ownedRanks={{ root: 1 }}
    simulatedRanks={{ child: 1 }}
    selectedNodeId="child"
    selectedDiceId="predator"
    recommendedIds={new Set(["root", "child"])}
    locale="ko"
    onSelect={onSelect}
    {...overrides}
  />);
  return onSelect;
}

describe("TreeCanvasV3", () => {
  it("renders every canonical node and real prerequisite edges", () => {
    renderTree();
    expect(screen.getAllByRole("treeitem")).toHaveLength(nodes.length);
    expect(screen.getByTestId("v3-edge-root-child")).toBeInTheDocument();
    expect(screen.getByTestId("v3-edge-root-locked")).toBeInTheDocument();
    expect(screen.getByTestId("v41-cost-root")).toHaveTextContent("200");
    expect(screen.getByTestId("v41-cost-root")).toHaveTextContent("1");
    expect(screen.getByTestId("v3-node-locked").querySelector('image[data-dice-id="predator"]')).toHaveAttribute("href", "/dice-icons/predator.webp");
  });

  it("separates owned, simulated, reachable, locked and maxed state", () => {
    const { rerender } = render(<TreeCanvasV3
      data={gameDataV3}
      nodes={nodes} ownedRanks={{ root: 1 }} simulatedRanks={{ child: 1 }} locale="ko" onSelect={() => {}} />);
    expect(screen.getByTestId("v3-node-root")).toHaveAttribute("data-node-state", "owned");
    expect(screen.getByTestId("v3-node-child")).toHaveAttribute("data-node-state", "simulated");
    expect(screen.getByTestId("v3-node-locked")).toHaveAttribute("data-node-state", "locked");
    expect(screen.getByTestId("v3-node-locked")).toHaveAttribute("data-can-increment", "false");

    rerender(<TreeCanvasV3
      data={gameDataV3}
      nodes={nodes} ownedRanks={{ root: 2 }} simulatedRanks={{}} locale="ko" onSelect={() => {}} />);
    expect(screen.getByTestId("v3-node-root")).toHaveAttribute("data-node-state", "maxed");
    expect(screen.getByTestId("v3-node-root")).toHaveAttribute("data-can-increment", "false");
    expect(screen.getByTestId("v3-node-locked")).toHaveAttribute("data-node-state", "reachable");
  });

  it("enforces prerequisite and max-rank rules in the shared state helper", () => {
    expect(prerequisitesSatisfiedV3(nodes[2], { root: 1 }, {})).toBe(false);
    expect(canIncrementNodeV3(nodes[2], { root: 1 }, {})).toBe(false);
    expect(canIncrementNodeV3(nodes[2], { root: 2 }, {})).toBe(true);
    expect(canIncrementNodeV3(nodes[0], { root: 2 }, {})).toBe(false);
  });

  it("traces every prerequisite to the selected node and can hide cost labels", () => {
    expect([...prerequisiteClosureIdsV57(nodes, "locked")]).toEqual(["locked", "root"]);
    renderTree({ selectedNodeId: "locked", showCosts: false, focusPrerequisites: true });
    expect(screen.queryByTestId("v41-cost-root")).not.toBeInTheDocument();
    expect(screen.getByTestId("v3-edge-root-locked")).toHaveClass("is-focus-path");
    expect(screen.getByTestId("v3-edge-root-child")).toHaveClass("is-context-dimmed");
  });

  it("counts effective invested ranks by family without double-counting simulations", () => {
    expect(familyInvestmentLevelsV3(nodes, { root: 1, child: 1 }, { child: 3, locked: 1 })).toEqual({
      nature: 0,
      chaos: 4,
      order: 0,
      engineering: 0,
      magic: 0,
    });
  });

  it("renders the in-game center hub and updates its family counters", () => {
    const { rerender } = render(<TreeCanvasV3
      data={gameDataV3}
      nodes={nodes} ownedRanks={{ root: 1 }} simulatedRanks={{ child: 1 }} locale="ko" onSelect={() => {}} />);
    expect(screen.getByTestId("v46-tree-core")).toHaveTextContent("다이스 트리");
    expect(screen.getByTestId("v46-tree-core").querySelector("image")).toHaveAttribute("href", "/tree-assets/dice-tree-base.webp");
    expect(screen.getByTestId("v46-family-count-chaos")).toHaveAttribute("data-level", "1");

    rerender(<TreeCanvasV3
      data={gameDataV3}
      nodes={nodes} ownedRanks={{ root: 1 }} simulatedRanks={{ child: 2, locked: 1 }} locale="ko" onSelect={() => {}} />);
    expect(screen.getByTestId("v46-family-count-chaos")).toHaveAttribute("data-level", "3");
    expect(screen.getByTestId("v46-tree-core")).toHaveAccessibleName(/혼돈 3/);
  });

  it("normalizes whitespace and punctuation in searches and focuses matching nodes", () => {
    expect(normalizeTreeSearchText("공격 속도")).toBe(normalizeTreeSearchText("공격속도"));
    renderTree({ query: "child" });
    expect(screen.getByTestId("v44-tree-search-status")).toHaveTextContent("1개 검색 결과");
    expect(screen.getByTestId("v3-node-child")).not.toHaveClass("is-dimmed");
    expect(screen.getByTestId("v3-node-root")).toHaveClass("is-dimmed");
    expect(screen.getByTestId("v3-tree-transform").getAttribute("transform")).toContain("scale(3.6)");
  });

  it("selects nodes and provides fit, zoom, family and selected-dice navigation", () => {
    const onSelect = renderTree();
    fireEvent.click(screen.getByTestId("v3-node-child"));
    expect(onSelect).toHaveBeenCalledWith("child");

    const transform = screen.getByTestId("v3-tree-transform");
    const initial = transform.getAttribute("transform");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(transform.getAttribute("transform")).not.toBe(initial);
    fireEvent.click(screen.getByTestId("v3-fit-tree"));
    expect(transform.getAttribute("transform")).toContain("scale(0.92)");

    fireEvent.click(screen.getByRole("button", { name: "혼돈" }));
    expect(transform.getAttribute("transform")).not.toContain("scale(0.92)");
    expect(screen.getByTestId("jump-selected-dice")).toBeInTheDocument();
  });

  it("culls distant nodes at high mobile zoom while retaining explicitly required nodes", () => {
    const ids = visibleTreeNodeIdsV52(nodes, { x: 0, y: 0, scale: 4.5 }, {
      minX: -100, maxX: 100, minY: -100, maxY: 100,
    }, new Set(["locked"]));
    expect(ids).toContain("root");
    expect(ids).toContain("locked");
    expect(ids).not.toContain("child");
  });
});
