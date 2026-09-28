import { eq } from "drizzle-orm";
import type { Executor } from "../db/client";
import { events } from "../db/schema";
import { audit, type Actor } from "../audit";
import { bus, topics } from "../realtime/bus";
import { GameError } from "./errors";
import type { EventRow } from "./types";

export type Phase = "standby" | "live" | "paused" | "ended";

/** Effective phase: a live event past its configured end time is treated as ended. */
export function eventPhase(e: EventRow, now = new Date()): Phase {
  if (e.status === "ended") return "ended";
  if (e.status === "paused") return "paused";
  if (e.status === "live") return e.endsAt && now > e.endsAt ? "ended" : "live";
  return "standby";
}

/** Effective freeze instant: manual freeze, else the scheduled freeze once it has passed. */
export function freezeInstant(e: EventRow, now = new Date()): Date | null {
  if (e.frozenAt) return e.frozenAt;
  const scheduled = (e.config as { scoring?: { freeze_at?: string } }).scoring?.freeze_at;
  if (scheduled && new Date(scheduled) <= now && eventPhase(e, now) !== "ended") return new Date(scheduled);
  return null;
}

export function assertPlayable(e: EventRow, now = new Date()) {
  const phase = eventPhase(e, now);
  if (phase === "standby") throw new GameError("event_not_live", "The event has not started yet.");
  if (phase === "paused") throw new GameError("event_paused", "The event is paused. Submissions resume shortly.");
  if (phase === "ended") throw new GameError("event_ended", "The event has ended.");
}

export async function getActiveEvent(db: Executor): Promise<EventRow | null> {
  const [row] = await db.select().from(events).where(eq(events.active, true)).limit(1);
  return row ?? null;
}

export async function requireActiveEvent(db: Executor): Promise<EventRow> {
  const e = await getActiveEvent(db);
  if (!e) throw new GameError("not_found", "No active event. Import a content pack first.");
  return e;
}

export type EventControl = "start" | "pause" | "resume" | "freeze" | "unfreeze" | "end" | "reopen";

/** State machine for event controls. Every transition is audited and broadcast. */
export async function controlEvent(db: Executor, e: EventRow, action: EventControl, actor: Actor): Promise<EventRow> {
  const now = new Date();
  const phase = eventPhase(e, now);
  const patch: Partial<typeof events.$inferInsert> = { updatedAt: now };
  switch (action) {
    case "start":
      if (phase !== "standby") throw new GameError("conflict", "Only an event in standby can be started.");
      Object.assign(patch, { status: "live", startedAt: now });
      break;
    case "pause":
      if (phase !== "live") throw new GameError("conflict", "Only a live event can be paused.");
      Object.assign(patch, { status: "paused", pausedAt: now });
      break;
    case "resume":
      if (phase !== "paused") throw new GameError("conflict", "Only a paused event can be resumed.");
      Object.assign(patch, { status: "live", pausedAt: null });
      break;
    case "freeze":
      if (e.frozenAt) throw new GameError("conflict", "The scoreboard is already frozen.");
      if (phase === "ended" || phase === "standby") throw new GameError("conflict", "Freeze applies to a running event.");
      Object.assign(patch, { frozenAt: now });
      break;
    case "unfreeze":
      if (!e.frozenAt) throw new GameError("conflict", "The scoreboard is not frozen.");
      Object.assign(patch, { frozenAt: null });
      break;
    case "end":
      if (phase === "ended" && e.status === "ended") throw new GameError("conflict", "The event has already ended.");
      if (phase === "standby") throw new GameError("conflict", "The event never started.");
      Object.assign(patch, { status: "ended", endedAt: now, frozenAt: null });
      break;
    case "reopen":
      if (e.status !== "ended") throw new GameError("conflict", "Only an ended event can be reopened.");
      Object.assign(patch, { status: "paused", endedAt: null, pausedAt: now });
      break;
  }
  const [updated] = await db.update(events).set(patch).where(eq(events.id, e.id)).returning();
  await audit(db, actor, `event.${action}`, { eventId: e.id, target: e.id, details: { from: e.status, to: updated!.status } });
  await bus().publish(topics.event(e.id), "event-status", { status: updated!.status, frozen: Boolean(updated!.frozenAt) });
  return updated!;
}
