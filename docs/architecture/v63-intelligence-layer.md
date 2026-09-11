# Diceify V6.3 Intelligence Layer

Date: 2026-09-11

## Trust boundary

Diceify intelligence has three independent layers. The canonical game engine is the only authority for ranks, prerequisites, Gold, Dice Core, Solar Core, simulation traces, and percentage changes. The meta layer consumes dated snapshots and never converts observed usage into strength or win rate. The local language model may parse intent and explain an already calculated payload, but it cannot alter a route, cost, score, or source reference.

Every request is tied to `clientVersion:sourceSha256`. A saved analysis whose data version no longer matches the current canonical data remains visible but cannot be reopened as a current recommendation. A calculation started against stale UI state is discarded when the tree, selected die, or resources change.

## Deterministic optimizer

`src/intelligence/optimizer.ts` searches legal single-rank purchases in a dependency graph. Candidate scope contains nodes applicable to the selected die plus every prerequisite needed to reach them. Each transition checks the exact current rank, maximum rank, all prerequisite minimum ranks, and all three independent currency balances.

The search is an exhaustive depth-first enumeration of distinct rank states within the user-selected horizon. Equivalent states reached in a different order are deduplicated because rank cost is path-independent for a fixed start state. Feasible result routes are then Pareto filtered by objective value and each independent currency. Gold, Dice Core, and Solar Core are never collapsed through an invented exchange rate. This finds the global optimum inside the declared candidate scope and purchase horizon instead of choosing the best immediate node greedily.

Searches run in `optimizer.worker.ts` so large budgets cannot block the interface. A 50,000-state safety limit prevents runaway work. When reached, `search.complete` becomes false and the UI says that only the best visited candidate is available. It does not assert optimality. The normal Predator target-route browser case with 100,000 Gold and 100 Dice Core visited seven states in roughly 3 to 7 ms in local browser runs.

The optimizer emits exact route cost, remaining resources, rank changes, measurable metrics, a Pareto front, alternatives, a resource frontier, and overlay states. The overlay distinguishes owned, next, later, alternative, unaffordable, and low-efficiency states without relying on color alone because each node also exposes `data-ai-state` and the route is present as ordered text.

## Metric policy

Practical DPS is shown only when the shared simulator returns a verified practical result before and after the complete route. Basic-attack DPS is a separate metric and is explicitly limited when special abilities are unresolved. If the client table and code-path evidence do not establish a performance formula, Diceify shows `수치 미확정` and may still prove the exact unlock path, prerequisites, and cost. It does not manufacture an efficiency score.

The target-dice objective is structural. Its value means that a route reaches a node targeting the selected die, not that the die is strong. Resource-efficiency uses verified gain while retaining all three costs as independent Pareto axes. PvP and co-op remain unranked when no mode-specific win-rate or combat-contribution evidence supports them; generic DPS is not relabeled as a mode score.

## Meta evidence

The bundled co-op ranking snapshot contains 105 observed decks captured on 2026-08-16 from client 1.0.1. The current canonical calculation data is client 1.1.0. The UI displays both versions and states that observed usage is neither strength nor win rate. The two datasets are not silently merged into a current-meta score.

## Local language model

The integration uses `@mlc-ai/web-llm` 0.2.85 and the package's compatible prebuilt model list. The available options are:

| Tier | Model ID | Repository payload | License |
| --- | --- | ---: | --- |
| Lite | `Qwen3-1.7B-q4f16_1-MLC` | 984,156,278 bytes | Apache-2.0 |
| Advanced | `Qwen3-4B-q4f16_1-MLC` | 2,279,167,154 bytes | Apache-2.0 |

The displayed size is the model repository payload measured from Hugging Face metadata. A compatible WebGPU runtime is additional. Neither model downloads on page load. The AI workspace itself is lazy loaded, the WebLLM client is dynamically imported only after the user starts a model, and inference runs in a dedicated `WebWorkerMLCEngineHandler` worker. Download progress is visible. Browser cache can be deleted from the same panel.

WebGPU and Worker support are checked before model initialization. Unsupported devices retain the full deterministic optimizer and explanation fallback. Model loading or inference failure also falls back without changing calculated results.

Natural-language intent is constrained by a Zod schema. The model can select one of four tools, one declared goal, and a purchase horizon from one to eight. Invalid JSON falls back to the deterministic parser. Explanation prompts receive only the authoritative result payload. Returned node citations must resolve to canonical node IDs, and every number in a model explanation must already exist in the calculated payload. A failed grounding check discards the model answer and uses the deterministic explanation.

## Interface

The AI workspace is a dedicated decision surface rather than a chat bubble. Desktop uses a three-column layout: constraints, exact route, and evidence. Mobile preserves that information order in a single stack. No score or recommendation appears before a calculation. A route can be saved locally, applied to the planner only through an explicit button, or opened as a multi-state overlay on the existing full Dice Tree. Internal `[node:id]` citations open the corresponding tree node.

The responsive audit covers 320x568, 375x667, 390x844, 768x1024, 1024x768, 1280x800, and 1440x900. Screenshots are written to `test-results/qa-v63-ai-*.png` during Playwright validation and uploaded by the existing Pages workflow.

## Verification and remaining limits

Unit coverage includes zero resources, exact budgets, three-currency accounting, unreachable nodes, prerequisites, stable ties, greedy traps, multi-objective changes, Pareto dominance, partial formulas, stale versions, invalid input, search safety caps, grounding rejection, saved-analysis round trips, and tree overlay semantics. Browser coverage checks the pre-calculation empty state, target-route calculation, dated meta disclosure, local-model entry point, and tree overlay on desktop and mobile.

The integration and fallback are fully testable without a model download. A real 0.98 GB or 2.28 GB model download and sustained generation benchmark still requires an explicitly chosen supported physical device and was not performed as part of automated CI. No claim is made that Safari, a particular phone, or a low-memory device can load either model until that device is tested.
