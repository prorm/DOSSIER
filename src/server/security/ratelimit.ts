import { eq, sql } from "drizzle-orm";
import type { Executor } from "../db/client";
import { rateLimits } from "../db/schema";

/** Dates inside raw SQL must be explicit timestamptz literals (driver-agnostic). */
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

export interface LimitResult {
  ok: boolean;
  retryAfterMs: number;
  remaining: number;
}

export interface BackoffPolicy {
  /** Wrong attempts allowed before backoff kicks in. */
  freeAttempts: number;
  /** First penalty delay in ms; doubles for each further strike. */
  baseDelayMs: number;
  maxDelayMs: number;
  /** Strikes decay entirely after this much quiet time. */
  resetAfterMs: number;
}

export const SUBMISSION_BACKOFF: BackoffPolicy = {
  freeAttempts: 5,
  baseDelayMs: 5_000,
  maxDelayMs: 5 * 60_000,
  resetAfterMs: 15 * 60_000,
};

export const AUTH_BACKOFF: BackoffPolicy = {
  freeAttempts: 8,
  baseDelayMs: 10_000,
  maxDelayMs: 15 * 60_000,
  resetAfterMs: 30 * 60_000,
};

/** Delay imposed after `strikes` failures. Pure; unit-tested. */
export function backoffDelay(strikes: number, p: BackoffPolicy): number {
  if (strikes < p.freeAttempts) return 0;
  const exp = strikes - p.freeAttempts;
  return Math.min(p.maxDelayMs, p.baseDelayMs * 2 ** Math.min(exp, 20));
}

/** Is the key currently blocked? Does not consume anything. */
export async function checkBlocked(db: Executor, key: string, now = new Date()): Promise<LimitResult> {
  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  if (row?.blockedUntil && row.blockedUntil > now) {
    return { ok: false, retryAfterMs: row.blockedUntil.getTime() - now.getTime(), remaining: 0 };
  }
  return { ok: true, retryAfterMs: 0, remaining: Infinity };
}

/** Records a failure and (re)computes the exponential backoff window. Atomic upsert. */
export async function recordFailure(db: Executor, key: string, policy: BackoffPolicy, now = new Date()): Promise<LimitResult> {
  const resetBefore = new Date(now.getTime() - policy.resetAfterMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, strikes: 1, windowStart: now, updatedAt: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        strikes: sql`CASE WHEN ${rateLimits.updatedAt} < ${ts(resetBefore)} THEN 1 ELSE ${rateLimits.strikes} + 1 END`,
        updatedAt: now,
      },
    })
    .returning();
  const strikes = row?.strikes ?? 1;
  const delay = backoffDelay(strikes, policy);
  if (delay > 0) {
    const until = new Date(now.getTime() + delay);
    await db.update(rateLimits).set({ blockedUntil: until }).where(eq(rateLimits.key, key));
    return { ok: false, retryAfterMs: delay, remaining: 0 };
  }
  return { ok: true, retryAfterMs: 0, remaining: policy.freeAttempts - strikes };
}

export async function clearKey(db: Executor, key: string) {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

/**
 * Fixed-window counter (e.g. N requests / minute / IP). Exceeding the limit
 * blocks for the rest of the window.
 */
export async function hitWindow(db: Executor, key: string, limit: number, windowMs: number, now = new Date()): Promise<LimitResult> {
  const windowFloor = new Date(now.getTime() - windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: now, updatedAt: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.windowStart} < ${ts(windowFloor)} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${rateLimits.windowStart} < ${ts(windowFloor)} THEN ${ts(now)} ELSE ${rateLimits.windowStart} END`,
        updatedAt: now,
      },
    })
    .returning();
  const count = row?.count ?? 1;
  if (count > limit) {
    const start = row?.windowStart ?? now;
    return { ok: false, retryAfterMs: Math.max(1000, start.getTime() + windowMs - now.getTime()), remaining: 0 };
  }
  return { ok: true, retryAfterMs: 0, remaining: limit - count };
}
