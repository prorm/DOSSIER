import { describe, expect, it } from "vitest";
import { dynamicValue, dependenciesMet, huntMode } from "../../src/server/engine/modes";
import { computeScores, type LogEntry, type TeamInfo } from "../../src/server/engine/scoring";
import type { ChallengeRow, EngineContext } from "../../src/server/engine/types";
import { backoffDelay, SUBMISSION_BACKOFF } from "../../src/server/security/ratelimit";
import { applyBoardOps, EMPTY_BOARD, penaltyFor } from "../../src/server/engine/inquest";
import { findCycle } from "../../src/server/packs/load";

function ch(id: string, mode: ChallengeRow["mode"], config: Record<string, unknown>): ChallengeRow {
  return {
    eventId: "e",
    id,
    mode,
    category: null,
    title: id,
    bodyMd: "",
    config,
    answerType: "text",
    normalize: "standard",
    answerHashes: [],
    sortOrder: 0,
    hidden: false,
    sourceFile: null,
    updatedAt: new Date(),
  };
}

const t = (s: number) => new Date(Date.UTC(2026, 9, 10, 10, 0, s));

describe("dynamic scoring", () => {
  it("decays quadratically from initial to minimum and never below", () => {
    expect(dynamicValue(500, 100, 4, 0)).toBe(500);
    expect(dynamicValue(500, 100, 4, 1)).toBe(500);
    expect(dynamicValue(500, 100, 4, 3)).toBe(400); // n=2 → 500 - 400*(0.25)
    expect(dynamicValue(500, 100, 4, 5)).toBe(100);
    expect(dynamicValue(500, 100, 4, 50)).toBe(100);
  });
});

describe("dependency graph", () => {
  const progress = (ids: string[]) => ({ teamId: "t", solvedAt: new Map(ids.map((i) => [i, new Date()])), hints: new Set<string>() });
  it("all-of requires every parent; any-of requires one", () => {
    const allOf = ch("x", "hunt", { requires: { all: ["a", "b"], any: [] } });
    const anyOf = ch("y", "hunt", { requires: { all: [], any: ["a", "b"] } });
    expect(dependenciesMet(allOf, progress(["a"]))).toBe(false);
    expect(dependenciesMet(allOf, progress(["a", "b"]))).toBe(true);
    expect(dependenciesMet(anyOf, progress([]))).toBe(false);
    expect(dependenciesMet(anyOf, progress(["b"]))).toBe(true);
  });

  it("time gates keep a challenge scheduled until its instant", () => {
    const c = ch("g", "hunt", { available_from: "2030-01-01T00:00:00Z" });
    const ctx = { now: new Date("2029-12-31T23:59:59Z") } as EngineContext;
    expect(huntMode.availability(c, ctx, progress([])).state).toBe("scheduled");
    expect(huntMode.availability(c, { ...ctx, now: new Date("2030-01-01T00:00:01Z") }, progress([])).state).toBe("open");
  });

  it("detects cycles", () => {
    expect(findCycle(new Map([["a", ["b"]], ["b", ["a"]]]))).toEqual(["a", "b", "a"]);
    expect(findCycle(new Map([["a", []], ["b", ["a"]]]))).toBeNull();
  });
});

describe("computeScores", () => {
  const f1 = ch("f1", "ctf", { points: 100, first_blood_bonus: 50, scoring: { type: "static" } });
  const f2 = ch("f2", "ctf", { points: 500, scoring: { type: "dynamic", initial: 500, minimum: 100, decay: 4 } });
  const h = ch("h", "hunt", { points: 10 });
  const byId = new Map([f1, f2, h].map((c) => [c.id, c]));
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

  it("solves of removed challenges no longer count", () => {
    const log = [e("A", "solve", "ghost", null, 1)];
    expect(computeScores(teams.slice(0, 1), log, byId).standings[0]!.score).toBe(0);
  });
});

describe("backoff and penalties", () => {
  it("is free for the first attempts, then doubles up to a cap", () => {
    const p = SUBMISSION_BACKOFF;
    expect(backoffDelay(p.freeAttempts - 1, p)).toBe(0);
    expect(backoffDelay(p.freeAttempts, p)).toBe(p.baseDelayMs);
    expect(backoffDelay(p.freeAttempts + 1, p)).toBe(p.baseDelayMs * 2);
    expect(backoffDelay(p.freeAttempts + 3, p)).toBe(p.baseDelayMs * 8);
    expect(backoffDelay(1000, p)).toBe(p.maxDelayMs);
  });

  it("escalating accusation penalties repeat the last value", () => {
    expect([0, 1, 2, 5].map((n) => penaltyFor([10, 20], n))).toEqual([10, 20, 20, 20]);
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
