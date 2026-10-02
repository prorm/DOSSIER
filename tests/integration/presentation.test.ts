import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { DB } from "../../src/server/db/client";
import type { EventRow } from "../../src/server/engine/types";
import { controlRoom } from "../../src/server/game/control-room";
import { Blueprint, Presentation } from "../../src/server/game/core/blueprint";
import { dispatch, requireCompiled, teamOverview, worldFor } from "../../src/server/game/engine";
import { loadState } from "../../src/server/game/journal";
import { arenaUniverse, cinematicContext, presentationFingerprint, teaserUniverse, universeView } from "../../src/server/game/presentation";
import { opsUniverse } from "../../src/lib/experience/ops";
import { buildUniverse } from "../../src/lib/experience/universe";
import { freshDb, importFixture, makeTeam, startEvent } from "../helpers";

let db: DB;
let event: EventRow;

beforeAll(async () => {
  ({ db } = await freshDb());
  event = await importFixture(db, "case-017", path.resolve("packs"));
  event = await startEvent(db, event);
}, 180_000);

/** Everything a player's browser could learn from the universe projection, as one searchable string. */
const wire = (v: unknown) => JSON.stringify(v);

describe("the player's universe is a projection, not a leak", () => {
  it("a fresh team sees the files it may see, and only the shape of the rest", async () => {
    const t = await makeTeam(db, event);
    const u = await universeView(db, event, t.id);
    const c = requireCompiled(event);
    expect(u.nodes).toHaveLength(c.bp.nodes.length);
    const open = u.nodes.filter((n) => n.state === "open");
    expect(open.length).toBeGreaterThan(0);
    for (const n of u.nodes) {
      if (n.state === "locked") {
        // A classified file has no name, and its requirements are only what the team is entitled to know.
        expect(n.title).toBeNull();
      } else {
        expect(typeof n.title).toBe("string");
      }
    }
    // A title the team cannot see must not appear anywhere in the payload. (Requirement lines are the engine's own
    // "what it takes" text for that file — a checkpoint may share a name with a file, so they are checked separately.)
    const hidden = c.bp.nodes.filter((n) => u.nodes.find((x) => x.id === n.id)?.state === "locked").map((n) => n.title);
    expect(hidden.length).toBeGreaterThan(0);
    const payload = wire({ ...u, nodes: u.nodes.map((n) => ({ ...n, requirements: [] })) });
    for (const title of hidden) expect(payload).not.toContain(title);
    for (const n of u.nodes.filter((x) => x.state === "locked")) for (const r of n.requirements ?? []) for (const h of hidden) expect(r.text).not.toContain(`Solve ${h}`);
  });

  it("never draws fact-flow edges, and draws a gate only from a file the team already knows", async () => {
    const t = await makeTeam(db, event);
    const u = await universeView(db, event, t.id);
    expect(u.edges.every((e) => e.kind === "gate" || e.kind === "checkpoint")).toBe(true);
    const known = new Set(u.nodes.filter((n) => n.state === "open" || n.state === "solved" || n.state === "failed").map((n) => n.id));
    for (const e of u.edges) expect(known.has(e.from)).toBe(true);
  });

  it("carries no answer material, secrets or per-team facts", async () => {
    const t = await makeTeam(db, event);
    const world = await worldFor(event, requireCompiled(event), t.id);
    const u = await universeView(db, event, t.id);
    const payload = wire(u);
    for (const [, ni] of world.nodes) for (const guarded of ni.instance.guarded) if (guarded.length >= 5) expect(payload).not.toContain(guarded);
    expect(payload).not.toMatch(/ANSWER_SECRET|hashes|passwordHash|sessionToken/i);
  });

  it("the fingerprint is cosmetic, stable and unique per team", async () => {
    const a = await makeTeam(db, event);
    const b = await makeTeam(db, event);
    const fa = presentationFingerprint(event.id, a.id);
    expect(fa).toMatch(/^[0-9a-f]{16}$/);
    expect(presentationFingerprint(event.id, a.id)).toBe(fa);
    expect(presentationFingerprint(event.id, b.id)).not.toBe(fa);
    // It is not derived from anything that could seed an answer.
    expect(fa).not.toContain(a.id.slice(0, 8));
  });

  it("two teams get different worlds to look at but the same game", async () => {
    const a = await makeTeam(db, event);
    const b = await makeTeam(db, event);
    const ua = await universeView(db, event, a.id);
    const ub = await universeView(db, event, b.id);
    expect(ua.fingerprint).not.toBe(ub.fingerprint);
    expect(ua.nodes.map((n) => [n.id, n.state, n.points])).toEqual(ub.nodes.map((n) => [n.id, n.state, n.points]));
    const layoutA = buildUniverse(ua, { layout: "strata", seed: ua.layoutSeed, rotation: 0.4 });
    const layoutB = buildUniverse(ub, { layout: "strata", seed: ub.layoutSeed, rotation: 2.1 });
    expect(layoutA.nodes.map((n) => n.pos)).not.toEqual(layoutB.nodes.map((n) => n.pos));
  });

  it("a solve changes the world the team sees, and only by what the engine decided", async () => {
    const t = await makeTeam(db, event);
    const c = requireCompiled(event);
    const world = await worldFor(event, c, t.id);
    const o = await teamOverview(db, event, t.id);
    const first = o.acts.flatMap((x) => x.rounds.flatMap((r) => r.nodes)).find((n) => n.state === "open")!;
    const before = await universeView(db, event, t.id);
    const ni = world.nodes.get(first.id)!;
    let solved = false;
    for (const action of ni.primitive.intendedSolution(ni.instance, await loadState(db, event.id, t.id))) {
      const r = await dispatch(db, { event, teamId: t.id, nodeId: first.id, action });
      if (r.solved) {
        solved = true;
        break;
      }
    }
    expect(solved).toBe(true);
    const after = await universeView(db, event, t.id);
    expect(after.counts.solved).toBe(before.counts.solved + 1);
    expect(after.nodes.find((n) => n.id === first.id)!.state).toBe("solved");
  });

  it("the opening quotes real numbers", async () => {
    const t = await makeTeam(db, event);
    const u = await universeView(db, event, t.id);
    const ctx = await cinematicContext(db, event, t.id, "Some Team", u);
    expect(ctx.counts.total).toBe(requireCompiled(event).bp.nodes.length);
    expect(ctx.evidence).toHaveLength(requireCompiled(event).bp.evidence.length);
    expect(ctx.world).toBe(u.fingerprint);
    expect(ctx.caseNumber).toMatch(/^CASE /);
  });
});

