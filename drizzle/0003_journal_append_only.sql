-- The state journal is append-only, like the score ledger: GameState is a fold
-- over it, so rewriting a row would silently rewrite a team's history.
DROP TRIGGER IF EXISTS game_state_events_append_only ON game_state_events;
--> statement-breakpoint
CREATE TRIGGER game_state_events_append_only BEFORE UPDATE OR DELETE ON game_state_events
  FOR EACH ROW EXECUTE FUNCTION dossier_reject_mutation();
--> statement-breakpoint
-- `scores`: the point-bearing view of the ledger (event_log). Solves with NULL
-- points are valued dynamically by the engine; everything else is a fixed delta.
CREATE OR REPLACE VIEW scores AS
  SELECT id, event_id, team_id, type, challenge_id, points, created_at
  FROM event_log
  WHERE type = 'solve' OR points IS NOT NULL;
