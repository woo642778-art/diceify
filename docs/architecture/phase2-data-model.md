# Additive Phase 2 model

Migrations extend the existing schema without deleting user data. Unique `(user_id,state_version)` makes snapshot compare-and-swap race-safe. Each saved build keeps up to 20 revisions and optional parent lineage. Party membership has one row per user and recruitment, with ready state; membership insertion checks capacity inside SQL. Separate operational counters and feature flags provide bounded abuse controls.

Public aggregation reads only opted-in active profiles and accepted current-version submissions, counts distinct users, and suppresses cohorts below 25. Exact inventory and individual tree states are never returned in public aggregate payloads. Account deletion must use unique anonymous nicknames so multiple deletions can succeed under the nickname uniqueness constraint.

Test fixtures live only in isolated SQLite databases and are never migrations or production seed data.
