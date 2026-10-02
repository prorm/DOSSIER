import { eq } from "drizzle-orm";
import type { Executor } from "../db/client";
import { boardStates, evidenceLinks, teams } from "../db/schema";
import { bus, topics } from "../realtime/bus";
import { GameError } from "../engine/errors";
import type { EventRow } from "../engine/types";
import { applyBoardOps, EMPTY_BOARD, type BoardLayout, type BoardOp } from "../../lib/board";
import { reduceAll } from "./core/state";
import { appendEvents, loadState, saveSnapshot } from "./journal";
import { boardItems, stateOptions, syncTeam } from "./engine";
import { scoreBoard } from "./primitives/inquest";

/**
 * Evidence board. Layout edits are ops merged server-side (teammates never
 * clobber each other). Every save re-analyses the labelled links against the
 * case's relationship truth table; the supported-link count is journaled so
 * `links` gates react immediately. Validity is never sent to the client, and
 * boards padded with unsupported assertions earn no credit.
 */
export async function updateBoard(db: Executor, event: EventRow, teamId: string, ops: BoardOp[]) {
  if (ops.length > 200) throw new GameError("invalid", "Too many board operations in one batch.");
  const { ctx } = await syncTeam(db, event, teamId);
  const allowed = new Set((await boardItems(db, event, teamId)).map((i) => i.id));
  const truth = ctx.compiled.bp.relations.map((r) => ({ from: r.from, to: r.to, kind: r.kind }));
  const out = await db.transaction(async (tx) => {
    await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).for("update");
    await tx.insert(boardStates).values({ teamId, eventId: event.id, layout: EMPTY_BOARD as never, version: 0 }).onConflictDoNothing();
    const [row] = await tx.select().from(boardStates).where(eq(boardStates.teamId, teamId));
    const current = row && row.eventId === event.id ? { ...EMPTY_BOARD, ...((row.layout ?? {}) as Partial<BoardLayout>) } : EMPTY_BOARD;
    const layout = applyBoardOps(current, ops, allowed);
    const version = (row?.version ?? 0) + 1;
    await tx.update(boardStates).set({ eventId: event.id, layout: layout as never, version, updatedAt: new Date() }).where(eq(boardStates.teamId, teamId));

    // Projection with validity (server-only).
    await tx.delete(evidenceLinks).where(eq(evidenceLinks.teamId, teamId));
    if (layout.links.length)
      await tx.insert(evidenceLinks).values(
        layout.links.map((l) => ({
          eventId: event.id,
          teamId,
          linkId: l.id,
          fromId: l.from,
          toId: l.to,
          relation: l.label.toLowerCase(),
          valid: scoreBoard([{ from: l.from, to: l.to, label: l.label }], truth).valid === 1,
        })),
      );
    const raw = scoreBoard(layout.links, truth);
    // Anti-guessing: a board carrying more unsupported than supported assertions (beyond a small slack) earns no credit.
    const score = { valid: raw.invalid > Math.max(3, raw.valid) ? 0 : raw.valid, invalid: raw.invalid };
    const s = await loadState(tx, event.id, teamId, stateOptions(ctx.compiled));
    if (s.board.valid !== score.valid || s.board.invalid !== score.invalid) {
      const w = await appendEvents(tx, event.id, teamId, [{ type: "board.evaluated", valid: score.valid, invalid: score.invalid }], "team");
      await saveSnapshot(tx, reduceAll(s, w));
    }
    return { layout, version };
  });
  // Board changes can satisfy `links` gates. What this save opened is reported back exactly — to the
  // player who made it and, on the board signal, to teammates — so the wall can answer a theory that worked.
  // It says *that* the board opened something, never which strings were right.
  const { settled } = await syncTeam(db, event, teamId);
  const opened = settled.unlocked.length || settled.evidence.length ? settled : undefined;
  await bus().publish(topics.team(teamId), "board", { version: out.version, ...(opened ? { opened } : {}) });
  return { ...out, ...(opened ? { opened } : {}) };
}
