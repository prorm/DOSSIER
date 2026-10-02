import { describe, expect, it } from "vitest";
import { computeScores, dynamicValue, type LogEntry, type NodeScoring, type TeamInfo } from "../../src/server/engine/scoring";
import { backoffDelay, SUBMISSION_BACKOFF } from "../../src/server/security/ratelimit";
import { applyBoardOps, EMPTY_BOARD } from "../../src/lib/board";
import { findCycle } from "../../src/server/packs/load";
import { evaluateGate, explainGate, gateRefs, hardNodeDeps, opensAt, type Gate } from "../../src/server/game/core/gates";
import { emptyState, reduceAll, type StateEvent, type StateEventBody } from "../../src/server/game/core/state";
import { availability } from "../../src/server/game/engine";

const t = (s: number) => new Date(Date.UTC(2026, 9, 10, 10, 0, s));

function stateWith(...bodies: StateEventBody[]) {
  return reduceAll(emptyState("e", "t"), bodies.map((b, i) => ({ ...b, seq: i + 1, at: t(i).toISOString() }) as StateEvent));
}
const solved = (...ids: string[]) => ids.map((id) => ({ type: "node.solved" as const, node: id, points: 1 }));
const now = { now: new Date("2029-12-31T23:59:59Z") };

describe("dynamic scoring", () => {
  it("decays quadratically from initial to minimum and never below", () => {
    expect(dynamicValue(500, 100, 4, 0)).toBe(500);
    expect(dynamicValue(500, 100, 4, 1)).toBe(500);
    expect(dynamicValue(500, 100, 4, 3)).toBe(400); // n=2 -> 500 - 400*(0.25)
    expect(dynamicValue(500, 100, 4, 5)).toBe(100);
    expect(dynamicValue(500, 100, 4, 50)).toBe(100);
  });
});

describe("gates (challenge graph edges)", () => {
  it("all-of requires every parent; any-of requires one; atLeast counts", () => {
    const allOf: Gate = { all: [{ node: "a" }, { node: "b" }] };
    const anyOf: Gate = { any: [{ node: "a" }, { node: "b" }] };
    const two: Gate = { atLeast: 2, of: [{ node: "a" }, { node: "b" }, { node: "c" }] };
    expect(evaluateGate(allOf, stateWith(...solved("a")), now)).toBe(false);
    expect(evaluateGate(allOf, stateWith(...solved("a", "b")), now)).toBe(true);
    expect(evaluateGate(anyOf, stateWith(), now)).toBe(false);
    expect(evaluateGate(anyOf, stateWith(...solved("b")), now)).toBe(true);
    expect(evaluateGate(two, stateWith(...solved("a", "c")), now)).toBe(true);
  });

  it("evidence, flags, score, resources, checkpoints, phase, board links and discoveries", () => {
    const s = stateWith(
      { type: "evidence.gained", id: "ev1", source: "x" },
      { type: "flag.set", key: "met-ada", value: true },
      { type: "flag.set", key: "trust", value: 3 },
      ...solved("a"),
      { type: "resource.delta", resource: "intel", delta: 2, reason: "x" },
      { type: "checkpoint.confirmed", id: "cp" },
      { type: "phase.set", phase: "act-2" },
      { type: "board.evaluated", valid: 3, invalid: 0 },
      { type: "discovery", node: "portal", key: "diag", label: "x" },
    );
    const yes: Gate[] = [{ evidence: "ev1" }, { flag: "met-ada" }, { flag: "trust", gte: 3 }, { score: 1 }, { resource: "intel", gte: 2 }, { checkpoint: "cp" }, { phase: "act-2" }, { links: 3 }, { discovery: "diag", node: "portal" }];
    const no: Gate[] = [{ evidence: "ev2" }, { flag: "trust", gte: 4 }, { score: 2 }, { checkpoint: "other" }, { phase: "act-3" }, { links: 4 }, { discovery: "x", node: "portal" }];
    for (const g of yes) expect(evaluateGate(g, s, now), JSON.stringify(g)).toBe(true);
    for (const g of no) expect(evaluateGate(g, s, now), JSON.stringify(g)).toBe(false);
  });

  it("time gates keep a node scheduled until its instant; hidden gates stay unexplained", () => {
    const n = { id: "g", round: "r", title: "G", primitive: "cryptic", briefing: "", config: {}, gate: { after: "2030-01-01T00:00:00Z" } } as never;
    expect(availability(n, stateWith(), new Date("2029-12-31T23:59:59Z"))).toBe("scheduled");
    expect(availability(n, stateWith(), new Date("2030-01-01T00:00:01Z"))).toBe("open");
    expect(opensAt({ all: [{ node: "x" }, { after: "2030-01-01T00:00:00Z" }] })).toBe("2030-01-01T00:00:00.000Z");
    const lines = explainGate({ all: [{ node: "a" }, { hidden: { evidence: "secret-ev" } }] }, stateWith(), now, () => null);
    expect(lines.map((l) => l.text).join(" ")).not.toContain("secret-ev");
    expect(lines.some((l) => /undisclosed/.test(l.text))).toBe(true);
  });

  it("introspects references and hard dependencies", () => {
    const g: Gate = { all: [{ node: "a" }, { any: [{ node: "b" }, { node: "c" }] }, { evidence: "e" }, { hidden: { node: "d" } }] };
    const r = gateRefs(g);
    expect([...r.nodes].sort()).toEqual(["a", "b", "c", "d"]);
    expect([...r.evidence]).toEqual(["e"]);
    expect([...hardNodeDeps(g)].sort()).toEqual(["a", "d"]);
  });

  it("detects cycles", () => {
    expect(findCycle(new Map([["a", ["b"]], ["b", ["a"]]]))).toEqual(["a", "b", "a"]);
    expect(findCycle(new Map([["a", []], ["b", ["a"]]]))).toBeNull();
  });
});

