import "server-only";

import { and, eq, ne } from "drizzle-orm";

import type { Executor } from "../db/client";
import { teams } from "../db/schema";
import type { EventRow } from "../engine/types";
import { env } from "../env";
import { dispatch, requireCompiled, takeHint, teamOverview, worldFor } from "./engine";
import { loadState } from "./journal";

/**
 * Demo traffic: a staff-only switch that has the demo teams keep playing the
 * live event *through the real engine* — intended solutions, the odd wrong
 * guess, a hint now and then — so a Control Room on a projector shows an event
 * that is actually moving. Every action is a genuine dispatch: it is journaled,
 * scored and signalled exactly like a player's. The room labels it while it runs.
 *
 * Off unless the deployment opts in (DEV_UI, or DEMO_TRAFFIC=1): never available
 * on a real event. One team can be spared (the one the presenter plays as).
 * It stops itself after half an hour.
 */

export interface DemoTrafficStatus {
  available: boolean;
  running: boolean;
  eventId: string | null;
  spare: string | null;
  actions: number;
  startedAt: string | null;
  last: string | null;
}

const MAX_MS = 30 * 60_000;

const g = globalThis as unknown as { __dossierDemoTraffic?: { timer: ReturnType<typeof setTimeout> | null; eventId: string | null; spare: string | null; actions: number; startedAt: number; last: string | null; busy: boolean } };
const st = (g.__dossierDemoTraffic ??= { timer: null, eventId: null, spare: null, actions: 0, startedAt: 0, last: null, busy: false });

export function demoTrafficAvailable(): boolean {
  return Boolean(env().DEV_UI) || process.env.DEMO_TRAFFIC === "1";
}

export function demoTrafficStatus(): DemoTrafficStatus {
  return {
    available: demoTrafficAvailable(),
    running: Boolean(st.timer),
    eventId: st.eventId,
    spare: st.spare,
    actions: st.actions,
    startedAt: st.startedAt ? new Date(st.startedAt).toISOString() : null,
    last: st.last,
  };
}

export function stopDemoTraffic() {
  if (st.timer) clearTimeout(st.timer);
  st.timer = null;
  st.eventId = null;
}

/** Start (or restart) the traffic on this event. `spare`: a team name the driver never plays as. */
export function startDemoTraffic(getDb: () => Promise<Executor>, event: EventRow, spare: string | null) {
  if (!demoTrafficAvailable()) throw new Error("Demo traffic is not enabled on this deployment.");
  stopDemoTraffic();
  st.eventId = event.id;
  st.spare = spare;
  st.actions = 0;
  st.startedAt = Date.now();
  st.last = null;
  const loop = () => {
    st.timer = setTimeout(async () => {
      if (!st.timer || st.eventId !== event.id) return;
      if (Date.now() - st.startedAt > MAX_MS) return stopDemoTraffic();
      if (!st.busy) {
        st.busy = true;
        try {
          const db = await getDb();
          const line = await step(db, event, st.spare);
          if (line) {
            st.actions += 1;
            st.last = line;
          }
        } catch {
          /* a refused action (cooldown, already solved) is part of the traffic */
        } finally {
          st.busy = false;
        }
      }
      loop();
    }, 2600 + Math.random() * 2400);
  };
  loop();
  return demoTrafficStatus();
}

/** One move by one team: what a real team at that point might do next. */
async function step(db: Executor, event: EventRow, spare: string | null): Promise<string | null> {
  const rows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(and(eq(teams.eventId, event.id), ne(teams.kind, "playtest"), eq(teams.status, "active")));
  const pool = rows.filter((t) => !spare || t.name.toLowerCase() !== spare.toLowerCase());
  if (!pool.length) return null;
  const team = pool[Math.floor(Math.random() * pool.length)]!;
  const o = await teamOverview(db, event, team.id);
  const open = o.acts.flatMap((a) => a.rounds.flatMap((r) => r.nodes)).filter((n) => n.state === "open");
  if (!open.length) return null;
  const card = open[Math.floor(Math.random() * open.length)]!;
  const compiled = requireCompiled(event);
  const node = compiled.nodes.get(card.id);
  // Physical checkpoints need a volunteer; the board deduction needs a wired board. Leave those to people.
  if (!node || node.primitive === "qr-checkpoint" || node.primitive === "board-deduction") return null;
  const roll = Math.random();
  if (roll < 0.14 && node.hints.length) {
    const s = await loadState(db, event.id, team.id);
    const taken = s.nodes[node.id]?.hints.length ?? 0;
    if (taken < node.hints.length) {
      await takeHint(db, { event, teamId: team.id, nodeId: node.id, index: taken });
      return `${team.name} took a hint on ${node.title}`;
    }
  }
  if (roll < 0.42) {
    await dispatch(db, { event, teamId: team.id, nodeId: node.id, action: { type: "answer", value: "NOT-IT" }, ip: "demo-traffic" });
    return `${team.name} missed on ${node.title}`;
  }
  const world = await worldFor(event, compiled, team.id);
  const ni = world.nodes.get(node.id);
  if (!ni) return null;
  const state = await loadState(db, event.id, team.id);
  for (const action of ni.primitive.intendedSolution(ni.instance, state)) {
    const r = await dispatch(db, { event, teamId: team.id, nodeId: node.id, action, ip: "demo-traffic" });
    if (r.solved) return `${team.name} solved ${node.title}`;
  }
  return `${team.name} worked on ${node.title}`;
}
