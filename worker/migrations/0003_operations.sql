-- Additive operations hardening. Run after 0002.
ALTER TABLE user_reports ADD COLUMN last_action_id TEXT;
CREATE UNIQUE INDEX idx_report_last_action ON user_reports(last_action_id) WHERE last_action_id IS NOT NULL;
CREATE INDEX idx_audit_created ON admin_audit_logs(created_at DESC);
