import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Blueprint, type BlueprintT } from "../../src/server/game/core/blueprint";
import { prepareBlueprint } from "../../src/server/game/compile";
import { analyzeBlueprint } from "../../src/server/game/compiler/analysis";
import { propose } from "../../src/server/game/compiler/copilot";
import { hardenNode, hardenRound } from "../../src/server/game/compiler/harder";
import { mapConcepts } from "../../src/server/game/compiler/mapper";
import { planEvent } from "../../src/server/game/compiler/planner";
import { compileStory, type StorySource } from "../../src/server/game/compiler/story";
import { validateBlueprint } from "../../src/server/game/compiler/validate";
import { freshDb } from "../helpers";

const case017: StorySource[] = fs.readdirSync("packs/case-017/story").map((f) => ({ name: f, markdown: fs.readFileSync(path.join("packs/case-017/story", f), "utf8") }));
const gallery: StorySource[] = [{ name: "story.md", markdown: fs.readFileSync("tests/fixtures/stories/gallery-heist.md", "utf8") }];

beforeAll(async () => {
  await freshDb();
});

describe("story compiler", () => {
  it("extracts characters, suspects, locations (with geo), timeline, truth, acts, relationships and concepts", () => {
    const ex = compileStory(case017);
    expect(ex.story.title).toBe("The Last Transmission");
    expect(ex.story.codename).toBe("LODESTAR");
    const names = ex.story.characters.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Dr. Ilse Varga", "Theo Marsh", "Dana Whitlock", "Prof. Anand Rao"]));
    expect(ex.story.characters.filter((c) => c.suspect).map((c) => c.id).sort()).toEqual(["anand-rao", "dana-whitlock", "theo-marsh"]);
    expect(ex.story.locations.find((l) => l.id === "old-observatory")?.geo).toEqual({ lat: 12.9716, lon: 77.5946 });
    expect(ex.story.timeline.map((t) => t.at)).toEqual(["01:10", "02:31", "02:47", "03:14"]);
    expect(ex.story.timeline[2]!.location).toBe("server-room-b-114");
    expect(ex.story.truth).toMatchObject({ culprit: "theo-marsh", location: "server-room-b-114", time: "02:47" });
    expect(ex.acts).toHaveLength(7);
    expect(ex.story.characters.find((c) => c.id === "theo-marsh")!.relationships).toContainEqual({ to: "anand-rao", kind: "works for" });
    expect(ex.concepts.map((c) => c.concept)).toEqual(expect.arrayContaining(["satellite", "radio", "server", "storm", "access"]));
    expect(ex.warnings).toEqual([]);
  });

  it("warns instead of failing on sparse stories", () => {
    const ex = compileStory([{ name: "story.md", markdown: "# A Quiet Night\n\nNothing much happened." }]);
    expect(ex.story.title).toBe("A Quiet Night");
    expect(ex.warnings.join(" ")).toMatch(/culprit/);
  });

  it("maps story concepts onto mechanics with rationale", () => {
    const sugs = mapConcepts(compileStory(case017));
    const prims = sugs.map((s) => `${s.concept}→${s.primitive}`);
    expect(prims).toEqual(expect.arrayContaining(["radio→audio-forensics", "satellite→network-capture", "server→file-forensics", "storm→timeline"]));
    expect(sugs.every((s) => s.rationale.length > 10)).toBe(true);
  });
});

describe("event planner", () => {
  const rounds = ["cryptic", "browser", "forensics", "ctf", "inquest", "physical", "final"] as const;

  for (const [name, src] of [["case-017 story", case017], ["gallery story", gallery]] as const) {
    it(`plans a valid, fully solvable event from the ${name} on every curve, deepening with the curve`, async () => {
      const ex = compileStory(src);
      const depths: number[] = [];
      for (const curve of ["gentle", "standard", "aggressive", "nightmare"] as const) {
        const plan = planEvent(ex, { eventId: "gen-test", title: "Generated", durationMinutes: 300, rounds: [...rounds], curve });
        const { blueprint, plaintext } = prepareBlueprint(plan.blueprint);
        expect(blueprint.nodes.length).toBeGreaterThanOrEqual(20);
        const report = await validateBlueprint(blueprint, { plaintext, samples: 2 });
        expect(report.errors, `${curve}: ${JSON.stringify(report.errors)}`).toEqual([]);
        expect(report.stats.solvedInPlaythrough).toBe(blueprint.nodes.length);
        depths.push(report.stats.maxDepth);
        // Every round family asked for is present, final last.
        expect(blueprint.rounds.map((r) => r.family)).toEqual([...rounds]);
        expect(blueprint.nodes.at(-1)!.primitive).toBe("final-reconstruction");
      }
      expect(depths[3]!).toBeGreaterThan(depths[0]!);
    }, 240_000);
  }

  it("always adds a final round and placeholder suspects when the story lacks them", () => {
    const ex = compileStory([{ name: "story.md", markdown: "# Thin\n\n## Characters\n\n- **Ann Lee** — owner\n" }]);
    const plan = planEvent(ex, { eventId: "thin", title: "Thin", durationMinutes: 120, rounds: ["cryptic"], curve: "standard" });
    const bp = Blueprint.parse(plan.blueprint);
    expect(bp.rounds.at(-1)!.family).toBe("final");
    expect(bp.story.characters.filter((c) => c.suspect).length).toBeGreaterThanOrEqual(2);
    expect(plan.notes.join(" ")).toMatch(/final|suspect/i);
  });
});

