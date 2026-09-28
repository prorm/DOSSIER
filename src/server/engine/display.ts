import { eq, sql } from "drizzle-orm";
import type { Executor } from "../db/client";
import { events } from "../db/schema";
import { env } from "../env";
import { audit, type Actor } from "../audit";
import { signToken, verifyToken } from "../security/crypto";
import type { EventRow } from "./types";

/**
 * Projector links: /display?k=<token>. The token is bound to the event and a
 * key version; "revoke all display links" bumps the version.
 */
export function displayToken(event: EventRow): string {
  return signToken(env().TOKEN_SECRET, "display", { e: event.id, v: event.displayKeyVersion });
}

export function verifyDisplayToken(event: EventRow, token: string): boolean {
  if (!token) return false;
  const c = verifyToken<{ e: string; v: number }>(env().TOKEN_SECRET, "display", token);
  return Boolean(c && c.e === event.id && c.v === event.displayKeyVersion);
}

export async function rotateDisplayKey(db: Executor, event: EventRow, actor: Actor) {
  const [e] = await db
    .update(events)
    .set({ displayKeyVersion: sql`${events.displayKeyVersion} + 1` })
    .where(eq(events.id, event.id))
    .returning();
  await audit(db, actor, "display.rotate_key", { eventId: event.id });
  return e!;
}
