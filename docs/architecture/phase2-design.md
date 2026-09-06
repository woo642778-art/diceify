# Phase 2 design and acceptance plan

1. Foundation: validate canonical dice on the server; reject malformed requests; establish atomic sync, membership, privacy and session tests with real SQLite.
2. Builds and personal workspace: revisions, fork lineage, differences, restore preview and preserved local snapshots.
3. Matching and community: atomic participation, ready check, timed recruitment, block-aware delivery, reconnect and moderation explanations.
4. Data intelligence: consent-based aggregates, minimum cohort 25, version filters, separate canonical/community/personal signals, cold-start behavior and traceable provenance.
5. Operations: feature flags, quotas, moderation review, retention, recovery documentation and CI gates.
6. Release: authenticated staging flows, browser/device checks, production deploy and production smoke verification.

All earlier requirements remain in the backlog. Optional Phase 2 features such as automatic matching, follows and seasons follow the core gates. UI surfaces must correspond to functioning endpoints. Empty data must show an empty state. Never seed production users, chats or usage statistics to demonstrate success.

The existing optimizer, simulator, compare workspace and local profile history remain the calculation implementation. Community adoption does not become a DPS or win-rate claim. Runtime flags are enforced by the API, not only the UI. Same-origin Worker hosting avoids Safari third-party cookie reliance. GitHub Pages continues to serve existing local profiles and hash links.
