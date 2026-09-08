# Phase 2 current state, 2026-09-06

This is a code audit, not a production-readiness claim. The static GitHub Pages application is live from merge commit `c08fbe8`, including the mobile tree fixes and the honest local-mode online shell. The Cloudflare Worker is implemented and locally verified, but it is not deployed because the Cloudflare resources and Google credentials have not been configured.

| Area | Reusable implementation | Remaining evidence or gap |
| --- | --- | --- |
| Frontend | React 19, Vite, versioned local profiles, v3 hash sharing | Cloud state restore and private online workflows |
| Tree | 239-node data, prerequisite routes, transient gesture transforms, minimap, mobile culling and compositing guards | Physical iPhone/Safari validation |
| Analysis | Scenario engine, guided route, 1/5/10/20-step optimizer, heatmap, saved comparisons | Do not duplicate these as new solvers |
| Worker | Hono API, D1, OIDC/PKCE, session-bound CSRF | Real Google consent and staging deployment |
| Sync | Immutable snapshot history, atomic optimistic versioning and conflict preview UI | Authenticated two-device staging evidence |
| Builds | Visibility, versioned updates, private fork lineage, diff and owner history | Authenticated staging evidence and full build-management UI |
| Community | Durable Object socket, D1 persistence, membership/session checks, block-aware delivery, slow mode and queue moderation resolution | Reconnect UX, multi-account staging and operator review UI |
| Rewards | Active event reads, current-deck submission UI, atomic one-time award, immutable ledger, live balance and idempotent redemption UI | Staged concurrency and fulfillment evidence |
| Recommendations | Consent-filtered 90-day aggregation, distinct-account counting, Bayesian thresholding, version filters, mode presentation and direct Deck Lab application | Scheduled recovery operations and authenticated staging evidence |
| Matching | Atomic capacity, membership, ready state, expiry and party-room integration | Multi-account staging and owner-transfer policy |
| CI | 247 frontend tests, 17 Worker SQLite/domain tests, production builds, desktop/mobile Chromium E2E | Physical Safari, authenticated staging and deployment secrets |

Measured initial bundle: 757.46 kB JS (207.91 kB gzip), online chunk 40.81 kB (13.16 kB gzip). The online chunk is lazy. No socket or AI request runs on initial tree load. The full browser suite passes 51 scenarios with 7 intentional viewport skips. These are not authenticated E2E or physical-device tests.

Queries are parameterized and bounded. Unique snapshot versions, exact socket membership and server-side dice validation are enforced. Consent changes and account deletion enqueue aggregate rebuilding, and the public deck source is checked against current consent and account state. The online backend release is still blocked by missing Cloudflare resources/secrets, Google OIDC configuration, authenticated staging, physical Safari evidence, retention jobs and an operator moderation UI. Static Pages deployment is not blocked and is live.
