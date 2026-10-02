import { describe, expect, it } from "vitest";

import { activityText, attention, clockParts, eventClock, opsUniverse, type OpsGraphIn } from "../../src/lib/experience/ops";
import { buildUniverse } from "../../src/lib/experience/universe";

const graph: OpsGraphIn = {
  acts: [{ id: "a1", title: "Act I" }],
  nodes: [
    { id: "a", title: "Alpha", family: "cryptic", actIndex: 0, roundIndex: 0, indexInRound: 0, roundSize: 3, points: 100, minutes: 5, optional: false, critical: true },
    { id: "b", title: "Bravo", family: "browser", actIndex: 0, roundIndex: 0, indexInRound: 1, roundSize: 3, points: 200, minutes: 8, optional: false, critical: true },
    { id: "c", title: "Charlie", family: "ctf", actIndex: 0, roundIndex: 0, indexInRound: 2, roundSize: 3, points: 300, minutes: 12, optional: true, critical: false },
  ],
  edges: [
    { from: "a", to: "b", kind: "gate" },
    { from: "b", to: "c", kind: "checkpoint" },
    { from: "b", to: "ghost", kind: "gate" },
  ],
};

describe("opsUniverse", () => {
  const telemetry = [
    { id: "a", unlocked: 4, solved: 4, stuck: 0, wrong: 2, attempts: 9 },
    { id: "b", unlocked: 3, solved: 1, stuck: 2, wrong: 7, attempts: 14 },
    { id: "c", unlocked: 0, solved: 0, stuck: 0, wrong: 0, attempts: 0 },
  ];
  const input = opsUniverse(graph, telemetry, 4);
  const model = buildUniverse(input, { layout: "strata", seed: "t" });
  const byId = Object.fromEntries(model.nodes.map((n) => [n.id, n]));

  it("settles a file everyone has finished, lights one teams are working on, and dims one nobody has reached", () => {
    expect(byId.a!.state).toBe("completed");
    expect(byId.b!.state).toBe("available");
    expect(byId.c!.state).toBe("discovered");
  });

  it("never hides a file from the operator", () => {
    expect(model.counts.locked).toBe(0);
    expect(model.nodes.every((n) => n.title)).toBe(true);
  });

  it("flags files where teams are stuck as anomalies", () => {
    expect(byId.b!.suspicious).toBe(true);
    expect(byId.a!.suspicious).toBe(false);
  });

  it("carries the raw counts for the heat shader and the inspector", () => {
    expect(byId.b!.meta).toMatchObject({ reached: 3, solved: 1, stuck: 2, total: 4 });
  });

  it("drops threads to files that do not exist", () => {
    expect(input.edges).toHaveLength(2);
  });

  it("with no teams yet, nothing counts as finished", () => {
    const empty = buildUniverse(opsUniverse(graph, [], 0), { layout: "strata", seed: "t" });
    expect(empty.counts.completed).toBe(0);
    expect(empty.counts.discovered).toBe(3);
  });
});

describe("attention", () => {
  const list = attention({
    warnings: [
      { severity: "info", node: "a", message: "80% needed a hint" },
      { severity: "critical", node: "b", message: "60% stuck on Bravo" },
    ],
    teams: [
      { teamId: "t1", name: "Byte Club", stuck: true, current: { id: "b", title: "Bravo", minutes: 41 } },
      { teamId: "t2", name: "Null Pointers", stuck: false, current: null },
    ],
    checkpoints: [
      { id: "cp1", name: "North Gate", pending: 6 },
      { id: "cp2", name: "Lab", pending: 0 },
    ],
  });

  it("puts the most urgent thing first", () => {
    expect(list[0]!.severity).toBe("critical");
    expect(list.at(-1)!.severity).toBe("info");
  });

  it("names stuck teams with the file and the time, and only stuck teams", () => {
    const t = list.filter((i) => i.kind === "team");
    expect(t).toHaveLength(1);
    expect(t[0]!.detail).toContain("41 min");
    expect(t[0]!.node).toBe("b");
  });

  it("raises a desk only while scans are waiting", () => {
    expect(list.filter((i) => i.kind === "desk").map((i) => i.title)).toEqual(["North Gate"]);
  });

  it("heads a file warning with the file it is about", () => {
    const l = attention({ warnings: [{ severity: "critical", node: "b", message: "60% stuck" }], titles: { b: "Bravo" }, teams: [], checkpoints: [] });
    expect(l[0]!.title).toBe("Bravo");
  });

  it("folds a crowd of stuck teams into one line", () => {
    const teams = Array.from({ length: 7 }, (_, i) => ({ teamId: `t${i}`, name: `Team ${i}`, stuck: true, current: { id: "b", title: "Bravo", minutes: 40 + i } }));
    const l = attention({ warnings: [], teams, checkpoints: [] }).filter((i) => i.kind === "team");
    expect(l).toHaveLength(1);
    expect(l[0]!.title).toBe("7 teams stuck");
    expect(l[0]!.detail).toContain("and 4 more");
  });

  it("respects the limit", () => {
    expect(attention({ warnings: Array.from({ length: 9 }, (_, i) => ({ severity: "warning" as const, message: `w${i}` })), teams: [], checkpoints: [] }, 4)).toHaveLength(4);
  });
});

describe("clock and activity text", () => {
  it("formats clock parts", () => {
    expect(clockParts(3_725_000)).toBe("01:02:05");
    expect(clockParts(-5)).toBe("00:00:00");
  });

  it("derives elapsed, remaining and fraction from the schedule", () => {
    const c = eventClock("2026-01-01T10:00:00Z", "2026-01-01T15:00:00Z", Date.parse("2026-01-01T12:30:00Z"));
    expect(c).toEqual({ elapsed: "02:30:00", remaining: "02:30:00", fraction: 0.5 });
    expect(eventClock(null, null, Date.now())).toEqual({ elapsed: null, remaining: null, fraction: null });
  });

  it("describes live signals in the operator's words", () => {
    const title = (id: string) => `T-${id}`;
    expect(activityText({ node: "x", solved: true }, title)).toBe("solved “T-x”");
    expect(activityText({ node: "x", correct: true }, title)).toBe("made progress on “T-x”");
    expect(activityText({ node: "x", correct: false }, title)).toBe("missed on “T-x”");
    expect(activityText({ node: "x", hint: true }, title)).toBe("asked for a hint on “T-x”");
    expect(activityText({ node: "x" }, title)).toBe("worked on “T-x”");
  });
});
