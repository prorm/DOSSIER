import { and, eq, inArray, not } from "drizzle-orm";
import type { Executor } from "../db/client";
import {
  artifacts,
  challengeDependencies,
  challenges,
  challengeTypes,
  characters,
  checkpoints,
  events,
  evidence,
  hints,
  locations,
  narrativeActs,
  rounds,
  stories,
  suspects,
  timelineEvents,
} from "../db/schema";
import { env } from "../env";
import { hashPassword, sha256 } from "../security/crypto";
import { makeAnswerHash } from "../security/answers";
import type { EventRow } from "../engine/types";
import { Blueprint, familyOf, hintCost, type BlueprintT, type EvidenceDef, type NodeDef } from "./core/blueprint";
import { gateRefs } from "./core/gates";
import { analyzeBlueprint, type BlueprintAnalysis } from "./compiler/analysis";
import { primitiveCatalog } from "./primitives/registry";
import { clearWorldCache } from "./world";

/**
 * From authored blueprint to running event:
 *   prepare  — schema-validate, hash any plaintext static answers
 *   publish  — store the compiled blueprint (versioned), materialise the
 *              relational projection, invalidate per-team world caches.
 */

export interface Prepared {
  blueprint: BlueprintT;
  /** Plaintext static answers seen during preparation (for leak checks before they are discarded). */
  plaintext: Map<string, string[]>;
}

export function prepareBlueprint(input: unknown): Prepared {
  const bp = Blueprint.parse(input);
  const plaintext = new Map<string, string[]>();
  const secret = env().ANSWER_SECRET;
  bp.nodes = bp.nodes.map((n) => {
    if (n.primitive !== "static-answer") return n;
    const a = (n.config as { answer?: { type?: "text" | "flag" | "number"; normalize?: "loose" | "standard" | "exact"; accept?: string[]; hashes?: unknown[] } }).answer;
    if (!a?.accept?.length) return n;
    plaintext.set(n.id, a.accept);
    const type = a.type ?? "text";
    const normalize = a.normalize ?? (type === "flag" ? "exact" : "loose");
    const hashes = [...(a.hashes ?? []), ...a.accept.map((x) => makeAnswerHash(secret, x, type, normalize))];
    return { ...n, config: { ...n.config, answer: { type, normalize, hashes } } };
  });
  return { blueprint: bp, plaintext };
}

/* ─────────────────────────── Compiled view (cached per version) ─────────────────────────── */

export interface Compiled {
  eventId: string;
  version: number;
  bp: BlueprintT;
  nodes: Map<string, NodeDef>;
  evidence: Map<string, EvidenceDef>;
  roundOf: Map<string, string>;
  actOf: Map<string, string>;
  analysis: BlueprintAnalysis;
}

const g = globalThis as unknown as { __dossierCompiled?: Map<string, Compiled> };
const compiledCache = (g.__dossierCompiled ??= new Map());

export function compile(eventId: string, version: number, bp: BlueprintT): Compiled {
  const roundAct = new Map(bp.rounds.map((r) => [r.id, r.act]));
  return {
    eventId,
    version,
    bp,
    nodes: new Map(bp.nodes.map((n) => [n.id, n])),
    evidence: new Map(bp.evidence.map((e) => [e.id, e])),
    roundOf: new Map(bp.nodes.map((n) => [n.id, n.round])),
    actOf: new Map(bp.nodes.map((n) => [n.id, roundAct.get(n.round) ?? ""])),
    analysis: analyzeBlueprint(bp),
  };
}

export function compiledFor(event: EventRow): Compiled | null {
  if (!event.blueprint) return null;
  const key = `${event.id}:${event.blueprintVersion}`;
  let c = compiledCache.get(key);
  if (!c) {
    c = compile(event.id, event.blueprintVersion, Blueprint.parse(event.blueprint));
    compiledCache.set(key, c);
    if (compiledCache.size > 50) compiledCache.delete(compiledCache.keys().next().value!);
  }
  return c;
}

/* ─────────────────────────── Public event config ─────────────────────────── */

export function publicConfig(bp: BlueprintT): Record<string, unknown> {
  const e = bp.event;
  const families = [...new Set(bp.rounds.map((r) => r.family))];
  return {
    id: e.id,
    name: e.title,
    tagline: e.tagline,
    organizer: e.organizer || e.university,
    university: e.university,
    description: e.description,
    timezone: e.timezone,
    mode: e.mode,
    durationMinutes: e.durationMinutes,
    families,
    // Legacy view keys (kept so existing screens render): modes drive navigation.
    modes: ["case", ...(bp.checkpoints.length ? ["live"] : [])],
    rules_md: e.rules,
    theme: { accent: e.theme.accent, secondary: e.theme.secondary, logo: e.logo, codename: e.codename || bp.story.codename, boot_lines: e.bootLines },
    presentation: e.presentation,
    registration: {
      open: e.registration.open,
      requiresCode: Boolean(e.registration.code),
      codeHash: e.registration.code ? sha256(`regcode:${e.registration.code.trim()}`) : null,
      min_members: e.teamSize.min,
      max_members: e.teamSize.max,
    },
    scoring: { freeze_at: e.freezeAt, stuck_after_minutes: e.stuckAfterMinutes },
    story: { title: bp.story.title, codename: bp.story.codename },
  };
}

