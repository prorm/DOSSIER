import { and, eq, inArray, not } from "drizzle-orm";
import type { Executor } from "../db/client";
import { challenges, checkpoints, events } from "../db/schema";
import { env } from "../env";
import { audit, SYSTEM_ACTOR, type Actor } from "../audit";
import { hashPassword, sha256 } from "../security/crypto";
import { makeAnswerHash, type NormalizeMode } from "../security/answers";
import { recomputeLeaderboard } from "../engine/leaderboard";
import type { ChallengeConfig } from "../engine/types";
import type { ChallengeDef, PackDef } from "./schema";

export function defaultNormalize(c: ChallengeDef): NormalizeMode {
  if (c.answer.normalize) return c.answer.normalize;
  if (c.answer.type === "flag") return "exact";
  return c.mode === "hunt" ? "loose" : "standard";
}

export function challengeConfigFromDef(c: ChallengeDef): ChallengeConfig {
  return {
    points: c.scoring.type === "dynamic" ? c.scoring.initial : c.points,
    scoring: c.scoring,
    first_blood_bonus: c.first_blood_bonus,
    hints: c.hints,
    requires: c.requires,
    available_from: c.available_from,
    assets: c.assets,
    position: c.position,
    reveals: c.reveals,
    tags: c.tags,
    difficulty: c.difficulty,
  };
}

export function publicEventConfig(pack: PackDef): Record<string, unknown> {
  const { registration, ...rest } = pack.event;
  const { code, ...reg } = registration;
  return {
    ...rest,
    registration: { ...reg, requiresCode: Boolean(code), codeHash: code ? sha256(`regcode:${code.trim()}`) : null },
  };
}

export interface ImportSummary {
  eventId: string;
  challenges: number;
  pruned: number;
  hidden: number;
  checkpoints: number;
  activated: boolean;
}

/**
 * Imports (or re-imports) a validated pack. Answers are hashed on the way in —
 * plaintext answers never reach the database. Re-importing a running event
 * never deletes content: removed challenges are hidden instead.
 */
export async function importPack(db: Executor, pack: PackDef, opts: { activate?: boolean; actor?: Actor } = {}): Promise<ImportSummary> {
  const secret = env().ANSWER_SECRET;
  const activate = opts.activate ?? true;
  const pinHashes = new Map<string, string>();
  for (const cp of pack.checkpoints) if (cp.pin) pinHashes.set(cp.id, await hashPassword(cp.pin));

  const summary = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(events).where(eq(events.id, pack.slug)).limit(1);
    const values = {
      id: pack.slug,
      name: pack.event.name,
      config: publicEventConfig(pack),
      story: (pack.story as unknown as Record<string, unknown>) ?? null,
      startsAt: pack.event.starts_at ? new Date(pack.event.starts_at) : null,
      endsAt: pack.event.ends_at ? new Date(pack.event.ends_at) : null,
      packHash: pack.hash,
      updatedAt: new Date(),
    };
    if (existing) await tx.update(events).set(values).where(eq(events.id, pack.slug));
    else await tx.insert(events).values({ ...values, status: "draft" });
    if (activate) {
      await tx.update(events).set({ active: false }).where(not(eq(events.id, pack.slug)));
      await tx.update(events).set({ active: true }).where(eq(events.id, pack.slug));
    }

    const running = existing && existing.status !== "draft";
    const ids = pack.challenges.map((c) => c.id);
    for (const [i, c] of pack.challenges.entries()) {
      const type = c.answer.type;
      const normalize = defaultNormalize(c);
      const answerHashes = [...c.answer.accept.map((a) => makeAnswerHash(secret, a, type, normalize)), ...c.answer.accept_hashes];
      const row = {
        eventId: pack.slug,
        id: c.id,
        mode: c.mode,
        category: c.category ?? null,
        title: c.title,
        bodyMd: c.body,
        config: challengeConfigFromDef(c) as unknown as Record<string, unknown>,
        answerType: type,
        normalize,
        answerHashes,
        sortOrder: c.order * 1000 + i,
        hidden: false,
        sourceFile: c.sourceFile,
        updatedAt: new Date(),
      };
      await tx
        .insert(challenges)
        .values(row)
        .onConflictDoUpdate({ target: [challenges.eventId, challenges.id], set: row });
    }
    let pruned = 0;
    let hidden = 0;
    const stale = await tx
      .select({ id: challenges.id })
      .from(challenges)
      .where(and(eq(challenges.eventId, pack.slug), ids.length ? not(inArray(challenges.id, ids)) : undefined));
    if (stale.length) {
      const staleIds = stale.map((s) => s.id);
      if (running) {
        await tx.update(challenges).set({ hidden: true }).where(and(eq(challenges.eventId, pack.slug), inArray(challenges.id, staleIds)));
        hidden = staleIds.length;
      } else {
        await tx.delete(challenges).where(and(eq(challenges.eventId, pack.slug), inArray(challenges.id, staleIds)));
        pruned = staleIds.length;
      }
    }

    for (const [i, cp] of pack.checkpoints.entries()) {
      const row = {
        eventId: pack.slug,
        id: cp.id,
        name: cp.name,
        location: cp.location,
        instructionsMd: cp.instructions,
        points: cp.points,
        requiresApproval: cp.requires_approval,
        pinHash: pinHashes.get(cp.id) ?? null,
        sortOrder: cp.order * 1000 + i,
      };
      await tx
        .insert(checkpoints)
        .values(row)
        .onConflictDoUpdate({ target: [checkpoints.eventId, checkpoints.id], set: row });
    }
    await audit(tx, opts.actor ?? SYSTEM_ACTOR, "pack.import", {
      eventId: pack.slug,
      target: pack.slug,
      details: { hash: pack.hash, challenges: pack.challenges.length, checkpoints: pack.checkpoints.length, pruned, hidden },
    });
    return { eventId: pack.slug, challenges: pack.challenges.length, pruned, hidden, checkpoints: pack.checkpoints.length, activated: activate };
  });
  await recomputeLeaderboard(db, pack.slug);
  return summary;
}