describe("the front door shows a shape and nothing else", () => {
  it("has no titles, points, minutes or gates", () => {
    const t = teaserUniverse(event)!;
    const c = requireCompiled(event);
    expect(t.counts.files).toBe(c.bp.nodes.length);
    expect(t.input.edges).toHaveLength(0);
    for (const n of t.input.nodes) {
      expect(n.title).toBeNull();
      expect(n.points).toBe(0);
      expect(n.minutes).toBe(0);
    }
    const payload = wire(t);
    for (const n of c.bp.nodes) expect(payload).not.toContain(n.title);
    for (const a of c.bp.acts) expect(payload).not.toContain(a.title);
  });

  it("is the same for everyone", () => {
    expect(wire(teaserUniverse(event))).toBe(wire(teaserUniverse(event)));
  });
});

describe("the arena on the projector", () => {
  it("opens as teams solve, and gives away neither titles nor where anyone is", async () => {
    const before = (await arenaUniverse(db, event))!;
    const c = requireCompiled(event);
    expect(before.input.nodes.every((n) => n.title === null)).toBe(true);
    expect(before.input.edges).toHaveLength(0);

    const t = await makeTeam(db, event);
    const world = await worldFor(event, c, t.id);
    const o = await teamOverview(db, event, t.id);
    const first = o.acts.flatMap((x) => x.rounds.flatMap((r) => r.nodes)).find((n) => n.state === "open")!;
    const ni = world.nodes.get(first.id)!;
    for (const action of ni.primitive.intendedSolution(ni.instance, await loadState(db, event.id, t.id))) {
      if ((await dispatch(db, { event, teamId: t.id, nodeId: first.id, action })).solved) break;
    }
    const after = (await arenaUniverse(db, event))!;
    expect(after.solved).toBeGreaterThanOrEqual(before.solved);
    const lit = after.input.nodes.find((n) => n.id === first.id)!;
    expect(lit.state).toBe("solved");
    expect(Number(lit.meta?.solvedBy)).toBeGreaterThanOrEqual(1);
    const payload = wire(after);
    for (const n of c.bp.nodes) expect(payload).not.toContain(n.title);
    expect(payload).not.toContain(t.id);
    expect(payload).not.toContain(t.name);
  });
});

