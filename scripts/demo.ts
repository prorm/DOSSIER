import "./_env";
import { eq } from "drizzle-orm";
import { seed } from "./seed";
import { events, staffUsers } from "../src/server/db/schema";
import { createStaff, registerTeam } from "../src/server/auth/accounts";
import { SYSTEM_ACTOR } from "../src/server/audit";
import { announce } from "../src/server/engine/admin";
import { controlEvent } from "../src/server/engine/event";
import { claimCheckpoint, checkpointToken, decideScan, listCheckpoints } from "../src/server/engine/live";
import { purchaseHint, submitAnswer } from "../src/server/engine/play";
import { recomputeLeaderboard } from "../src/server/engine/leaderboard";

/**
 * Demo data for showcases and screenshots (never run against a real event):
 * seeds the demo pack, starts it, registers sample teams and plays through a
 * realistic spread of solves so the leaderboard, dashboards and display look
 * alive. Answers below are the demo pack's own public answers.
 */
const DEMO_SOLVES: [string, string][] = [
  ["sanity", "DOSSIER{welcome_operative}"],
  ["h01", "keyboard"],
  ["rot-in-peace", "DOSSIER{rot13_is_a_classic}"],
  ["comment-section", "DOSSIER{v1ew_s0urce_1s_a_sk1ll}"],
  ["h02", "lab"],
  ["h03", "library"],
  ["i-phone", "909"],
  ["cookie-monster", "DOSSIER{b64_1s_n0t_3ncrypt10n}"],
  ["h04", "11"],
  ["i-receipt", "caffeine"],
  ["xor-marks", "DOSSIER{x0r_w1th_0ne_byt3}"],
  ["h05", "simulation"],
  ["number-station", "24133"],
  ["i-cctv", "23:35"],
  ["packet-of-lies", "DOSSIER{gr3p_is_y0ur_fr13nd}"],
];

const TEAMS = [
  "Null Pointers", "Kernel Panic", "Byte Club", "The Segfaults", "Root Access", "Cache Me Outside",
  "Stack Smashers", "Bit Flippers", "Packet Sniffers", "Zero Day Dreamers", "Heap Overflow", "Lambda Lords",
];

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) throw new Error("refusing to load demo data in production");
  process.env.ACTIVE_PACK ??= "demo-cyber-heist";
  const handle = await seed();
  const db = handle.db;
  let [event] = await db.select().from(events).where(eq(events.active, true)).limit(1);
  if (!event) throw new Error("no active event");
  if (event.status === "draft") event = await controlEvent(db, event, "start", SYSTEM_ACTOR);

  for (const [email, role] of [["admin@dossier.local", "admin"], ["volunteer@dossier.local", "volunteer"]] as const) {
    const [s] = await db.select().from(staffUsers).where(eq(staffUsers.email, email)).limit(1);
    if (!s) await createStaff(db, { email, role, name: role, password: "dossier-demo-pass" }, SYSTEM_ACTOR);
  }

  const cps = await listCheckpoints(db, event.id);
  let n = 0;
  for (const name of TEAMS) {
    let team;
    try {
      team = await registerTeam(db, event, { teamName: name, password: "demo-password", affiliation: ["IIT Demo", "NIT Sample", "State College"][n % 3]!, members: [{ name: "Operative A" }, { name: "Operative B" }], code: "" }, `10.9.0.${n}`);
    } catch (e) {
      console.log(`• ${name}: ${e instanceof Error ? e.message : e}`);
      n++;
      continue;
    }
    const depth = Math.max(2, DEMO_SOLVES.length - n - Math.floor(Math.random() * 4));
    for (const [cid, ans] of DEMO_SOLVES.slice(0, depth)) {
      if (Math.random() < 0.15) await submitAnswer(db, { event, teamId: team.id, challengeId: cid, answer: "wrong guess" }).catch(() => {});
      await submitAnswer(db, { event, teamId: team.id, challengeId: cid, answer: ans }).catch(() => {});
    }
    if (n % 3 === 0) await purchaseHint(db, { event, teamId: team.id, challengeId: "vigenere-vault", index: 0 }).catch(() => {});
    for (const cp of cps.slice(0, (n % 4) + 1)) {
      const r = await claimCheckpoint(db, { event, teamId: team.id, token: checkpointToken(cp) }).catch(() => null);
      if (r?.status === "pending" && n % 2 === 0) {
        const [scan] = (await (await import("../src/server/engine/live")).stationQueue(db, event.id, cp.id)).filter((s) => s.teamId === team.id);
        if (scan) await decideScan(db, { event, scanId: scan.id, approve: true, actor: { type: "station", id: cp.id, label: `station:${cp.id}` } });
      }
    }
    n++;
    console.log(`✔ ${name}`);
  }
  await announce(db, event, { title: "Welcome, operatives", body: "All four operations are live. Good hunting.", level: "info" }, SYSTEM_ACTOR);
  await recomputeLeaderboard(db, event.id);
  console.log("\nDemo ready. Staff: admin@dossier.local / volunteer@dossier.local — password dossier-demo-pass. Teams: <name> / demo-password");
  await handle.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
