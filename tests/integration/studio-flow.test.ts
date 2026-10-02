import fs from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as actionRoute from "../../src/app/api/play/action/route";
import * as studioRoute from "../../src/app/api/studio/route";
import * as studioEventRoute from "../../src/app/api/studio/[id]/route";
import type { DB } from "../../src/server/db/client";
import { events, rateLimits, teams } from "../../src/server/db/schema";
import { getLeaderboard } from "../../src/server/engine/leaderboard";
import { requireCompiled, teamOverview, worldFor } from "../../src/server/game/engine";
import { loadState } from "../../src/server/game/journal";
import { presentationOf } from "../../src/server/views";
import { closeAllSandboxes } from "../../src/server/game/sql-sandbox";
import { call, freshDb, makeTeam, reloadEvent, staffHeaders, teamHeaders } from "../helpers";

let db: DB;
let admin: Record<string, string>;
let id: string;

const story = fs.readFileSync("tests/fixtures/stories/gallery-heist.md", "utf8");
const studio = (body: Record<string, unknown>, headers = admin) => call(studioEventRoute.POST as never, { url: `/api/studio/${id}`, headers, body, params: { id } });

beforeAll(async () => {
  ({ db } = await freshDb());
  admin = await staffHeaders(db, "admin");
}, 120_000);

