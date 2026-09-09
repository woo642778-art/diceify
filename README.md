# diceify for Random Dice 2

A public, login-free Random Dice 2 Dice Tree planner and condition-based combat simulator backed by statically extracted client data.

Public site: **https://woo642778-art.github.io/diceify/**

## V3 data model

V3 replaces the old screenshot-first progression model with canonical data extracted from the supplied Random Dice 2 iOS client. The uploaded package is a modified 1.1.0 IPA and is therefore treated as untrusted input: the extractor reads archive members, serialized game tables, localization and static IL2CPP metadata only. It never launches the app, executes the client binary, loads injected dylibs, or executes bundled scripts.

Current canonical coverage includes 56 dice, 241 Dice Tree nodes, 111 passive rows, 154 rune rows, enemy/wave data, Korean/English localization and mechanic evidence. Provenance is pinned by the client SHA-256 in `src/game-data/manifest.json` and documented in `docs/data/v3-client-1.1.0-extraction.md`.

## Dice Tree currencies

Dice Tree rank costs come directly from the client arrays:

- `RankUpGoldArr` → `골드` / `Gold`
- `RankUpGoodsType = NODE_STONE` → `다이스 코어` / `Dice Core`
- `RankUpGoodsType = CORE_SOLAR` → `태양 코어` / `Solar Core`

V3 does not use the old V2 `blueCard`, `redCard` or `prismCube` assumptions in the live app, affordability calculations or recommendations. Rank costs are exact client-array entries, including the 1.1.0 Solar Core branch; missing levels are never extrapolated.

## Simulation confidence

The shared V3 engine combines verified base stats, permanent dice progression, in-battle upgrades and verified Dice Tree modifiers. Dice-specific mechanics use isolated rule modules and expose only the conditions required by the selected dice.

`verified` results may produce practical DPS, 5/10/30-second cumulative damage and kill time. `partial` results preserve known stats and mechanic parameters but do not invent unresolved operation order, attack-speed formulas, proc behavior or special-dice timing. Predator/포식 is the first complex golden-reference dice; its extracted values are visible even while unresolved runtime ordering remains excluded from exact practical DPS.

Direct client-table `LvAdd` and `UpAdd` deltas are also exposed as **table-projected stats**. This lets permanent level and in-battle power-up controls visibly change attack, attack interval, range and projected basic-attack DPS while keeping those projections separate from verified practical DPS until runtime operation order is recovered. The UI labels these values as `표 기반 예상` / `Table projection` rather than presenting them as exact combat formulas.

Tree marginal-value recommendations run the same simulation before and after a one-rank change. Only positive verified gains are allowed into the exact ranking. Partial candidates are shown separately and cannot outrank verified candidates with fabricated utility.

## Product surfaces

- IPA-backed Dice Tree with canonical positions, prerequisites, max ranks and Gold/Dice Core costs
- owned vs simulated rank states, pan/wheel zoom, touch/pinch, family navigation and node detail sheets
- all-dice Simulator with permanent level, battle upgrade, dice-specific conditions, enemy presets/editable HP and explainable calculation traces
- table-projected level/power-up stat changes that remain visibly separated from unresolved practical-DPS formulas
- shared-engine Compare view for dice/tree configurations
- simulation-backed next-investment analysis that withholds guessed rankings when formulas are partial
- Korean/English presentation without mutating semantic state
- login-free V3 share URLs that preserve ranks, inventory and simulation scenario
- white/pearl responsive game-companion UI with reduced-motion fallbacks

## Development

Requires Node.js 22.12+ and Python 3.11+.

```bash
npm install
python3 -m unittest discover tools/rd2-extract/tests -p 'test_*.py'
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The Vite base path is `/diceify/` for GitHub Pages. GitHub Actions runs extractor fixture validation, unit/component tests, production build, desktop/mobile Playwright flows and screenshot QA before Pages deployment.

## Importing a future client safely

Do not replace canonical data by hand and do not run an IPA. Use `tools/rd2-extract/extract.py` against the new archive in a local static-analysis environment, verify its fingerprint intentionally, and generate a separate output dataset. Then run `tools/rd2-extract/diff_clients.py` to review semantic changes in dice stats, tree topology/costs, passives, runes, enemies, localization and mechanic evidence before updating `src/game-data/`.

A symbol name or serialized numeric field is evidence, not automatically a proven combat formula. New exact arithmetic requires enough static code-path evidence and golden tests to establish operation order, clamping and interactions.

## Share-state contract

V3 links encode semantic `PlannerStateV3`: owned ranks, simulated target ranks, Gold/Dice Core/Solar Core inventory and the simulation scenario. Presentation-only state such as current language or open panel is not encoded. Malformed or incompatible links fail safely to a fresh planner state.
