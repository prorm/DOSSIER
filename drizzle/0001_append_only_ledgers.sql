-- Append-only enforcement for the score ledger, submissions and the audit trail.
-- UPDATE and DELETE are rejected at the database layer so that neither a bug
-- nor a compromised admin session can silently rewrite history.
-- (A full wipe goes through `pnpm db:reset`, which uses TRUNCATE explicitly.)
CREATE OR REPLACE FUNCTION dossier_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS event_log_append_only ON event_log;
--> statement-breakpoint
CREATE TRIGGER event_log_append_only BEFORE UPDATE OR DELETE ON event_log
  FOR EACH ROW EXECUTE FUNCTION dossier_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION dossier_reject_mutation();
--> statement-breakpoint
DROP TRIGGER IF EXISTS submissions_append_only ON submissions;
--> statement-breakpoint
CREATE TRIGGER submissions_append_only BEFORE UPDATE OR DELETE ON submissions
  FOR EACH ROW EXECUTE FUNCTION dossier_reject_mutation();
