import { describe, expect, it } from "vitest";
import { resolveOpening, type CinematicVars } from "../../src/lib/experience/cinematic";
import { derivePipeline, currentStation, type PipelineInput } from "../../src/lib/experience/pipeline";
import { RELATION_KINDS, RELATION_STYLE, boardKind, exhibitStage, plausible, suggestRelations } from "../../src/lib/experience/relations";
import { THEME_IDS } from "../../src/lib/experience/themes";

const vars: CinematicVars = {
  eventName: "CASE 017 — The Last Transmission",
  teamName: "Null Pointers",
  caseNumber: "CASE 017",
  title: "The Last Transmission",
  kicker: "A radio club heard something at 03:14.",
  extraLines: ["uplink relay 3 armed"],
  world: "7F3A-91C2",
  files: 22,
  open: 2,
  solved: 5,
  acts: 7,
  exhibits: 19,
  held: 13,
  fingerprint: "0123456789abcdef",
  intensity: "balanced",
};

describe("cinematic openings are data, not code", () => {
  it.each(THEME_IDS)("%s resolves a first-run script that quotes only real numbers", (id) => {
    const s = resolveOpening(id, "first", vars);
    const log = s.beats.find((b) => b.kind === "log");
    expect(log && log.kind === "log" ? log.lines.length : 0).toBeGreaterThanOrEqual(4);
    const text = JSON.stringify(s.beats);
    expect(text).toContain("22"); // files
    expect(text).toContain("13"); // held exhibits
    expect(text.toLowerCase()).toContain("7f3a-91c2"); // world id
    expect(text.toLowerCase()).toContain("uplink relay 3 armed");
    expect(s.beats.some((b) => b.kind === "cta")).toBe(true);
    expect(s.beats.some((b) => b.kind === "title")).toBe(true);
    expect(s.duration).toBeGreaterThan(4);
    expect(s.shards.held).toBeLessThanOrEqual(s.shards.total);
  });

  it("themes open differently", () => {
    const formations = new Set(THEME_IDS.map((id) => resolveOpening(id, "first", vars).formation));
    const treatments = new Set(THEME_IDS.map((id) => resolveOpening(id, "first", vars).title.treatment));
    expect(formations.size).toBe(THEME_IDS.length);
    expect(treatments.size).toBe(THEME_IDS.length);
  });

  it("always offers a reduced-motion card (no beats) and a short fast path for returning players", () => {
    for (const id of THEME_IDS) {
      const r = resolveOpening(id, "reduced", vars);
      expect(r.beats).toEqual([]);
      expect(r.title.title).toBe("The Last Transmission");
      const back = resolveOpening(id, "returning", vars);
      const first = resolveOpening(id, "first", vars);
      expect(back.duration).toBeLessThan(2);
      expect(back.autoEnter).toBeGreaterThan(0);
      expect(back.duration).toBeLessThan(first.duration / 3);
    }
  });

  it("organiser intensity scales the tempo", () => {
    const calm = resolveOpening("blacksite", "first", { ...vars, intensity: "calm" });
    const show = resolveOpening("blacksite", "first", { ...vars, intensity: "cinematic" });
    expect(calm.duration).toBeLessThan(show.duration);
  });
});