describe("DOSSIER Studio — organiser flow through the HTTP API", () => {
  it("rejects non-admin staff", async () => {
    const vol = await staffHeaders(db, "volunteer");
    const r = await call(studioRoute.POST as never, { url: "/api/studio", headers: vol, body: { title: "Nope" } });
    expect(r.status).toBe(403);
  });

  it("creates an event, imports a Markdown story and exposes the extracted world for editing", async () => {
    const created = await call(studioRoute.POST as never, { url: "/api/studio", headers: admin, body: { title: "CASE 018 — The Midnight Gallery", university: "Test University", durationMinutes: 240, teamMin: 1, teamMax: 4 } });
    expect(created.status).toBe(200);
    id = created.json.id;
    const list = await call(studioRoute.GET as never, { url: "/api/studio", headers: admin });
    expect(list.json.events.map((e: { id: string }) => e.id)).toContain(id);

    const r = await studio({ op: "story-import", sources: [{ name: "story.md", markdown: story }] });
    expect(r.status).toBe(200);
    expect(r.json.draft.story.characters.length).toBeGreaterThanOrEqual(3);
    expect(r.json.draft.suggestions.length).toBeGreaterThan(0);

    // Organiser edits the extracted story (rename a character) and it sticks.
    const edited = { ...r.json.draft.story, characters: r.json.draft.story.characters.map((c: { name: string }, i: number) => (i === 0 ? { ...c, name: "Edited Name" } : c)) };
    const saved = await studio({ op: "story-save", story: edited });
    expect(saved.json.draft.story.characters[0].name).toBe("Edited Name");
  });

  it("plans rounds, generates a graph with depth, and shows it in the Studio view", async () => {
    const plan = await studio({ op: "plan", plan: { rounds: ["cryptic", "browser", "forensics", "ctf", "inquest", "final"], curve: "aggressive" } });
    expect(plan.status).toBe(200);
    const r = await studio({ op: "generate" });
    expect(r.status, JSON.stringify(r.json?.error)).toBe(200);
    const g = r.json.graph;
    expect(g.nodes.length).toBeGreaterThanOrEqual(18);
    expect(g.maxDepth).toBeGreaterThanOrEqual(5);
    expect(g.edges.length).toBeGreaterThan(g.nodes.length - 3);
    expect(g.nodes.every((n: { profile: Record<string, number> }) => Object.keys(n.profile).length >= 9)).toBe(true);
    expect(r.json.draft.blueprint.rounds.map((x: { family: string }) => x.family)).toEqual(["cryptic", "browser", "forensics", "ctf", "inquest", "final"]);

    // The build is recorded as a receipt of measured stages carrying the real numbers it produced.
    const trace = r.json.trace.generate as { ok: boolean; totalMs: number; stages: { id: string; ms: number; status: string; metrics: { label: string; value: string | number }[] }[] };
    expect(trace.ok).toBe(true);
    expect(trace.stages.map((x) => x.id)).toEqual(["story", "plan", "seal", "identity", "wire"]);
    expect(trace.stages.every((x) => x.ms >= 0 && x.status === "ok")).toBe(true);
    const metric = (stage: string, label: string) => trace.stages.find((x) => x.id === stage)!.metrics.find((m) => m.label === label)!.value;
    expect(metric("plan", "files")).toBe(g.nodes.length);
    expect(metric("wire", "max depth")).toBe(g.maxDepth);
    expect(metric("story", "people")).toBe(r.json.draft.story.characters.length);
    expect(trace.totalMs).toBeGreaterThanOrEqual(Math.max(...trace.stages.map((x) => x.ms)) - 1);

    // The production line reads the same draft: seven stations, real headlines.
    const line = r.json.pipeline as { id: string; status: string; headline: string }[];
    expect(line.map((x) => x.id)).toEqual(["story", "world", "challenges", "logic", "presentation", "playtest", "publish"]);
    expect(line.find((x) => x.id === "challenges")!.headline).toContain(String(g.nodes.length));
    expect(line.find((x) => x.id === "playtest")!.status).toBe("pending");
    expect(line.find((x) => x.id === "publish")!.status).toBe("empty");
  }, 180_000);

  it("MAKE IT HARDER returns a structural diff and the copilot proposes before applying", async () => {
    const before = (await call(studioEventRoute.GET as never, { url: `/api/studio/${id}`, headers: admin, params: { id } })).json;
    const target = before.draft.blueprint.nodes.find((n: { primitive: string }) => n.primitive === "web-investigation" || n.primitive === "image-forensics");
    const h = await studio({ op: "harden", node: target.id });
    expect(h.status, JSON.stringify(h.json?.error)).toBe(200);
    expect(h.json.harden.changes.length).toBeGreaterThan(0);
    expect(h.json.harden.scoreAfter).toBeGreaterThanOrEqual(h.json.harden.scoreBefore);

    const p = await studio({ op: "copilot", prompt: "Add a red herring to round 2" });
    expect(p.status).toBe(200);
    expect(p.json.draft.proposal.plan.length).toBeGreaterThan(0);
    const herrings = p.json.draft.blueprint.redHerrings.length;
    // Nothing changes until accepted.
    expect(p.json.draft.proposal.after.redHerrings).toBe(herrings + 1);
    const a = await studio({ op: "copilot-apply", accept: true });
    expect(a.json.draft.blueprint.redHerrings.length).toBe(herrings + 1);
    expect(a.json.draft.proposal).toBeNull();
  }, 180_000);

  it("validates, publishes, and lets the organiser PLAY AS TEAM on the unactivated draft", async () => {
    const v = await studio({ op: "validate" });
    expect(v.status).toBe(200);
    expect(v.json.draft.lastValidation.errors, JSON.stringify(v.json.draft.lastValidation.errors)).toEqual([]);
    expect(v.json.draft.lastValidation.quality.length).toBe(v.json.graph.nodes.length);
    // Validation is also a trace: one measured stage per phase, each with its own verdict.
    const vt = v.json.trace.validate as { ok: boolean; stages: { id: string; status: string; ms: number }[] };
    expect(vt.stages.map((x) => x.id)).toEqual(["structure", "instances", "playthrough", "leakage", "solvers", "rules"]);
    expect(vt.stages.some((x) => x.status === "fail")).toBe(false);
    expect(vt.stages.find((x) => x.id === "playthrough")!.ms).toBeGreaterThan(0);
    expect((v.json.pipeline as { id: string; status: string }[]).find((x) => x.id === "playtest")!.status).toMatch(/ready|warn/);

    const pub = await studio({ op: "publish", activate: false });
    expect(pub.status, JSON.stringify(pub.json?.error)).toBe(200);
    expect(pub.json.version).toBe(1);
    expect(pub.json.event.version).toBe(1);

    const pt = await studio({ op: "playtest", reset: false });
    expect(pt.status).toBe(200);
    expect(pt.json.redirect).toBe("/play");
    expect(pt.headers.get("set-cookie")).toMatch(/team/);
    const teamId = pt.json.team.id as string;
    const [row] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(row!.kind).toBe("playtest");

    // The playtest team plays the first open file with its intended solution through the player API.
    const event = await reloadEvent(db, id);
    const h = await teamHeaders(db, teamId);
    const o = await teamOverview(db, event, teamId);
    const first = o.acts.flatMap((x) => x.rounds.flatMap((r) => r.nodes)).find((n) => n.state === "open")!;
    const world = await worldFor(event, requireCompiled(event), teamId);
    const ni = world.nodes.get(first.id)!;
    let solved = false;
    await db.delete(rateLimits);
    for (const action of ni.primitive.intendedSolution(ni.instance, await loadState(db, id, teamId))) {
      const r = await call(actionRoute.POST as never, { url: "/api/play/action", headers: h, body: { nodeId: first.id, action } });
      expect(r.status, JSON.stringify(r.json)).toBe(200);
      if (r.json.solved) {
        solved = true;
        break;
      }
    }
    expect(solved).toBe(true);
    // Playtest teams never appear on boards.
    const lb = await getLeaderboard(db, id, "live");
    expect(lb.standings.find((s) => s.teamId === teamId)).toBeUndefined();
  }, 180_000);

  it("presentation is cosmetic: it re-dresses the published event without invalidating validation", async () => {
    const before = (await call(studioEventRoute.GET as never, { url: `/api/studio/${id}`, headers: admin, params: { id } })).json;
    expect(before.pipeline.find((x: { id: string }) => x.id === "publish").status).toBe("done");

    const r = await studio({ op: "presentation", presentation: { theme: "cold-case", intensity: "cinematic", cinematic: { caseNumber: "CASE 018", kicker: "A gallery went dark at midnight.", lines: ["Keep the lights off."] } } });
    expect(r.status, JSON.stringify(r.json?.error)).toBe(200);
    expect(r.json.draft.presentation.theme).toBe("cold-case");
    expect(r.json.draft.blueprint.event.presentation.cinematic.kicker).toBe("A gallery went dark at midnight.");
    // Validation still describes the game; publishing is now out of date.
    const line = r.json.pipeline as { id: string; status: string }[];
    expect(line.find((x) => x.id === "playtest")!.status).not.toBe("pending");
    expect(line.find((x) => x.id === "publish")!.status).toBe("pending");

    // A bad theme is rejected, not coerced.
    const bad = await studio({ op: "presentation", presentation: { theme: "rainbow" } });
    expect(bad.status).toBe(400);

    // Republishing carries it to the player-facing event.
    const pub = await studio({ op: "publish", activate: false });
    expect(pub.status, JSON.stringify(pub.json?.error)).toBe(200);
    expect(pub.json.trace.publish.stages.map((x: { id: string }) => x.id)).toEqual(["validate", "seal", "materialise", "story", "standings"]);
    const event = await reloadEvent(db, id);
    expect(presentationOf(event).theme).toBe("cold-case");
    expect(pub.json.pipeline.find((x: { id: string }) => x.id === "publish").status).toBe("done");

    // Changing the game itself (not the look) makes validation stale.
    const node = pub.json.draft.blueprint.nodes[0];
    const edited = await studio({ op: "node", edit: { nodeId: node.id, title: `${node.title} (edited)` } });
    expect(edited.status).toBe(200);
    expect(edited.json.pipeline.find((x: { id: string }) => x.id === "playtest").status).toBe("pending");
  }, 240_000);

  it("activates the event; regular teams then register against it", async () => {
    const r = await studio({ op: "activate" });
    expect(r.status).toBe(200);
    expect(r.json.event.active).toBe(true);
    // One click starts the clock, so a published demo can be played at once; starting twice is harmless.
    expect(r.json.event.status).not.toBe("live");
    const started = await studio({ op: "start" });
    expect(started.status, JSON.stringify(started.json?.error)).toBe(200);
    expect(started.json.event.status).toBe("live");
    expect((await studio({ op: "start" })).status).toBe(200);
    const [e] = await db.select().from(events).where(eq(events.id, id));
    const t = await makeTeam(db, e!);
    expect(t.id).toBeTruthy();
    await closeAllSandboxes();
  });
});