/* ─────────────────────────── Materialisation ─────────────────────────── */

export async function materialize(tx: Executor, eventId: string, bp: BlueprintT, running: boolean) {
  const a = analyzeBlueprint(bp);
  const del = async (table: Parameters<Executor["delete"]>[0], col: Parameters<typeof eq>[0]) => tx.delete(table).where(eq(col, eventId));

  await del(narrativeActs, narrativeActs.eventId);
  await tx.insert(narrativeActs).values(bp.acts.map((x, i) => ({ eventId, id: x.id, title: x.title, summary: x.summary, phase: x.phase ?? null, sortOrder: i })));
  await del(rounds, rounds.eventId);
  await tx.insert(rounds).values(bp.rounds.map((r, i) => ({ eventId, id: r.id, actId: r.act, title: r.title, family: r.family, tier: r.tier, intro: r.intro, sortOrder: i })));
  await del(characters, characters.eventId);
  if (bp.story.characters.length)
    await tx.insert(characters).values(bp.story.characters.map((c) => ({ eventId, id: c.id, name: c.name, role: c.role, bio: c.bio, isSuspect: c.suspect, relationships: c.relationships })));
  await del(suspects, suspects.eventId);
  const sus = bp.story.characters.filter((c) => c.suspect);
  if (sus.length)
    await tx.insert(suspects).values(
      sus.map((c) => ({
        eventId,
        characterId: c.id,
        isCulprit: bp.story.truth.culprit === c.id,
        motive: bp.story.motives.find((m) => m.character === c.id)?.text ?? "",
        redHerring: bp.redHerrings.find((r) => r.id.includes(c.id))?.id ?? null,
      })),
    );
  await del(locations, locations.eventId);
  if (bp.story.locations.length) await tx.insert(locations).values(bp.story.locations.map((l) => ({ eventId, id: l.id, name: l.name, description: l.description, lat: l.geo?.lat ?? null, lon: l.geo?.lon ?? null })));
  await del(artifacts, artifacts.eventId);
  if (bp.story.artifacts.length) await tx.insert(artifacts).values(bp.story.artifacts.map((x) => ({ eventId, id: x.id, name: x.name, kind: x.kind, description: x.description })));
  await del(timelineEvents, timelineEvents.eventId);
  if (bp.story.timeline.length)
    await tx.insert(timelineEvents).values(bp.story.timeline.map((t, i) => ({ eventId, id: t.id, at: t.at, title: t.title, body: t.body, actors: t.actors, locationId: t.location ?? null, isPublic: t.public, sortOrder: i })));
  await del(evidence, evidence.eventId);
  if (bp.evidence.length) await tx.insert(evidence).values(bp.evidence.map((e) => ({ eventId, id: e.id, title: e.title, kind: e.kind, summary: e.summary, about: e.about, autoGate: e.gate ?? null })));
  await del(hints, hints.eventId);
  const hintRows = bp.nodes.flatMap((n) => n.hints.map((h, idx) => ({ eventId, challengeId: n.id, idx, level: h.level, cost: hintCost(bp, h) })));
  if (hintRows.length) await tx.insert(hints).values(hintRows);
  await del(challengeDependencies, challengeDependencies.eventId);
  const deps = new Map<string, { eventId: string; challengeId: string; dependsOn: string; kind: string; hidden: boolean }>();
  for (const e of a.edges) deps.set(`${e.to}|${e.from}|${e.kind}`, { eventId, challengeId: e.to, dependsOn: e.from, kind: e.kind === "gate" ? "node" : e.kind, hidden: e.hidden });
  for (const n of bp.nodes) {
    const r = gateRefs(n.gate);
    for (const ev of r.evidence) deps.set(`${n.id}|${ev}|evidence-item`, { eventId, challengeId: n.id, dependsOn: ev, kind: "evidence", hidden: false });
    for (const f of r.flags) deps.set(`${n.id}|${f}|flag`, { eventId, challengeId: n.id, dependsOn: f, kind: "flag", hidden: false });
    for (const p of r.phases) deps.set(`${n.id}|${p}|phase`, { eventId, challengeId: n.id, dependsOn: p, kind: "phase", hidden: false });
  }
  if (deps.size) await tx.insert(challengeDependencies).values([...deps.values()]);

  // Challenges: upsert; nodes removed from a running event are hidden (their solves stay in the ledger).
  const ids = bp.nodes.map((n) => n.id);
  for (const [i, n] of bp.nodes.entries()) {
    const an = a.nodes.get(n.id)!;
    const row = {
      eventId,
      id: n.id,
      mode: familyOf(bp, n),
      primitive: n.primitive,
      roundId: n.round,
      actId: bp.rounds.find((r) => r.id === n.round)?.act ?? null,
      category: n.category ?? null,
      title: n.title,
      bodyMd: n.briefing,
      config: { scoring: n.scoring, optional: n.optional, estimatedMinutes: n.estimatedMinutes, position: n.position ?? null, tags: n.tags } as Record<string, unknown>,
      answerType: "text" as const,
      normalize: "loose" as const,
      answerHashes: [],
      difficulty: { ...an.profile, depth: an.dependencyDepth, textOnly: an.textOnly } as Record<string, number>,
      estimatedMinutes: n.estimatedMinutes,
      sortOrder: i,
      hidden: false,
      sourceFile: null,
      updatedAt: new Date(),
    };
    await tx.insert(challenges).values(row).onConflictDoUpdate({ target: [challenges.eventId, challenges.id], set: row });
  }
  const stale = await tx.select({ id: challenges.id }).from(challenges).where(and(eq(challenges.eventId, eventId), ids.length ? not(inArray(challenges.id, ids)) : undefined));
  if (stale.length) {
    const staleIds = stale.map((s) => s.id);
    if (running) await tx.update(challenges).set({ hidden: true }).where(and(eq(challenges.eventId, eventId), inArray(challenges.id, staleIds)));
    else await tx.delete(challenges).where(and(eq(challenges.eventId, eventId), inArray(challenges.id, staleIds)));
  }

  // Checkpoints: upsert, keep token versions (rotations must survive re-publishes).
  for (const [i, cp] of bp.checkpoints.entries()) {
    const row = {
      eventId,
      id: cp.id,
      name: cp.name,
      location: cp.location,
      instructionsMd: cp.instructions,
      points: bp.standaloneCheckpoints ? cp.points : 0,
      requiresApproval: cp.requiresApproval,
      sortOrder: i,
      kind: cp.kind,
      lat: cp.geo?.lat ?? null,
      lon: cp.geo?.lon ?? null,
      radiusM: cp.geo?.radiusM ?? null,
      claimLimit: cp.claimLimit,
      expiresAt: cp.expiresAt ? new Date(cp.expiresAt) : null,
      teamScoped: cp.teamScoped,
    };
    const pinHash = cp.pin ? await hashPassword(cp.pin) : undefined;
    await tx
      .insert(checkpoints)
      .values({ ...row, pinHash: pinHash ?? null })
      .onConflictDoUpdate({ target: [checkpoints.eventId, checkpoints.id], set: { ...row, ...(pinHash ? { pinHash } : {}) } });
  }
  const cpIds = bp.checkpoints.map((c) => c.id);
  await tx.delete(checkpoints).where(and(eq(checkpoints.eventId, eventId), cpIds.length ? not(inArray(checkpoints.id, cpIds)) : undefined));

  for (const p of primitiveCatalog())
    await tx
      .insert(challengeTypes)
      .values({ id: p.id, version: p.version, family: p.family, label: p.label, summary: p.summary })
      .onConflictDoUpdate({ target: challengeTypes.id, set: { version: p.version, family: p.family, label: p.label, summary: p.summary, updatedAt: new Date() } });
}

