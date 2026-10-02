import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as actionRoute from "../../src/app/api/play/action/route";
import * as artifactRoute from "../../src/app/api/artifacts/[token]/[name]/route";
import type { DB } from "../../src/server/db/client";
import { gameStateEvents, rateLimits } from "../../src/server/db/schema";
import { getLeaderboard } from "../../src/server/engine/leaderboard";
import { checkpointToken, claimCheckpoint, getCheckpoint } from "../../src/server/engine/live";
import type { EventRow } from "../../src/server/engine/types";
import { updateBoard } from "../../src/server/game/board";
import { nodeDetail, requireCompiled, teamOverview, theoryDesks, worldFor } from "../../src/server/game/engine";
import { controlRoom } from "../../src/server/game/control-room";
import { loadState, rebuildState } from "../../src/server/game/journal";
import { closeAllSandboxes } from "../../src/server/game/sql-sandbox";
import { call, freshDb, importFixture, makeTeam, startEvent, teamHeaders } from "../helpers";

let db: DB;
let event: EventRow;

beforeAll(async () => {
  ({ db } = await freshDb());
  event = await importFixture(db, "case-017", path.resolve("packs"));
  event = await startEvent(db, event);
}, 180_000);

/** Plays every reachable file with its intended solution, through the same HTTP routes a browser uses. */
async function playThrough(teamId: string, opts: { skipOptional: boolean }) {
  const h = await teamHeaders(db, teamId);
  const compiled = requireCompiled(event);
  const world = await worldFor(event, compiled, teamId);
  const log: string[] = [];
  for (let round = 0; round < 40; round++) {
    // A human team spends hours on this; the bot takes seconds. Reset the burst limiter between rounds.
    await db.delete(rateLimits);
    const o = await teamOverview(db, event, teamId);
    const open = o.acts.flatMap((a) => a.rounds.flatMap((r) => r.nodes)).filter((n) => n.state === "open" && !(opts.skipOptional && n.optional));
    if (!open.length) break;
    let progressed = false;
    for (const card of open) {
      const node = compiled.nodes.get(card.id)!;
      if (node.primitive === "qr-checkpoint") {
        const cp = (await getCheckpoint(db, event.id, (node.config as { checkpoint: string }).checkpoint))!;
        const r = await claimCheckpoint(db, { event, teamId, token: checkpointToken(cp) });
        log.push(`${card.id}: QR ${r.status}`);
        progressed = true;
        continue;
      }
      if (node.primitive === "board-deduction") {
        // The open deduction is offered on the wall itself.
        expect((await theoryDesks(db, event, teamId)).map((d) => d.id)).toContain(card.id);
        const rels = compiled.bp.relations;
        const ids = [...new Set(rels.flatMap((r) => [r.from, r.to]))];
        await updateBoard(db, event, teamId, [
          ...ids.map((id, i) => ({ op: "place" as const, id, x: (i % 5) * 200, y: Math.floor(i / 5) * 140 })),
          ...rels.map((r, i) => ({ op: "link" as const, id: `l${i}`, from: r.from, to: r.to, label: r.kind })),
        ]);
      }
      const ni = world.nodes.get(card.id)!;
      const state = await loadState(db, event.id, teamId);
      for (const action of ni.primitive.intendedSolution(ni.instance, state)) {
        const r = await call(actionRoute.POST as never, { url: "/api/play/action", headers: h, body: { nodeId: card.id, action } });
        if (r.status !== 200) {
          log.push(`${card.id}: ${action.type} → ${r.json?.error?.code}`);
          break;
        }
        if (r.json.solved) {
          log.push(`${card.id}: solved (+${r.json.pointsDelta})`);
          progressed = true;
          break;
        }
      }
    }
    if (!progressed) break;
  }
  return log;
}

