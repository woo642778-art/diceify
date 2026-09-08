# DiceTree online operations

The Worker runs a daily UTC 03:15 scheduled job. It expires sessions, quota windows, matchmaking posts, events and temporary sanctions, then removes read notifications older than 90 days and unread notifications older than 365 days. Saved builds, planner snapshots, chat messages, point ledgers and administrator audit logs are not deleted by this job.

The same job rebuilds the `pvp`, `coop` and `crit` community recommendation segments from the latest 90-day window. This is the recovery path when a queue message was delayed or lost. Public recommendation reads independently recount currently active, consenting accounts, so an opt-out or deletion falls below the 25-account threshold immediately even before the scheduled rebuild finishes.

Before enabling a production deployment, replace all placeholder Cloudflare resource identifiers, apply every D1 migration, configure Google OIDC and the owner identity secret, and run authenticated staging checks with at least two accounts. The GitHub Pages origin remains a local-only compatibility deployment and must not be described as an active online backend.

Operational verification consists of `npm run test:worker`, `npm run typecheck:worker` and `npm run build:worker`. After deployment, verify `/api/v1/health`, inspect scheduled invocation logs for `scheduled_maintenance_complete`, and confirm the environment and game-data version before enabling public traffic.
