# Phase 2 current state, 2026-09-06

This is a code audit, not a production-readiness claim. Production remains the GitHub Pages planner at commit b2e0d4a. The uncommitted platform branch contains a locally running Worker; Cloudflare and Google credentials have not been configured.

| Area | Reusable implementation | Remaining evidence or gap |
| --- | --- | --- |
| Frontend | React 19, Vite, versioned local profiles, v3 hash sharing | Cloud state restore and private online workflows |
| Tree | 239-node data, prerequisite routes, transient gesture transforms, minimap, mobile culling and compositing guards | Physical iPhone/Safari validation |
| Analysis | Scenario engine, guided route, 1/5/10/20-step optimizer, heatmap, saved comparisons | Do not duplicate these as new solvers |
| Worker | Hono API, D1, OIDC/PKCE, session-bound CSRF | Real Google consent and staging deployment |
| Sync | Immutable snapshot history, atomic optimistic versioning and conflict preview UI | Authenticated two-device staging evidence |
| Builds | Visibility, versioned updates, private fork lineage, diff and owner history | Authenticated staging evidence and full build-management UI |
| Community | Durable Object socket, D1 persistence, membership/session checks, block-aware delivery, slow mode and queue moderation resolution | Reconnect UX, multi-account staging and operator review UI |
| Rewards | Active event reads, atomic one-time award, immutable ledger and conditional redemption | Submission and redemption UI plus staged concurrency evidence |
| Recommendations | Consent-filtered 90-day aggregation, distinct-account counting, Bayesian thresholding and version filters | Recommendation presentation and scheduled rebuild/recovery operations |
| Matching | Atomic capacity, membership, ready state, expiry and party-room integration | Multi-account staging and owner-transfer policy |
| CI | 244 frontend tests, 16 Worker SQLite/domain tests, production builds, desktop/mobile Chromium E2E | Physical Safari, authenticated staging and deployment secrets |

Measured initial bundle: 757.22 kB JS (207.83 kB gzip), online chunk 33.81 kB (11.18 kB gzip). The online chunk is lazy. No socket or AI request runs on initial tree load. The full browser suite passes 50 scenarios with 7 intentional viewport skips, plus the previously failing tree-search interaction in an isolated rerun. These are not authenticated E2E or physical-device tests.

Queries are parameterized and bounded. Unique snapshot versions, exact socket membership and server-side dice validation are enforced. Production release is still blocked by missing Cloudflare resources/secrets, Google OIDC configuration, authenticated staging, physical Safari evidence, retention jobs and an operator moderation UI.
