import "./_env";
import { sql } from "drizzle-orm";
import { createDb } from "../src/server/db/client";

/** Wipes ALL DOSSIER data (development only). TRUNCATE bypasses the append-only row triggers by design. */
async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    throw new Error("refusing to reset in production without --force");
  }
  const handle = await createDb(process.env.DATABASE_URL!);
  await handle.db.execute(sql`TRUNCATE events, teams, participants, staff_users, sessions, challenges, checkpoints, unlocks, submissions,
    hint_purchases, checkpoint_scans, evidence_reveals, accusations, board_states, announcements, score_adjustments,
    event_log, audit_log, leaderboard_cache, rate_limits, used_tokens RESTART IDENTITY CASCADE`);
  console.log("✔ database wiped");
  await handle.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
