# DiceTree platform threat model

## Protected assets

- private planner state and saved builds
- Google subject identifiers and optional email
- application sessions and CSRF secrets
- point ledger integrity
- chat and moderation records
- administrator actions and secrets
- canonical recommendation data

## Principal threats and controls

| Threat | Control |
| --- | --- |
| Stolen OAuth or application token | Authorization-code flow, no OAuth token in browser storage, hashed random session IDs, short idle lifetime, revocation on logout |
| Login CSRF or callback replay | One-time state and PKCE verifier cookies, strict redirect URI, state deletion on use |
| IDOR | Owner-scoped queries and server-side visibility checks on every build/snapshot route |
| XSS | Plain-text community content, React escaping, no stored HTML, CSP on Worker responses |
| CSRF | SameSite cookie plus session-bound `X-DiceTree-CSRF` header on mutations |
| SQL injection | Parameterized D1 statements only; no user-controlled identifiers in SQL text |
| Point farming | Immutable ledger, unique idempotency keys, event uniqueness, daily/weekly caps |
| Recommendation poisoning | minimum sample thresholds, Bayesian smoothing, account quality weight, sanctions exclusion, versioned aggregates |
| Spam and harassment | sliding-window rate rules, normalized duplicate clusters, targeted-language scoring, optional AI review, conservative escalation |
| Malicious reports | reporter rate limit and trust weight; reports do not directly ban users |
| Ban evasion | server-side sanction check on connect and mutation, conservative device/network signals, administrator review for permanent sanctions |
| Admin privilege forgery | server-side roles, environment-secret bootstrap, no hard-coded owner, audit log for every action |
| Cost exhaustion | per-route quotas, queue backpressure, AI daily budget, message and room caps, paginated queries |
| Data loss during sync | schema version, optimistic version check, pre-merge snapshots, local-first fallback |
| Sensitive logging | structured event codes; no tokens, email, or message body in routine logs |

## Moderation decision boundary

The deterministic engine can warn, slow, hide pending review, or issue short temporary mutes. Ambiguous AI output never produces a permanent sanction. Permanent bans require repeated high-confidence severe events, objective bot or evasion evidence, or administrator review. Appeals preserve the decision evidence and all administrator changes are audited.

## Retention baseline

- inactive application sessions: 30 days maximum
- raw chat messages: 90 days by default, subject to room policy
- deleted-account public contributions: anonymized if needed to preserve aggregate integrity
- reports and sanctions: minimum period required for abuse prevention, reviewed before public launch
- analytics: aggregate only; no exact private planner state is exposed

This is an engineering baseline, not a claim of legal compliance. Production launch requires a jurisdiction-specific privacy and youth-safety review.

