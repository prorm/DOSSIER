import { describe, expect, it } from "vitest";

import { authorUniverse, doorsOpen, type AuthorInput } from "../../src/lib/experience/author";
import type { BuildTrace } from "../../src/lib/experience/pipeline";
import { replayAt, replayPlan, stationsOf } from "../../src/lib/experience/replay";
import { buildUniverse } from "../../src/lib/experience/universe";

const graph: AuthorInput = {
  acts: [
    { id: "a1", title: "Act I" },
    { id: "a2", title: "Act II" },
  ],
  rounds: [
    { id: "r1", act: "a1" },
    { id: "r2", act: "a1" },
    { id: "r3", act: "a2" },
  ],
  nodes: [
    { id: "n3", title: "Late", family: "ctf", round: "r2", depth: 3, points: 300, minutes: 12, optional: false, redHerring: false, perTeam: true, configError: null },
    { id: "n1", title: "First", family: "cryptic", round: "r1", depth: 1, points: 100, minutes: 5, optional: false, redHerring: false, perTeam: false, configError: null },
    { id: "n2", title: "Second", family: "browser", round: "r1", depth: 2, points: 200, minutes: 8, optional: false, redHerring: true, perTeam: true, configError: null },
    { id: "n4", title: "Finale", family: "final", round: "r3", depth: 4, points: 900, minutes: 20, optional: false, redHerring: false, perTeam: true, configError: "bad config" },
  ],
  edges: [
    { from: "n1", to: "n2", kind: "gate" },
    { from: "n2", to: "n3", kind: "evidence" },
    { from: "n3", to: "n4", kind: "gate" },
    { from: "n1", to: "n4", kind: "fact" },
    { from: "n1", to: "n2", kind: "gate" }, // duplicate
    { from: "n1", to: "ghost", kind: "gate" }, // dangling
  ],
};

describe("authorUniverse", () => {
  const a = authorUniverse(graph);

  it("orders files by dependency depth, so revealing the first N replays how the graph unlocks", () => {
    expect(a.order).toEqual(["n1", "n2", "n3", "n4"]);
    expect(a.input.nodes.map((n) => n.id)).toEqual(a.order);
    expect(a.bands).toEqual([
      { depth: 1, upTo: 1 },
      { depth: 2, upTo: 2 },
      { depth: 3, upTo: 3 },
      { depth: 4, upTo: 4 },
    ]);
  });

  it("keeps each file's place in its round and act, whatever the build order", () => {
    const byId = new Map(a.input.nodes.map((n) => [n.id, n]));
    expect(byId.get("n3")!.roundIndex).toBe(1);
    expect(byId.get("n4")!.actIndex).toBe(1);
    expect(byId.get("n1")!.roundSize).toBe(2);
    expect(byId.get("n2")!.indexInRound).toBe(1);
  });

  it("drops duplicate and dangling threads", () => {
    expect(a.input.edges).toHaveLength(4);
  });

  it("marks red herrings and broken configs as anomalies, like a player would see them", () => {
    const m = buildUniverse(a.input, { layout: "strata", seed: "t" });
    const susp = Object.fromEntries(m.nodes.map((n) => [n.id, n.suspicious]));
    expect(susp).toEqual({ n1: false, n2: true, n3: false, n4: true });
  });

  it("lights every file (an author sees the whole machine)", () => {
    const m = buildUniverse(a.input, { layout: "organic", seed: "t" });
    expect(m.counts.available).toBe(4);
    expect(m.counts.locked).toBe(0);
  });

  it("is deterministic", () => {
    expect(authorUniverse(graph).order).toEqual(authorUniverse({ ...graph, nodes: [...graph.nodes].reverse() }).order);
  });
});

const trace = (kind: BuildTrace["kind"], stages: [string, number, "ok" | "warn" | "fail" | "skip"][]): BuildTrace => ({
  kind,
  at: "2026-01-01T00:00:00Z",
  totalMs: stages.reduce((s, x) => s + x[1], 0),
  ok: stages.every((s) => s[2] !== "fail"),
  stages: stages.map(([id, ms, status]) => ({ id, label: id, ms, status, metrics: [] })),
});