describe("the operations view", () => {
  it("describes the same case the engine runs, and its universe lights where teams are", async () => {
    const t = await makeTeam(db, event);
    const cr = (await controlRoom(db, event))!;
    const c = requireCompiled(event);
    expect(cr.graph.nodes.map((n) => n.id).sort()).toEqual(c.bp.nodes.map((n) => n.id).sort());
    expect(cr.graph.edges.every((e) => e.kind === "gate" || e.kind === "checkpoint")).toBe(true);
    expect(cr.pulse).toHaveLength(12);
    expect(cr.pulse.every((b) => b.attempts >= 0 && b.correct <= b.attempts)).toBe(true);
    expect(cr.startedAt).toBeTruthy();

    const input = opsUniverse(cr.graph, cr.nodes, cr.totalTeams);
    const reached = cr.nodes.filter((n) => n.unlocked > 0).map((n) => n.id);
    expect(reached.length).toBeGreaterThan(0);
    for (const n of input.nodes) expect(n.state === "locked").toBe(!reached.includes(n.id));
    void t;
  });

  it("a wrong answer shows up in the hour's pulse", async () => {
    const t = await makeTeam(db, event);
    const o = await teamOverview(db, event, t.id);
    const first = o.acts.flatMap((x) => x.rounds.flatMap((r) => r.nodes)).find((n) => n.state === "open")!;
    const before = (await controlRoom(db, event))!;
    await dispatch(db, { event, teamId: t.id, nodeId: first.id, action: { type: "answer", value: "definitely not the answer" } });
    const after = (await controlRoom(db, event))!;
    const sum = (r: typeof before) => r.pulse.reduce((s, b) => s + b.attempts, 0);
    expect(sum(after)).toBe(sum(before) + 1);
  });
});

describe("the blueprint's presentation block", () => {
  it("defaults for every blueprint that predates it", () => {
    expect(Presentation.parse(undefined)).toEqual({ theme: "blacksite", intensity: "balanced", cinematic: { caseNumber: "", kicker: "", lines: [] } });
    const c = requireCompiled(event);
    expect(Blueprint.parse(c.bp).event.presentation.theme).toMatch(/blacksite|neural-archive|cold-case|signal/);
  });

  it("accepts the four themes and refuses anything else", () => {
    for (const theme of ["blacksite", "neural-archive", "cold-case", "signal"]) expect(Presentation.safeParse({ theme }).success).toBe(true);
    expect(Presentation.safeParse({ theme: "rainbow" }).success).toBe(false);
    expect(Presentation.safeParse({ intensity: "deafening" }).success).toBe(false);
  });

  it("bounds the wording an organiser can put on the opening", () => {
    expect(Presentation.safeParse({ cinematic: { lines: Array.from({ length: 9 }, () => "x") } }).success).toBe(false);
    expect(Presentation.safeParse({ cinematic: { kicker: "k".repeat(121) } }).success).toBe(false);
    expect(Presentation.safeParse({ cinematic: { lines: ["x".repeat(91)] } }).success).toBe(false);
    expect(Presentation.safeParse({ cinematic: { lines: ["ok", "also ok"], kicker: "A gallery went dark." } }).success).toBe(true);
  });

  it("rejects unknown keys: a typo must not silently become a missing feature", () => {
    expect(Presentation.safeParse({ theme: "signal", colour: "red" }).success).toBe(false);
  });
});
