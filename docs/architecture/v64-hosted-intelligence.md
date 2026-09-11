# Diceify V6.4 Hosted Intelligence

Date: 2026-09-11

## Product contract

Diceify produces the recommendation before any language-model request. Opening AI Analysis loads the current planner, deck, tree ranks, selected die, and remaining resources, then runs the optimizer immediately. Changes to resources, goal, die, or search horizon share one state model and trigger a 180 ms debounced recalculation. A small manual retry remains under analysis details.

There is no browser model, model selector, model-weight cache, WebGPU requirement, or model initialization state. The browser bundle does not include `@mlc-ai/web-llm`.

## Authority boundary

`src/intelligence/optimizer.ts` is the only route and numeric authority. It owns prerequisites, ranks, Gold, Dice Core, Solar Core, remaining balances, breakpoints, DPS-derived percentages, and route comparisons. The UI renders these values directly from the result object.

The hosted model is an optional interpreter and qualitative explanation layer. The server prompt prohibits numbers and the Worker stream normalizer rejects numeric or percentage claims. The browser repeats that check before rendering. When AI is offline, rate-limited, over quota, invalid, or slow, the route, metrics, alternatives, tree overlay, and deterministic explanation remain available.

## Optimizer

The optimizer performs exhaustive depth-first enumeration of legal rank states within the chosen horizon and a 50,000-state safety cap. Each transition validates maximum rank, all prerequisite minimum ranks, and three independent currency budgets. Equivalent rank states are deduplicated. Results are Pareto filtered without inventing an exchange rate between currencies.

Target-dice searches maximize the number of legal purchases that directly advance the selected die, then use stable cost and node ordering. DPS objectives use only simulator metrics whose formula is available. PvP and co-op do not substitute a generic score when mode-specific evidence is absent. Truncated searches are explicitly marked partial.

The optimizer runs in a persistent Web Worker. Canonical 1.1.0 data is transferred once and reused, while result and in-flight request caches are keyed by the full authoritative input. This reduced the measured resource-edit result update from 340 ms to 251 ms in the local Chromium audit.

## Korean command parser

`src/intelligence/grounding.ts` handles common commands without a network call. It parses Korean units such as `20만`, resource overrides and deltas, purchase horizons, PvP and co-op goals, canonical node IDs, localized dice names, and conservative one-edit fuzzy dice matches. Common control words are excluded from fuzzy matching to avoid false entity matches.

Commands with demonstratives or directional references remain ambiguous and are sent to the hosted intent parser. Hosted output is accepted only after strict schema validation and allow-list checks against the compact dice and contextual node ID lists. Raw model commands are never executed.

## Hosted provider

`worker/src/ai/provider.ts` defines the `DiceifyAIProvider` boundary. The current implementation uses the server-side Cloudflare Workers AI binding. The model is configured in one server location as `@cf/zai-org/glm-4.7-flash` and can be replaced without changing the client.

The public `/api/v1/ai` endpoint accepts only `parse_intent`, `explain_route`, and `answer_followup`. It applies:

- strict request and response schemas
- a 64 KB request limit and an 800-character question limit
- configured-origin CORS validation
- twelve requests per visitor fingerprint per minute
- a server-controlled global daily inference budget
- provider start and stream timeouts
- contextual node and dice ID allow lists
- no account ID, email, raw database, or provider credential in the payload

Explanations use normalized server-sent events. Provider-specific stream frames are decoded by the Worker and re-emitted as `delta`, `done`, `unsafe`, or `error` events. Numeric claims and overlong output are rejected before they reach the user.

## Interface

Desktop uses a compact 300 to 324 px condition rail and one flexible result surface. The command bar, route, authoritative metric, resources, deterministic evidence, save-versus-spend comparison, and alternatives follow decision priority. Technical metadata and saved analyses are collapsed.

Mobile renders the command bar and recommendation before settings. Conditions open as a bottom sheet with a backdrop and 44 px actions. The closed sheet is removed from visual flow so full-page captures do not expose off-canvas controls.

The existing Dice Tree remains authoritative. `트리에서 보기` transfers the result overlay into `TreeCanvasV3`, including owned, next, later, alternative, and unaffordable states. Route node actions open the corresponding real node.

## Verification

Front-end unit coverage includes optimizer invariants, owned-rank behavior, Korean parsing, local command state, automatic recalculation, streamed explanation rendering, and failure fallback. Worker integration coverage includes valid structured output, invalid IDs, provider streams, numeric-claim rejection, provider and stream timeouts, per-visitor rate limits, daily quota, malformed output, unsupported tasks, oversized input, unavailable AI, and CORS.

Playwright captures the required viewports at 1665x927, 1440x900, 1280x800, 1024x768, 768x1024, 430x932, and 390x844. The browser audit asserts no horizontal overflow and no local-model or WebGPU text. The latest full-suite timing sample was 1238 ms for full page navigation plus first result, 253 ms from the final resource edit to the recalculated result, 113 ms for a common local command, and 5.2 ms inside the optimizer.

## Deployment boundary

The Worker implementation and Wrangler dry run are complete, but a live hosted endpoint requires a real Cloudflare account, D1 database ID, queue, production `APP_ORIGIN`, and authenticated deployment. Until those are configured, static GitHub Pages builds keep deterministic analysis fully functional and display the compact fallback when an AI explanation is requested.