describe("doorsOpen", () => {
  it("shows a fresh team's view: entry files open, the next layer in sight, the rest classified", () => {
    const v = doorsOpen(authorUniverse(graph));
    const by = new Map(v.nodes.map((n) => [n.id, n]));
    expect(by.get("n1")).toMatchObject({ state: "open", isNew: true, title: "First" });
    expect(by.get("n2")).toMatchObject({ state: "locked", progress: 0.5, title: "Second" });
    expect(by.get("n3")).toMatchObject({ state: "locked", progress: 0, title: null });
    expect(by.get("n4")!.title).toBeNull();
    // Acts nobody can enter yet are nameless, like the player's own map.
    expect(v.acts.map((a) => [a.started, a.title])).toEqual([
      [true, "Act I"],
      [false, null],
    ]);
    // Author-only signals (red herrings, broken configs) never leak into the preview.
    for (const n of v.nodes) expect(n.signals).toEqual({ discoveries: 0, contradictions: 0, wrong: 0, hints: 0 });
  });
});

describe("replayPlan", () => {
  const gen = trace("generate", [
    ["story", 1, "ok"],
    ["plan", 480, "ok"],
    ["seal", 3, "ok"],
    ["identity", 1, "ok"],
    ["wire", 40, "ok"],
  ]);

  it("plays stages in recorded order, back to back", () => {
    const p = replayPlan(gen, { nodes: 22 });
    expect(p.steps.map((s) => s.stage.id)).toEqual(["story", "plan", "seal", "identity", "wire"]);
    for (let i = 1; i < p.steps.length; i++) expect(p.steps[i]!.start).toBeCloseTo(p.steps[i - 1]!.end, 6);
    expect(p.total).toBeCloseTo(p.steps.at(-1)!.end, 6);
  });

  it("opens the file-reveal window inside the stage that created the files, and reveals exactly that many", () => {
    const p = replayPlan(gen, { nodes: 22 });
    const plan = p.steps.find((s) => s.stage.id === "plan")!;
    expect(p.reveal!.start).toBeGreaterThanOrEqual(plan.start);
    expect(p.reveal!.end).toBeLessThanOrEqual(plan.end);
    expect(replayAt(p, 0).count).toBe(0);
    expect(replayAt(p, p.total).count).toBe(22);
    // monotone
    let last = 0;
    for (let t = 0; t <= p.total; t += 0.05) {
      const c = replayAt(p, t).count;
      expect(c).toBeGreaterThanOrEqual(last);
      last = c;
    }
  });

  it("holds slow stages longer than fast ones, but never absurdly", () => {
    const p = replayPlan(trace("validate", [["structure", 4, "ok"], ["playthrough", 2400, "ok"]]));
    const [fast, slow] = p.steps.map((s) => s.end - s.start) as [number, number];
    expect(slow).toBeGreaterThan(fast);
    expect(slow).toBeLessThanOrEqual(2.2);
    expect(fast).toBeGreaterThanOrEqual(0.42);
  });

  it("flashes past stages that never ran", () => {
    const p = replayPlan(trace("validate", [["structure", 5, "fail"], ["instances", 0, "skip"]]));
    expect(p.steps[1]!.end - p.steps[1]!.start).toBeLessThan(0.3);
  });

  it("collapses to the end state for reduced motion", () => {
    const p = replayPlan(gen, { nodes: 22, speed: 0 });
    expect(p.total).toBe(0);
    expect(replayAt(p, 0)).toEqual({ running: -1, done: 5, count: 22 });
  });

  it("maps recorded stages to production-line stations", () => {
    expect(stationsOf("generate", "plan")).toEqual(["world", "challenges"]);
    expect(stationsOf("generate", "wire")).toEqual(["logic"]);
    expect(stationsOf("validate", "leakage")).toEqual(["playtest"]);
    expect(stationsOf("publish", "validate")).toEqual(["playtest"]);
    expect(stationsOf("publish", "materialise")).toEqual(["publish"]);
  });
});
