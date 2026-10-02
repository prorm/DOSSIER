import { describe, expect, it } from "vitest";
import { buildUniverse, flatten, isSuspicious, presentationState, readingOrder, wallPin, type UNodeIn, type UniverseInput } from "../../src/lib/experience/universe";
import { THEME_IDS, THEMES } from "../../src/lib/experience/themes";
import { deriveCaseNumber, teamDressing } from "../../src/lib/experience/variation";

function node(id: string, over: Partial<UNodeIn> = {}): UNodeIn {
  return {
    id,
    title: id,
    state: "locked",
    family: "cryptic",
    actIndex: 0,
    roundIndex: 0,
    indexInRound: 0,
    roundSize: 1,
    points: 100,
    minutes: 10,
    optional: false,
    isNew: false,
    opensAt: null,
    progress: 0,
    signals: { discoveries: 0, contradictions: 0, wrong: 0, hints: 0 },
    ...over,
  };
}

/** 3 acts × 2 rounds × up to 3 files. */
function sample(): UniverseInput {
  const nodes: UNodeIn[] = [];
  let r = 0;
  for (let a = 0; a < 3; a++)
    for (let k = 0; k < 2; k++, r++) {
      const size = 2 + ((a + k) % 2);
      for (let i = 0; i < size; i++) nodes.push(node(`n-${a}-${k}-${i}`, { actIndex: a, roundIndex: r, indexInRound: i, roundSize: size, family: ["cryptic", "browser", "forensics", "ctf", "physical", "final"][(a + k + i) % 6]! }));
    }
  nodes[0]!.state = "solved";
  nodes[1]!.state = "open";
  nodes[1]!.isNew = true;
  nodes[2]!.state = "locked";
  nodes[2]!.progress = 0.5;
  nodes[3]!.state = "scheduled";
  return {
    nodes,
    edges: [
      { from: nodes[0]!.id, to: nodes[1]!.id, kind: "gate" },
      { from: nodes[0]!.id, to: nodes[2]!.id, kind: "gate" },
      { from: nodes[1]!.id, to: "ghost", kind: "gate" },
      { from: nodes[1]!.id, to: nodes[3]!.id, kind: "checkpoint" },
    ],
    acts: [0, 1, 2].map((i) => ({ id: `a${i}`, title: i === 0 ? "Act" : null, started: i === 0, complete: false })),
  };
}

describe("presentation state", () => {
  it("maps real availability to spatial state", () => {
    expect(presentationState({ state: "solved", progress: 1 })).toBe("completed");
    expect(presentationState({ state: "failed", progress: 1 })).toBe("failed");
    expect(presentationState({ state: "open", progress: 1 })).toBe("available");
    expect(presentationState({ state: "scheduled", progress: 0 })).toBe("discovered");
    expect(presentationState({ state: "locked", progress: 0 })).toBe("locked");
    expect(presentationState({ state: "locked", progress: 0.3 })).toBe("discovered");
  });

  it("flags resistance and anomalies as suspicious, never completed or unknown files", () => {
    const quiet = { discoveries: 0, contradictions: 0, wrong: 0, hints: 0 };
    expect(isSuspicious(quiet, "available")).toBe(false);
    expect(isSuspicious({ ...quiet, wrong: 3 }, "available")).toBe(true);
    expect(isSuspicious({ ...quiet, contradictions: 1 }, "discovered")).toBe(true);
    expect(isSuspicious({ ...quiet, discoveries: 2 }, "available")).toBe(true);
    expect(isSuspicious({ ...quiet, wrong: 9 }, "completed")).toBe(false);
    expect(isSuspicious({ ...quiet, wrong: 9 }, "locked")).toBe(false);
  });
});