describe("make it harder and the copilot", () => {
  let bp: BlueprintT;
  beforeAll(() => {
    const plan = planEvent(compileStory(case017), { eventId: "copilot", title: "Copilot", durationMinutes: 300, rounds: ["cryptic", "browser", "forensics", "ctf", "inquest", "physical", "final"], curve: "standard" });
    bp = prepareBlueprint(plan.blueprint).blueprint;
  });

  it("hardens a node structurally and reports exactly what changed", () => {
    const target = bp.nodes.find((n) => n.primitive === "web-investigation")!;
    const r = hardenNode(bp, target.id);
    expect(r.changes.map((c) => c.kind)).toEqual(expect.arrayContaining(["structure"]));
    expect(r.changes.find((c) => c.kind === "structure")!.summary).toMatch(/channels|decoys|source/i);
    expect(r.scoreAfter).toBeGreaterThanOrEqual(r.scoreBefore);
    expect(r.depthAfter).toBeGreaterThanOrEqual(r.depthBefore);
  });

  it("hardening a whole round keeps the event valid", async () => {
    const forensicsRound = bp.rounds.find((r) => r.family === "forensics")!;
    const r = hardenRound(bp, forensicsRound.id);
    expect(r.changes.length).toBeGreaterThan(0);
    const report = await validateBlueprint(r.blueprint, { samples: 2 });
    expect(report.errors).toEqual([]);
  }, 120_000);

  it("turns 'make round 1 feel like a cybercrime investigation' into a validated structured proposal", async () => {
    const p = propose(bp, "Make Round 1 feel like a cybercrime investigation");
    expect(p.target).toMatchObject({ kind: "round", id: bp.rounds[0]!.id });
    expect(p.removed.length).toBeGreaterThan(0);
    const prims = p.added.map((id) => p.preview.nodes.find((n) => n.id === id)!.primitive);
    expect(prims).toEqual(expect.arrayContaining(["web-investigation", "session-state"]));
    expect(prims.some((x) => x === "network-capture" || x === "git-forensics" || x === "sql-investigation")).toBe(true);
    expect(p.plan.join("\n")).toMatch(/dependency depth = \d+/);
    expect(p.plan.join("\n")).toMatch(/unique per team/);
    // Re-used mechanics never produce two files with the same title.
    const titles = p.preview.nodes.map((n) => n.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    // The original blueprint is untouched; the preview validates.
    expect(bp.nodes.some((n) => p.removed.includes(n.id))).toBe(true);
    const report = await validateBlueprint(Blueprint.parse(p.preview), { samples: 2 });
    expect(report.errors).toEqual([]);
  }, 120_000);

  it("adds falsifiable red herrings and handles unrecognised requests gracefully", async () => {
    const p = propose(bp, "add a red herring to round 5");
    expect(p.preview.redHerrings.length).toBe(bp.redHerrings.length + 1);
    const report = await validateBlueprint(Blueprint.parse(p.preview), { samples: 2 });
    expect(report.errors).toEqual([]);
    expect(propose(bp, "sing me a song").plan[0]).toMatch(/No actionable change/);
  }, 120_000);

  it("analysis exposes the graph for the Studio view", () => {
    const a = analyzeBlueprint(bp);
    expect(a.edges.length).toBeGreaterThan(bp.nodes.length - 3);
    expect(a.criticalPath.length).toBeGreaterThan(3);
    expect(a.edges.some((e) => e.kind === "fact")).toBe(true);
  });
});