describe("CASE 017 — The Last Transmission (flagship demo, end to end)", () => {
  it("is fully solvable through the HTTP layer, and the final reconstruction closes the case", async () => {
    const team = await makeTeam(db, event, "Night Shift");
    const log = await playThrough(team.id, { skipOptional: false });
    const o = await teamOverview(db, event, team.id);
    const cards = o.acts.flatMap((a) => a.rounds.flatMap((r) => r.nodes));
    const unsolved = cards.filter((c) => c.state !== "solved").map((c) => c.id);
    expect(unsolved, log.join("\n")).toEqual([]);
    const s = await loadState(db, event.id, team.id);
    expect(s.final.solved).toBe(true);
    expect(s.contradictions["marsh-alibi"]).toBeTruthy();
    expect(Object.keys(s.evidence).length).toBe(requireCompiled(event).bp.evidence.length);
    // Leaderboard reflects solves, partial credit and the coherence bonus.
    const lb = await getLeaderboard(db, event.id, "live");
    const me = lb.standings.find((x) => x.teamId === team.id)!;
    expect(me.breakdown.partial).toBe(250 + 150 + 150 + 100 + 150 + 100 + 200 + 400);
    expect(me.score).toBeGreaterThan(4000);
    // The snapshot equals a full re-fold of the journal.
    expect(await rebuildState(db, event.id, team.id)).toEqual(s);
    expect((await db.select().from(gameStateEvents).where(eq(gameStateEvents.teamId, team.id))).length).toBeGreaterThan(80);
  }, 300_000);

  it("serves every evidence file for real, only to its team", async () => {
    const team = await makeTeam(db, event, "File Clerks");
    await playThrough(team.id, { skipOptional: true });
    const h = await teamHeaders(db, team.id);
    const other = await makeTeam(db, event, "Outsiders");
    const hOther = await teamHeaders(db, other.id);
    let files = 0;
    for (const id of ["whiteboard-photo", "last-transmission", "ups-syslog", "encrypted-backup", "lab-notebook", "lodestar-repo", "gateway-capture", "facilities-db"]) {
      const d = (await nodeDetail(db, event, team.id, id))!;
      expect(d.artifacts.length, id).toBeGreaterThan(0);
      for (const a of d.artifacts) {
        const [, , , token, name] = a.url.split("/");
        const res = await artifactRoute.GET(new Request(`http://localhost:3000${a.url}`, { headers: h }), { params: Promise.resolve({ token: token!, name: name! }) });
        expect(res.status, a.name).toBe(200);
        expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
        expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(200);
        const denied = await artifactRoute.GET(new Request(`http://localhost:3000${a.url}`, { headers: hOther }), { params: Promise.resolve({ token: token!, name: name! }) });
        expect(denied.status).toBe(403);
        files++;
      }
    }
    expect(files).toBeGreaterThanOrEqual(10);
    const s = await loadState(db, event.id, team.id);
    expect(s.inventory.length).toBe(files);
  }, 300_000);

  it("gives every team the same architecture with different concrete values", async () => {
    const [a, b] = [await makeTeam(db, event, "Alpha Watch"), await makeTeam(db, event, "Bravo Watch")];
    const c = requireCompiled(event);
    const [wa, wb] = [await worldFor(event, c, a.id), await worldFor(event, c, b.id)];
    for (const k of ["badgeId", "keyFragment", "beaconFix", "dealRef", "maintPass", "transmissionKey"]) expect(wa.facts[k], k).not.toBe(wb.facts[k]);
    expect(wa.nodes.size).toBe(wb.nodes.size);
    expect(wa.errors.size + wb.errors.size).toBe(0);
    const fa = wa.nodes.get("final")!.instance.guarded;
    const fb = wb.nodes.get("final")!.instance.guarded;
    expect(fa).not.toEqual(fb);
  });

  it("feeds the Control Room from the journal: progress, solve times, stuck warnings, activity", async () => {
    const stuckTeams = [await makeTeam(db, event, "Stuck One"), await makeTeam(db, event, "Stuck Two"), await makeTeam(db, event, "Stuck Three")];
    for (const t of stuckTeams) await teamOverview(db, event, t.id);
    const cr = (await controlRoom(db, event))!;
    const night = cr.teams.find((t) => t.name === "Night Shift")!;
    expect(night.completion).toBe(1);
    expect(night.current).toBeNull();
    expect(cr.teams.find((t) => t.name === "File Clerks")!.completion).toBeGreaterThan(0.8);
    const radio = cr.nodes.find((n) => n.id === "radio-log")!;
    expect(radio.solved).toBeGreaterThanOrEqual(2);
    expect(radio.medianMinutes).not.toBeNull();
    expect(cr.feed.some((f) => /^Solved: /.test(f.text))).toBe(true);
    expect(cr.warnings).toEqual([]);
    // Six hours later nobody has moved: the stuck teams surface, with a critical warning on the entry file.
    const later = (await controlRoom(db, event, new Date(Date.now() + 6 * 60 * 60_000)))!;
    expect(later.teams.filter((t) => t.stuck).map((t) => t.name)).toEqual(expect.arrayContaining(["Stuck One", "Stuck Two", "Stuck Three"]));
    expect(later.warnings.some((w) => w.severity === "critical" && /teams stuck on/.test(w.message))).toBe(true);
    expect(later.activeTeams).toBe(0);
  }, 120_000);

  it("closes the SQL sandboxes", async () => {
    await closeAllSandboxes();
  });
});