describe("buildUniverse", () => {
  it.each(THEME_IDS)("lays out every file finitely and deterministically under %s", (id) => {
    const layout = THEMES[id].universe.layout;
    const a = buildUniverse(sample(), { layout, seed: "x", rotation: 0.2 });
    const b = buildUniverse(sample(), { layout, seed: "x", rotation: 0.2 });
    expect(a.nodes.map((n) => n.pos)).toEqual(b.nodes.map((n) => n.pos));
    for (const n of a.nodes) for (const c of n.pos) expect(Number.isFinite(c)).toBe(true);
    expect(a.nodes).toHaveLength(sample().nodes.length);
    // No two files may sit on top of each other.
    for (let i = 0; i < a.nodes.length; i++)
      for (let j = i + 1; j < a.nodes.length; j++) {
        const d = Math.hypot(a.nodes[i]!.pos[0] - a.nodes[j]!.pos[0], a.nodes[i]!.pos[1] - a.nodes[j]!.pos[1], a.nodes[i]!.pos[2] - a.nodes[j]!.pos[2]);
        expect(d, `${id}: ${a.nodes[i]!.id} vs ${a.nodes[j]!.id}`).toBeGreaterThan(1.4);
      }
  });

  it("gives different teams different-looking (but equivalent) maps", () => {
    const a = buildUniverse(sample(), { layout: "strata", seed: "e:1", rotation: teamDressing("aaaaaaaaaaaaaaaa").rotation });
    const b = buildUniverse(sample(), { layout: "strata", seed: "e:1", rotation: teamDressing("bbbbbbbbbbbbbbbb").rotation });
    expect(a.nodes[0]!.pos).not.toEqual(b.nodes[0]!.pos);
    expect(a.nodes.map((n) => n.state)).toEqual(b.nodes.map((n) => n.state));
  });

  it("the four layouts are different spatial forms", () => {
    const flat = (l: "strata" | "organic" | "wall" | "tunnel") => {
      const m = buildUniverse(sample(), { layout: l, seed: "s" });
      return m.bounds.max[2] - m.bounds.min[2];
    };
    // The wall is a plane; the tunnel and strata run deep.
    expect(flat("wall")).toBeLessThan(2);
    expect(flat("tunnel")).toBeGreaterThan(20);
    expect(flat("strata")).toBeGreaterThan(20);
    expect(flat("organic")).toBeGreaterThan(flat("wall"));
  });

  it("pins the wall up as screen-shaped columns under act headers, in story order", () => {
    // Seven acts of very different sizes: the wall must not come out as a ribbon or a tower.
    const sizes = [2, 3, 5, 4, 5, 2, 1];
    const nodes: UNodeIn[] = [];
    sizes.forEach((n, a) => {
      for (let i = 0; i < n; i++) nodes.push(node(`w-${a}-${i}`, { actIndex: a, roundIndex: a, indexInRound: i, roundSize: n }));
    });
    const input: UniverseInput = { nodes, edges: [{ from: "w-0-0", to: "w-1-0", kind: "gate" }], acts: sizes.map((_, i) => ({ id: `a${i}`, title: `Act ${i}`, started: i < 3, complete: false })) };
    const m = buildUniverse(input, { layout: "wall", seed: "w" });
    const w = m.bounds.max[0] - m.bounds.min[0];
    const h = m.bounds.max[1] - m.bounds.min[1];
    expect(w / Math.max(1, h)).toBeGreaterThan(0.9);
    expect(w / Math.max(1, h)).toBeLessThan(3.2);
    for (const act of m.acts) {
      const cards = m.nodes.filter((n) => n.actIndex === act.index);
      // The header hangs above every card of its act, and is as wide as the act's columns.
      for (const c of cards) expect(act.anchor[1]).toBeGreaterThan(c.pos[1] + 1.65 * c.radius);
      expect(act.span).toBeGreaterThan(2);
    }
    for (let i = 1; i < m.acts.length; i++) expect(m.acts[i]!.anchor[0]).toBeGreaterThan(m.acts[i - 1]!.anchor[0]);
    // Strings run pin to pin.
    const e = m.edges[0]!;
    expect(e.a).toEqual(wallPin(m.nodes[e.from]!));
    expect(e.b).toEqual(wallPin(m.nodes[e.to]!));
  });

  it("gives every act a place for its name in every layout", () => {
    for (const id of THEME_IDS) {
      const m = buildUniverse(sample(), { layout: THEMES[id].universe.layout, seed: "x" });
      for (const a of m.acts) for (const c of a.anchor) expect(Number.isFinite(c)).toBe(true);
    }
  });

  it("drops edges to unknown files and marks how far each thread has been pulled", () => {
    const m = buildUniverse(sample(), { layout: "strata" });
    expect(m.edges).toHaveLength(3); // the edge to "ghost" is dropped
    const toOpen = m.edges.find((e) => m.nodes[e.to]!.availability === "open");
    expect(toOpen?.flow).toBe("live"); // finished → open: the thread you can pull now
    const fromOpen = m.edges.find((e) => m.nodes[e.from]!.availability === "open");
    expect(fromOpen?.flow).toBe("dormant"); // open → beyond: known, not yet earned
  });

  it("counts states, anchors the camera on the frontier and orders by usefulness", () => {
    const m = buildUniverse(sample(), { layout: "wall" });
    expect(m.counts.completed).toBe(1);
    expect(m.counts.available).toBe(1);
    expect(m.counts.new).toBe(1);
    expect(m.counts.total).toBe(sample().nodes.length);
    expect(m.focus).toEqual(m.nodes[1]!.pos);
    expect(readingOrder(m)[0]!.id).toBe(m.nodes[1]!.id);
    expect(readingOrder(m).at(-1)!.state).toBe("locked");
  });

  it("keeps classified files anonymous in labels", () => {
    const m = buildUniverse({ nodes: [node("secret", { title: null })], edges: [], acts: [] }, { layout: "organic" });
    expect(m.nodes[0]!.label).toMatch(/^Classified file/);
    expect(m.nodes[0]!.label).not.toMatch(/secret/);
  });

  it("flattens to a 2-D fallback that fits the box", () => {
    const m = buildUniverse(sample(), { layout: "tunnel" });
    const f = flatten(m, 800, 500);
    for (const p of f.nodes) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(800);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(500);
    }
  });
});

describe("procedural variation", () => {
  it("is deterministic per fingerprint and varies between teams", () => {
    const a = teamDressing("0123456789abcdef");
    const b = teamDressing("0123456789abcdef");
    const c = teamDressing("fedcba9876543210");
    expect(a.world).toBe(b.world);
    expect(a.callsign).toBe(b.callsign);
    expect(a.fileCode("radio-log")).toBe(b.fileCode("radio-log"));
    expect(a.exhibitTag("ev-1")).toBe(b.exhibitTag("ev-1"));
    expect(a.world).not.toBe(c.world);
    expect(a.fileCode("radio-log")).not.toBe(c.fileCode("radio-log"));
    expect(a.ambient).toHaveLength(c.ambient.length);
    expect([...a.ambient].sort()).toEqual([...c.ambient].sort());
  });

  it("derives a case number from the event when none is written", () => {
    expect(deriveCaseNumber("case-017")).toBe("CASE 017");
    expect(deriveCaseNumber("case-17", "OPERATION LARK")).toBe("OPERATION LARK");
    expect(deriveCaseNumber("gallery-heist")).toMatch(/^CASE \d{3}$/);
  });
});