export async function saveStorySources(tx: Executor, eventId: string, sources: { name: string; markdown: string }[], model: unknown) {
  await tx
    .insert(stories)
    .values({ eventId, sources, model: model as Record<string, unknown>, updatedAt: new Date() })
    .onConflictDoUpdate({ target: stories.eventId, set: { sources, model: model as Record<string, unknown>, updatedAt: new Date() } });
}

/** Publishes a prepared blueprint for an event (creating the event row if needed). */
export async function publishBlueprint(db: Executor, bp: BlueprintT, opts: { kind?: "pack" | "studio"; activate?: boolean; packHash?: string; organizationId?: string | null } = {}) {
  const eventId = bp.event.id;
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(events).where(eq(events.id, eventId)).limit(1);
    const version = (existing?.blueprintVersion ?? 0) + 1;
    const values = {
      name: bp.event.title,
      kind: opts.kind ?? existing?.kind ?? "pack",
      organizationId: opts.organizationId ?? existing?.organizationId ?? null,
      config: publicConfig(bp),
      story: null,
      blueprint: bp as unknown as Record<string, unknown>,
      blueprintVersion: version,
      publishedAt: new Date(),
      startsAt: bp.event.startsAt ? new Date(bp.event.startsAt) : null,
      endsAt: bp.event.endsAt ? new Date(bp.event.endsAt) : null,
      packHash: opts.packHash ?? existing?.packHash ?? null,
      updatedAt: new Date(),
    };
    if (existing) await tx.update(events).set(values).where(eq(events.id, eventId));
    else await tx.insert(events).values({ id: eventId, status: "draft", ...values });
    if (opts.activate) {
      await tx.update(events).set({ active: false }).where(not(eq(events.id, eventId)));
      await tx.update(events).set({ active: true }).where(eq(events.id, eventId));
    }
    await materialize(tx, eventId, bp, Boolean(existing && existing.status !== "draft"));
    return { eventId, version };
  });
  clearWorldCache(eventId);
  return result;
}
