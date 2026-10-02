import { and, asc, desc, eq, gt } from "drizzle-orm";
import type { Executor } from "../db/client";
import { gameStateEvents, gameStates } from "../db/schema";
import { emptyState, reduceAll, type GameState, type StateEvent, type StateEventBody } from "./core/state";

/**
 * Persistence for the state journal. `game_state_events` is append-only (DB
 * trigger); `game_states` is a snapshot cache that can always be rebuilt by
 * folding the journal from zero.
 */

type Row = typeof gameStateEvents.$inferSelect;

function nodeOf(body: StateEventBody): string | null {
  return "node" in body && typeof body.node === "string" && body.node ? body.node : null;
}

export function rowToEvent(r: Row): StateEvent {
  return { ...(r.payload as object), type: r.type, seq: r.id, at: r.createdAt.toISOString() } as StateEvent;
}

export interface StateOptions {
  phase?: string;
  hintTokens?: number;
}

/** Loads a team's state: snapshot + journal tail, folded. Pass `forUpdate` inside a transaction to serialise commands per team. */
export async function loadState(db: Executor, eventId: string, teamId: string, opts: StateOptions & { forUpdate?: boolean } = {}): Promise<GameState> {
  const base = emptyState(eventId, teamId, opts);
  const snapQ = db.select().from(gameStates).where(eq(gameStates.teamId, teamId));
  const [snap] = opts.forUpdate ? await snapQ.for("update") : await snapQ;
  const start = snap && snap.eventId === eventId ? (snap.state as unknown as GameState) : base;
  const since = snap && snap.eventId === eventId ? snap.version : 0;
  const tail = await db
    .select()
    .from(gameStateEvents)
    .where(and(eq(gameStateEvents.eventId, eventId), eq(gameStateEvents.teamId, teamId), gt(gameStateEvents.id, since)))
    .orderBy(asc(gameStateEvents.id));
  return tail.length ? reduceAll(start, tail.map(rowToEvent)) : start;
}

/** Full rebuild from the journal, ignoring the snapshot (used by tests and admin tools to prove the fold is authoritative). */
export async function rebuildState(db: Executor, eventId: string, teamId: string, opts: StateOptions = {}): Promise<GameState> {
  const rows = await db.select().from(gameStateEvents).where(and(eq(gameStateEvents.eventId, eventId), eq(gameStateEvents.teamId, teamId))).orderBy(asc(gameStateEvents.id));
  return reduceAll(emptyState(eventId, teamId, opts), rows.map(rowToEvent));
}

export async function appendEvents(db: Executor, eventId: string, teamId: string, bodies: StateEventBody[], actor: string, at = new Date()): Promise<StateEvent[]> {
  if (!bodies.length) return [];
  const rows = await db
    .insert(gameStateEvents)
    .values(
      bodies.map((b) => {
        const { type, ...payload } = b;
        return { eventId, teamId, type, nodeId: nodeOf(b), payload: payload as Record<string, unknown>, actor, createdAt: at };
      }),
    )
    .returning();
  return rows.map(rowToEvent);
}

export async function saveSnapshot(db: Executor, state: GameState) {
  await db
    .insert(gameStates)
    .values({ teamId: state.teamId, eventId: state.eventId, version: state.version, state: state as unknown as Record<string, unknown>, updatedAt: new Date() })
    .onConflictDoUpdate({ target: gameStates.teamId, set: { eventId: state.eventId, version: state.version, state: state as unknown as Record<string, unknown>, updatedAt: new Date() } });
}

export async function recentEvents(db: Executor, eventId: string, teamId: string, limit = 30): Promise<StateEvent[]> {
  const rows = await db
    .select()
    .from(gameStateEvents)
    .where(and(eq(gameStateEvents.eventId, eventId), eq(gameStateEvents.teamId, teamId)))
    .orderBy(desc(gameStateEvents.id))
    .limit(limit);
  return rows.map(rowToEvent);
}
