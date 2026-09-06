# Phase 2 threats and verification

Release blockers found during audit: socket admission without active membership; Google display names in public chat; concurrent sync writes sharing a version; no known-dice validation; event endpoint referencing a missing description column; point reward outside the submission transaction; public build detail requiring authentication; deleted nickname uniqueness collisions.

Tests must cover unauthenticated and foreign-owner requests, CSRF, origin checks, unknown/duplicate dice, parallel stale writes, full party joins, duplicate awards, partial failures and deletion of more than one account. Chat authorization is repeated on message delivery because a socket can outlive a session or sanction change. Per-user blocks must apply to live delivery as well as history.

AI output is untrusted structured input. Invalid or low-confidence classifications go to review and do not issue permanent sanctions. Public recommendation responses cannot fabricate canonical scores. Optional behavioral collection requires profile consent and opt-out support.
