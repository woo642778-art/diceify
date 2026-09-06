# DiceTree online platform architecture

Status: implementation baseline, 2026-09-04

## Decision

DiceTree keeps the existing React planner as an offline-capable application and adds a Cloudflare Worker origin that serves the same production bundle and the versioned API. Google OpenID Connect uses the authorization-code flow. The Worker exchanges the code, verifies the ID token, stores only the minimum provider identity, and creates a random application session in D1. The browser receives only a `Secure`, `HttpOnly`, `SameSite=Lax` session cookie.

This same-origin design was selected instead of putting an authenticated API behind the GitHub Pages origin. It avoids depending on cross-site cookies, which are unreliable in Safari and other browsers with third-party storage restrictions. The current GitHub Pages deployment remains a fully working local/offline compatibility surface so existing shared URLs and localStorage data keep working. After the Worker origin is verified, the GitHub surface may offer an explicit opt-in link to the cloud origin while preserving the URL fragment.

Firebase is not required for the selected design. This removes an extra authentication intermediary and avoids storing a Google OAuth access token in browser storage. Google consent and Cloudflare account authorization still require the account owner to approve them.

## Runtime layout

```text
Cloudflare Worker
  static assets  -> built React application
  /api/v1/*      -> typed request handlers
  /auth/google/* -> Google OIDC start and callback
  D1             -> durable relational state and session hashes
  Durable Object -> room presence, hibernatable WebSockets, broadcast
  Queue          -> aggregation and moderation jobs
  Workers AI     -> only for rule-engine escalations
  Turnstile      -> account creation and high-abuse mutations

GitHub Pages
  existing planner and share URLs
  localStorage profiles and offline fallback
  optional cloud-origin handoff preserving hash state
```

## Free-tier safeguards

The implementation assumes the current Workers Free limits of 100,000 requests per day and 10 ms CPU time per request, D1 and SQLite-backed Durable Objects on the Free plan, and 10,000 Queue operations per day. D1 reads are capped at 5 million rows per day and writes at 100,000 rows per day. The rule engine runs before Workers AI, aggregates are updated asynchronously, list endpoints are paginated, and write endpoints have account/IP budgets.

Primary documentation:

- <https://developers.cloudflare.com/workers/platform/limits/>
- <https://developers.cloudflare.com/workers/platform/pricing/>
- <https://developers.cloudflare.com/durable-objects/>
- <https://developers.cloudflare.com/turnstile/plans/>
- <https://developers.cloudflare.com/queues/platform/pricing/>
- <https://developers.google.com/identity/openid-connect/openid-connect>

## Data boundaries

Canonical game data stays static, versioned, and review-gated in the repository. Community observations never mutate canonical rows. Every community aggregate carries its sample size, window, game-data version, and algorithm version. The recommendation layer may combine canonical and community signals, but it reports them separately.

Client planner state is versioned independently from cloud records. A first sign-in imports a local snapshot only after a preview. Conflicts create snapshots of both versions before the deterministic merge is committed. The offline planner never depends on API availability.

## API modules

- identity: Google OIDC, application sessions, onboarding, logout
- sync: versioned planner snapshots and conflict-safe merge
- builds: private, unlisted, and public builds with recent version history
- events: favorite-deck submissions and idempotent rewards
- points: immutable ledger, catalog, and redemptions
- recommendations: canonical signal plus sample-qualified community signal
- community: room directory, messages, reactions, blocks, reports
- matchmaking: co-op and critical-damage recruitment posts with expiry
- moderation: deterministic risk engine, optional AI escalation, sanctions, appeals
- admin: role-enforced review queues and audited mutations
- account: export, recommendation opt-out, and deletion workflow

All mutation handlers reject unknown fields, enforce length/range limits, require a CSRF header bound to the session, and use parameterized D1 queries. Private record lookups always include the authenticated owner in the query predicate.

## Deployment stages

1. Build and unit-test the current GitHub Pages surface.
2. Apply D1 migrations to an isolated staging database.
3. Deploy a staging Worker with staging bindings and Google redirect URI.
4. Run API, WebSocket, security, and Playwright flows against staging.
5. Deploy production Worker only after all required checks pass.
6. Keep the existing GitHub Pages deployment unchanged on any Worker failure.