describe("backoff", () => {
  it("is free for the first attempts, then doubles up to a cap", () => {
    const p = SUBMISSION_BACKOFF;
    expect(backoffDelay(p.freeAttempts - 1, p)).toBe(0);
    expect(backoffDelay(p.freeAttempts, p)).toBe(p.baseDelayMs);
    expect(backoffDelay(p.freeAttempts + 1, p)).toBe(p.baseDelayMs * 2);
    expect(backoffDelay(p.freeAttempts + 3, p)).toBe(p.baseDelayMs * 8);
    expect(backoffDelay(1000, p)).toBe(p.maxDelayMs);
  });
});

describe("computeScores", () => {
  const byId = new Map<string, NodeScoring>([
    ["f1", { family: "ctf", points: 100, firstBloodBonus: 50 }],
    ["f2", { family: "ctf", points: 500, firstBloodBonus: 0, dynamic: { minimum: 100, decay: 4 } }],
    ["h", { family: "cryptic", points: 10, firstBloodBonus: 0 }],
  ]);
  const teams: TeamInfo[] = [
    { id: "A", name: "Alpha", status: "active" },
    { id: "B", name: "Bravo", status: "active" },
    { id: "C", name: "Charlie", status: "active" },
    { id: "D", name: "Delta", status: "disqualified" },
  ];
  let id = 0;
  const e = (teamId: string, type: LogEntry["type"], challengeId: string | null, points: number | null, s: number): LogEntry => ({
    id: ++id,
    teamId,
    type,
    challengeId,
    points,
    createdAt: t(s),
  });

  it("awards first blood to the first eligible solver and applies dynamic decay to all solvers", () => {
    const log = [e("D", "solve", "f1", null, 1), e("B", "solve", "f1", null, 2), e("A", "solve", "f1", null, 3), e("A", "solve", "f2", null, 4), e("B", "solve", "f2", null, 5), e("C", "solve", "f2", null, 6)];
    const r = computeScores(teams, log, byId);
    const s = Object.fromEntries(r.standings.map((x) => [x.teamId, x]));
    // f1: B first blood (D disqualified doesn't count) → 150; A → 100.
    // f2: 3 solves → value 400 for everyone.
    expect(s.B!.score).toBe(150 + 400);
    expect(s.A!.score).toBe(100 + 400);
    expect(s.C!.score).toBe(400);
    expect(r.firstBlood.f1).toBe("B");
    expect(r.solveCounts.f2).toBe(3);
    expect(s.D!.disqualified).toBe(true);
    expect(r.standings.at(-1)!.teamId).toBe("D");
  });

  it("breaks ties by who reached the score first, then shares rank only on exact ties", () => {
    const log = [e("A", "solve", "h", null, 10), e("B", "solve", "h", null, 5), e("C", "adjustment", null, 10, 5)];
    const r = computeScores(teams.slice(0, 3), log, byId);
    expect(r.standings.map((x) => [x.teamId, x.rank])).toEqual([
      ["B", 1],
      ["C", 1],
      ["A", 3],
    ]);
  });

  it("hint costs and adjustments count; entries after the freeze are ignored", () => {
    const log = [e("A", "solve", "h", null, 1), e("A", "hint", "h", -3, 2), e("A", "adjustment", null, 5, 30)];
    expect(computeScores(teams.slice(0, 1), log, byId).standings[0]!.score).toBe(12);
    expect(computeScores(teams.slice(0, 1), log, byId, t(10)).standings[0]!.score).toBe(7);
  });

  it("fixed-point solves and partial credit use their recorded values", () => {
    const log = [e("A", "solve", "h", 0, 1), e("A", "partial", "h", 300, 2), e("A", "partial", "h", -50, 3)];
    const r = computeScores(teams.slice(0, 1), log, byId).standings[0]!;
    expect(r.score).toBe(250);
    expect(r.breakdown.partial).toBe(250);
    expect(r.breakdown.families.cryptic).toBe(0);
  });

  it("solves of removed challenges no longer count", () => {
    const log = [e("A", "solve", "ghost", null, 1)];
    expect(computeScores(teams.slice(0, 1), log, byId).standings[0]!.score).toBe(0);
  });
});

describe("evidence board ops", () => {
  const allowed = new Set(["ev:a", "ev:b", "sus:s1"]);
  it("places, links, pins and ignores references to content the team cannot see", () => {
    let b = applyBoardOps(EMPTY_BOARD, [
      { op: "place", id: "ev:a", x: 10, y: 10 },
      { op: "place", id: "ev:b", x: 50, y: 50 },
      { op: "place", id: "ev:secret", x: 0, y: 0 },
      { op: "link", id: "l1", from: "ev:a", to: "ev:b", label: "same time" },
      { op: "link", id: "l2", from: "ev:b", to: "ev:a", label: "dup" },
      { op: "link", id: "l3", from: "ev:a", to: "ev:secret", label: "" },
      { op: "pin", id: "ev:a", pinned: true },
      { op: "note", id: "note:n1", text: "check alibi", x: 5, y: 5 },
      { op: "annotate", id: "ev:a", text: "private" },
    ], allowed);
    expect(Object.keys(b.nodes)).toEqual(["ev:a", "ev:b"]);
    expect(b.links.map((l) => l.id)).toEqual(["l1"]);
    expect(b.nodes["ev:a"]!.pinned).toBe(true);
    expect(b.notes["note:n1"]!.text).toBe("check alibi");
    expect(b.annotations["ev:a"]).toBe("private");
    b = applyBoardOps(b, [{ op: "remove", id: "ev:b" }], allowed);
    expect(b.links).toHaveLength(0);
  });
});
