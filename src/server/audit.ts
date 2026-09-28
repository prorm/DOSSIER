import type { Executor } from "./db/client";
import { auditLog } from "./db/schema";

export interface Actor {
  type: "staff" | "station" | "system" | "team";
  id: string | null;
  label: string;
  ip?: string | null;
}

/** Records a privileged operation. The audit table is append-only (DB trigger). */
export async function audit(
  db: Executor,
  actor: Actor,
  action: string,
  opts: { eventId?: string | null; target?: string; details?: Record<string, unknown> } = {},
) {
  await db.insert(auditLog).values({
    eventId: opts.eventId ?? null,
    actorType: actor.type,
    actorId: actor.id,
    actorLabel: actor.label,
    action,
    target: opts.target ?? null,
    details: opts.details ?? {},
    ip: actor.ip ?? null,
  });
}

export const SYSTEM_ACTOR: Actor = { type: "system", id: null, label: "system" };
