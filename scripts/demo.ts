import "./_env";
import { and, eq } from "drizzle-orm";
import { seed } from "./seed";
import { announcements, events, rateLimits, staffUsers } from "../src/server/db/schema";
import { createStaff, registerTeam } from "../src/server/auth/accounts";
import { SYSTEM_ACTOR } from "../src/server/audit";
import { announce } from "../src/server/engine/admin";
import { controlEvent } from "../src/server/engine/event";
import { recomputeLeaderboard } from "../src/server/engine/leaderboard";
import { checkpointToken, claimCheckpoint, getCheckpoint } from "../src/server/engine/live";
import { updateBoard } from "../src/server/game/board";
import { dispatch, requireCompiled, takeHint, teamOverview, worldFor } from "../src/server/game/engine";
import { loadState } from "../src/server/game/journal";
import { closeAllSandboxes } from "../src/server/game/sql-sandbox";
import { Rng } from "../src/server/game/core/rng";

/**
 * Demo data for showcases and screenshots (never run against a real event).
 * Seeds ACTIVE_PACK (default: CASE 017), starts it 150 minutes in the past and
 * simulates a spread of teams playing through it with the engine's own
 * intended solutions — a few wrong guesses, some hints, varying pace — so the
 * leaderboard, Control Room, projector display and case files look alive.
 * Everything goes through the real engine (dispatch/journal/scoring).
 */
const TEAMS = [
  "Null Pointers", "Kernel Panic", "Byte Club", "The Segfaults", "Root Access", "Cache Me Outside",
  "Stack Smashers", "Bit Flippers", "Packet Sniffers", "Zero Day Dreamers", "Heap Overflow", "Lambda Lords",
];
const ELAPSED_MIN = 150;

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) throw new Error("refusing to load demo data in production");
  // The simulator plays with the engine's intended solutions, so it needs a v2 blueprint pack.
  process.env.ACTIVE_PACK = process.env.DEMO_PACK ?? "case-017";
  const handle = await seed();
  const db = handle.db;
  let [event] = await db.select().from(events).where(eq(events.active, true)).limit(1);
  if (!event) throw new Error("no active event");
  if (event.status === "draft") event = await controlEvent(db, event, "start", SYSTEM_ACTOR);
  const start = new Date(Date.now() - ELAPSED_MIN * 60_000);
  // Re-running the demo re-winds the clock: a fresh start, and the same run length ahead of it, so an
  // earlier seed whose end time has passed comes back live instead of showing ENDED.
  const runMs = event.startedAt && event.endsAt ? event.endsAt.getTime() - event.startedAt.getTime() : null;
  const endsAt = runMs && runMs > 0 ? new Date(start.getTime() + runMs) : event.endsAt;
  [event] = await db.update(events).set({ startedAt: start, endsAt, status: "live" }).where(eq(events.id, event.id)).returning();
  event = event!;

  for (const [email, role] of [["admin@dossier.local", "admin"], ["volunteer@dossier.local", "volunteer"]] as const) {
    const [s] = await db.select().from(staffUsers).where(eq(staffUsers.email, email)).limit(1);
    if (!s) await createStaff(db, { email, role, name: role, password: "dossier-demo-pass" }, SYSTEM_ACTOR);
  }

  const compiled = requireCompiled(event);
  const rng = new Rng("dossier-demo");
  let n = 0;
  for (const name of TEAMS) {
    let team;
    try {
      team = await registerTeam(db, event, { teamName: name, password: "demo-password", affiliation: ["Halvorsen Institute", "NIT Sample", "State College"][n % 3]!, members: [{ name: "Operative A" }, { name: "Operative B" }], code: "" }, `10.9.0.${n}`);
    } catch (e) {
      console.log(`• ${name}: ${e instanceof Error ? e.message : e}`);
      n++;
      continue;
    }
    // Pace: strong teams run ~0.6× the estimates, weaker ones ~1.6×.
    const pace = 0.6 + (n / TEAMS.length) * 1.0 + rng.next() * 0.2;
    const world = await worldFor(event, compiled, team.id);
    let clock = start.getTime() + rng.int(1, 6) * 60_000;
    let solved = 0;
    for (let round = 0; round < 40 && clock < Date.now(); round++) {
      await db.delete(rateLimits);
      const o = await teamOverview(db, event, team.id, new Date(clock));
      const open = o.acts.flatMap((a) => a.rounds.flatMap((r) => r.nodes)).filter((c) => c.state === "open" && !(c.optional && rng.next() < 0.5));
      if (!open.length) break;
      let progressed = false;
      for (const card of open) {
        const node = compiled.nodes.get(card.id)!;
        const spend = node.estimatedMinutes * pace * (0.7 + rng.next() * 0.6) * 60_000;
        if (clock + spend > Date.now()) continue;
        clock += spend;
        const now = new Date(clock);
        if (node.primitive === "qr-checkpoint") {
          const cp = await getCheckpoint(db, event.id, (node.config as { checkpoint: string }).checkpoint);
          if (cp) await claimCheckpoint(db, { event, teamId: team.id, token: checkpointToken(cp), now }).catch(() => null);
          progressed = true;
          continue;
        }
        if (node.primitive === "board-deduction") {
          const rels = compiled.bp.relations;
          const ids = [...new Set(rels.flatMap((r) => [r.from, r.to]))];
          await updateBoard(db, event, team.id, [
            // A spaced grid: exhibit cards are ~196 wide and up to ~150 tall, and strings need room to run.
            ...ids.map((id, i) => ({ op: "place" as const, id, x: (i % 5) * 250, y: Math.floor(i / 5) * 200 })),
            ...rels.map((r, i) => ({ op: "link" as const, id: `l${i}`, from: r.from, to: r.to, label: r.kind })),
          ]).catch(() => null);
        }
        if (node.hints.length && rng.next() < 0.25) await takeHint(db, { event, teamId: team.id, nodeId: card.id, index: 0, now }).catch(() => null);
        if (rng.next() < 0.3) await dispatch(db, { event, teamId: team.id, nodeId: card.id, action: { type: "answer", value: "WRONG-GUESS" }, now }).catch(() => null);
        const ni = world.nodes.get(card.id);
        if (!ni) continue;
        const state = await loadState(db, event.id, team.id);
        for (const action of ni.primitive.intendedSolution(ni.instance, state)) {
          const r = await dispatch(db, { event, teamId: team.id, nodeId: card.id, action, now }).catch(() => null);
          if (!r) break;
          if (r.solved) {
            solved++;
            progressed = true;
            break;
          }
        }
      }
      if (!progressed) break;
    }
    n++;
    console.log(`✔ ${name}: ${solved} file(s) closed`);
  }
  // Re-running the demo must not stack the same welcome on the projector.
  const welcomed = await db.select({ id: announcements.id }).from(announcements).where(and(eq(announcements.eventId, event.id), eq(announcements.title, "Welcome, investigators"))).limit(1);
  if (!welcomed.length) await announce(db, event, { title: "Welcome, investigators", body: "The case is open. Trust the evidence, not the story you are told.", level: "info" }, SYSTEM_ACTOR);
  await recomputeLeaderboard(db, event.id);
  await closeAllSandboxes();
  console.log("\nDemo ready. Staff: admin@dossier.local / volunteer@dossier.local — password dossier-demo-pass. Teams: <name> / demo-password");
  await handle.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