describe("evidence-board relations", () => {
  it("styles every relation the case understands", () => {
    for (const k of RELATION_KINDS) {
      expect(RELATION_STYLE[k].sentence("A", "B")).toContain("A");
      expect(RELATION_STYLE[k].width).toBeGreaterThan(0);
    }
    expect(new Set(RELATION_KINDS.map((k) => `${RELATION_STYLE[k].tone}|${RELATION_STYLE[k].dash}|${RELATION_STYLE[k].arrow}`)).size).toBeGreaterThanOrEqual(8);
  });

  it("judges whether a pairing is sensible – never whether it is true", () => {
    expect(boardKind("ev:radio-log")).toBe("ev");
    expect(boardKind("sus:marsh")).toBe("sus");
    expect(boardKind("note:abc")).toBe("note");
    expect(plausible("implicates", "ev", "sus").ok).toBe(true);
    expect(plausible("implicates", "ev", "loc").ok).toBe(false);
    expect(plausible("places-at", "sus", "loc").ok).toBe(true);
    expect(plausible("sent-to", "loc", "tl").ok).toBe(false);
    expect(plausible("precedes", "tl", "tl").ok).toBe(true);
    expect(plausible("same-as", "ev", "sus").ok).toBe(false);
    expect(plausible("supports", "loc", "ev").ok).toBe(true);
    // A suggestion list never depends on the case content.
    expect(suggestRelations("ev", "sus")).toContain("implicates");
    expect(suggestRelations("tl", "loc")).not.toContain("implicates");
  });

  it("matures evidence with real use", () => {
    expect(exhibitStage({ isNew: true, strings: 5, annotated: true })).toBe("raw");
    expect(exhibitStage({ isNew: false, strings: 0, annotated: false })).toBe("examined");
    expect(exhibitStage({ isNew: false, strings: 1, annotated: false })).toBe("cross-referenced");
    expect(exhibitStage({ isNew: false, strings: 1, annotated: true })).toBe("anchor");
    expect(exhibitStage({ isNew: false, strings: 3, annotated: false })).toBe("anchor");
  });
});

describe("studio pipeline", () => {
  const empty: PipelineInput = { hasStory: false, story: null, blueprint: null, graph: null, presentation: { theme: "blacksite", intensity: "balanced", hasWording: false }, validation: null, published: { version: 0, active: false, at: null }, dirtySincePublish: false };
  const full: PipelineInput = {
    hasStory: true,
    story: { characters: 9, suspects: 3, locations: 6, timeline: 14, organisations: 2, artifacts: 4, sources: 3 },
    blueprint: { nodes: 22, rounds: 7, acts: 7, mechanics: 14, families: 8, evidence: 19, facts: 12, sites: 1, checkpoints: 2, redHerrings: 3 },
    graph: { edges: 27, maxDepth: 9, criticalMinutes: 240, totalMinutes: 400, perTeam: 15, textOnlyRisk: 0.2 },
    presentation: { theme: "cold-case", intensity: "cinematic", hasWording: true },
    validation: { ok: true, errors: 0, warnings: 2, solved: 22, nodes: 22, stale: false, at: "2026-01-01T00:00:00Z" },
    published: { version: 3, active: true, at: "2026-01-01T00:00:00Z" },
    dirtySincePublish: false,
  };

  it("reports empty stations honestly and points at the blocker", () => {
    const st = derivePipeline(empty);
    expect(st.map((s) => s.id)).toEqual(["story", "world", "challenges", "logic", "presentation", "playtest", "publish"]);
    expect(st.every((s) => s.status === "empty")).toBe(true);
    expect(currentStation(st).id).toBe("story");
  });

  it("carries the real numbers of a finished draft", () => {
    const st = derivePipeline(full);
    expect(st[0]!.headline).toContain("9 people");
    expect(st[2]!.headline).toContain("22 files");
    expect(st[3]!.headline).toContain("depth 9");
    expect(st[5]!.status).toBe("warn");
    expect(st[6]!.status).toBe("done");
    expect(st[6]!.headline).toContain("v3");
  });

  it("goes stale when the draft changes after validation, and fails loudly on errors", () => {
    expect(derivePipeline({ ...full, validation: { ...full.validation!, stale: true } })[5]!.status).toBe("pending");
    const bad = derivePipeline({ ...full, validation: { ...full.validation!, ok: false, errors: 3 }, published: { version: 0, active: false, at: null } });
    expect(bad[5]!.status).toBe("fail");
    expect(bad[6]!.status).toBe("empty");
    expect(currentStation(bad).id).toBe("playtest");
  });
});
