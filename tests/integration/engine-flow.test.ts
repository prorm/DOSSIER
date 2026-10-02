import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import * as actionRoute from "../../src/app/api/play/action/route";
import * as nodeRoute from "../../src/app/api/play/node/[id]/route";
import * as boardRoute from "../../src/app/api/play/board/route";
import * as artifactRoute from "../../src/app/api/artifacts/[token]/[name]/route";
import * as siteRoute from "../../src/app/x/[token]/[[...path]]/route";
import type { DB } from "../../src/server/db/client";
import { challengeInstances, eventLog, gameStateEvents, submissions } from "../../src/server/db/schema";
import { getLeaderboard } from "../../src/server/engine/leaderboard";
import { claimCheckpoint, checkpointToken, getCheckpoint } from "../../src/server/engine/live";
import type { EventRow } from "../../src/server/engine/types";
import { caseFileView, requireCompiled, teamOverview, worldFor } from "../../src/server/game/engine";
import { loadState, rebuildState } from "../../src/server/game/journal";
import { readZip } from "../../src/server/game/artifacts/zip";
import { freshDb, importFixture, makeTeam, startEvent, call, teamHeaders } from "../helpers";

let db: DB;
let event: EventRow;

beforeAll(async () => {
  ({ db } = await freshDb());
  event = await importFixture(db, "engine-test");
  event = await startEvent(db, event);
}, 120_000);

async function facts(teamId: string) {
  return (await worldFor(event, requireCompiled(event), teamId)).facts;
}

async function act(headers: Record<string, string>, nodeId: string, action: Record<string, unknown>) {
  return call(actionRoute.POST as never, { url: "/api/play/action", headers, body: { nodeId, action } });
}

async function node(headers: Record<string, string>, id: string) {
  return (await call(nodeRoute.GET as never, { url: `/api/play/node/${id}`, headers, params: { id } })).json;
}

/** Fetches a path on the team's synthetic site through the real route handler. */
async function site(siteUrl: string, path: string, init: { method?: string; headers?: Record<string, string>; cookies?: Record<string, string> } = {}) {
  const token = siteUrl.split("/")[2]!;
  const cookie = Object.entries(init.cookies ?? {}).map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await call(siteRoute.GET as never, {
    method: init.method ?? "GET",
    url: `/x/${token}/${path}`,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
    params: { token, path: path ? path.split("?")[0]!.split("/") : [] },
  });
  return res;
}

async function sitePost(siteUrl: string, path: string, headers: Record<string, string>, cookies: Record<string, string>) {
  const token = siteUrl.split("/")[2]!;
  const req = new Request(`http://localhost:3000/x/${token}/${path}`, { method: "POST", headers: { ...headers, cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") } });
  return siteRoute.POST(req, { params: Promise.resolve({ token, path: path.split("/") }) });
}

describe("engine: challenge → action → validation → state → event → unlock → next challenge", () => {
  it("plays the whole engine-test case through the HTTP layer", async () => {
    const team = await makeTeam(db, event, "Walkthrough");
    const h = await teamHeaders(db, team.id);
    const f = await facts(team.id);

    // ── Start: only the first node is open; locked nodes reveal no titles. ──
    let o = await teamOverview(db, event, team.id);
    const cards = o.acts.flatMap((a) => a.rounds.flatMap((r) => r.nodes));
    expect(cards.find((c) => c.id === "message")!.state).toBe("open");
    expect(cards.filter((c) => c.state === "locked").every((c) => c.title === null)).toBe(true);
    expect(JSON.stringify(o)).not.toContain(f.codeword);

    // ── Cryptic: wrong → logged; right → unlocks the portal and grants evidence. ──
    const wrong = await act(h, "message", { type: "answer", value: "not-it" });
    expect(wrong.status).toBe(200);
    expect(wrong.json.correct).toBe(false);
    const ok = await act(h, "message", { type: "answer", value: f.codeword!.toLowerCase() });
    expect(ok.json.solved).toBe(true);
    expect(ok.json.unlocked.map((u: { id: string }) => u.id)).toContain("portal");
    expect(ok.json.evidence.map((e: { id: string }) => e.id)).toContain("ev-message");
    const subs = await db.select().from(submissions).where(eq(submissions.teamId, team.id));
    expect(subs.map((s) => s.correct)).toEqual([false, true]);
    expect(subs.find((s) => s.correct)!.preview).toBeNull();

    // ── Browser investigation: the portal is a real site; evidence is in headers, IndexedDB, comments and the source map. ──
    const portal = await node(h, "portal");
    expect(portal.site.url).toMatch(/^\/x\/v1\.[^/]+\/$/);
    const home = await site(portal.site.url, "");
    expect(home.status).toBe(200);
    expect(home.headers.get("content-security-policy")).toContain("script-src 'self'");
    const status = await site(portal.site.url, "api/status");
    const headerFrags = [...status.headers.entries()].filter(([k]) => k.startsWith("x-portal-")).map(([k, v]) => [k.replace("x-portal-", ""), v] as [string, string]);
    expect(headerFrags.length).toBeGreaterThan(0);
    const boot = (await site(portal.site.url, "api/bootstrap?page=directory")).json;
    const idbRecords = boot.indexedDb.flatMap((d: { records: { value: { label: string; token: string } }[] }) => d.records.map((r) => r.value));
    const dir = await site(portal.site.url, "directory");
    const comments = [...dir.text.matchAll(/<!-- ([a-z-]+):([A-Z0-9]+) -->/g)].map((m) => ({ label: m[1]!, value: m[2]! }));
    const map = (await site(portal.site.url, "assets/app.min.js.map")).json;
    const js = (await site(portal.site.url, "assets/app.min.js")).text;
    expect(js).toContain("//# sourceMappingURL=app.min.js.map");
    const rule = /\[([^\]]+)\]\.map\(part\)\.join\('(.)'\)/.exec(map.sourcesContent[0])!;
    expect(rule).toBeTruthy();
    expect(js).not.toMatch(/\.map\(part\)/); // the rule exists only in the original source
    const labels = rule[1]!.split(",").map((s: string) => s.trim().replace(/'/g, ""));
    const pool = new Map<string, string>([
      ...headerFrags,
      ...idbRecords.map((r: { label: string; token: string }) => [r.label, r.token] as [string, string]),
      ...comments.map((c) => [c.label, c.value] as [string, string]),
    ]);
    const pass = labels.map((l: string) => pool.get(l)).join(rule[2]);
    expect(pass).toBe(f.maintPass);
    // The assembled passphrase is nowhere in what the site served.
    for (const body of [home.text, dir.text, js, JSON.stringify(map), JSON.stringify(boot), status.text]) expect(body).not.toContain(f.maintPass);
    const portalOk = await act(h, "portal", { type: "answer", value: pass });
    expect(portalOk.json.solved).toBe(true);
    expect(portalOk.json.unlocked.map((u: { id: string }) => u.id)).toContain("records");

    // ── Cookie/session: records refuse the visitor session; replaying the clearance request with the passphrase transitions it. ──
    const recPage = await site(portal.site.url, "records");
    const setCookies = recPage.headers.getSetCookie();
    expect(setCookies.map((c) => c.split("=")[0])).toEqual(expect.arrayContaining(["case_session", "theme", "_pa_id"]));
    expect(setCookies.every((c) => c.includes(`Path=/x/`))).toBe(true);
    const jar: Record<string, string> = Object.fromEntries(setCookies.map((c) => c.split(";")[0]!.split(/=(.*)/s).slice(0, 2) as [string, string]));
    const denied = await site(portal.site.url, "api/records", { cookies: jar });
    expect(denied.status).toBe(403);
    const endpoint = denied.headers.get("x-clearance-endpoint")!;
    const headerName = denied.headers.get("x-clearance-header")!;
    const granted = await sitePost(portal.site.url, endpoint, { [headerName]: pass }, jar);
    expect(granted.status).toBe(200);
    jar.case_session = granted.headers.getSetCookie()[0]!.split(";")[0]!.split(/=(.*)/s)[1]!;
    const rec = await site(portal.site.url, "api/records", { cookies: jar });
    expect(rec.status).toBe(200);
    const badge = rec.json.rows[0][2];
    let s = await loadState(db, event.id, team.id);
    expect(s.discoveries.records).toEqual(["clearance", "records"]);
    const recOk = await act(h, "records", { type: "answer", value: badge });
    expect(recOk.json.solved).toBe(true);
    expect(recOk.json.unlocked.map((u: { id: string }) => u.id)).toContain("archive"); // evidence-gated

    // ── Forensics: download the real encrypted archive; the password is the upstream passphrase. ──
    const archive = await node(h, "archive");
    const art = archive.artifacts[0];
    const [, , , token, name] = art.url.split("/");
    const dl = await call(artifactRoute.GET as never, { url: art.url, headers: h, params: { token, name } });
    expect(dl.status).toBe(200);
    const other = await makeTeam(db, event, "Snooper");
    const hOther = await teamHeaders(db, other.id);
    expect((await call(artifactRoute.GET as never, { url: art.url, headers: hOther, params: { token, name } })).status).toBe(403);
    const bytes = new Uint8Array(await (await artifactRoute.GET(new Request(`http://localhost:3000${art.url}`, { headers: h }), { params: Promise.resolve({ token, name }) })).arrayBuffer());
    const files = readZip(bytes, pass);
    const log = Buffer.from(files[0]!.data!).toString();
    const wipe = /(\d\d:\d\d):\d\d \S+ maint\[77\]/.exec(log)![1]!;
    expect(wipe).toBe(f.wipeTime);
    const archOk = await act(h, "archive", { type: "answer", value: wipe });
    expect(archOk.json.solved).toBe(true);
    s = await loadState(db, event.id, team.id);
    expect(s.inventory.map((i) => i.name)).toContain("evidence.zip");

    // ── Physical: scanning the QR confirms the checkpoint, auto-solves the node; the final still needs the board. ──
    const cp = (await getCheckpoint(db, event.id, "lab-door"))!;
    const claim = await claimCheckpoint(db, { event, teamId: team.id, token: checkpointToken(cp) });
    expect(claim.status).toBe("confirmed");
    o = await teamOverview(db, event, team.id);
    const byId = new Map(o.acts.flatMap((a) => a.rounds.flatMap((r) => r.nodes)).map((c) => [c.id, c]));
    expect(byId.get("field")!.state).toBe("solved");
    expect(byId.get("verdict")!.state).toBe("locked");
    expect(byId.get("verdict")!.requirements.map((r) => r.text).join(" ")).toMatch(/supported links/);

    // ── Evidence board: a correct, labelled link satisfies the `links` gate. ──
    const board = await call(boardRoute.POST as never, {
      url: "/api/play/board",
      headers: h,
      body: { ops: [{ op: "place", id: "ev:ev-door", x: 0, y: 0 }, { op: "place", id: "sus:ada", x: 200, y: 0 }, { op: "link", id: "l1", from: "sus:ada", to: "ev:ev-door", label: "implicates" }] },
    });
    expect(board.status).toBe(200);
    expect(JSON.stringify(board.json)).not.toMatch(/valid|supported/);
    // The save says exactly what the board opened (never which string was right), so the wall can answer it.
    expect(board.json.opened).toEqual({ unlocked: ["verdict"], evidence: [] });
    // And an exhibit knows the file it came from, once the team knows that file.
    const file = await caseFileView(db, event, team.id);
    expect(file.evidence.find((e) => e.id === "ev-door")?.from).toEqual({ id: "records", title: "Records desk" });
    expect(file.evidence.find((e) => e.id === "ev-brief")?.from).toBeNull();
    o = await teamOverview(db, event, team.id);
    expect(o.acts.flatMap((a) => a.rounds.flatMap((r) => r.nodes)).find((c) => c.id === "verdict")!.state).toBe("open");

    // ── Final reconstruction: partial credit, then the coherent reconstruction. ──
    const p1 = await act(h, "verdict", { type: "accuse", answers: { culprit: "ada", time: wipe, code: "nope" } });
    expect(p1.json.feedback.message).toMatch(/2 of 3/);
    const p2 = await act(h, "verdict", { type: "accuse", answers: { culprit: "ada", time: wipe, code: pass } });
    expect(p2.json.solved).toBe(true);
    const lb = await getLeaderboard(db, event.id, "live");
    const me = lb.standings.find((x) => x.teamId === team.id)!;
    // 50 + 150 + 150 + 200 + 50 solves, final 300 partial then +200 (400 + 100 bonus − 300).
    expect(me.score).toBe(50 + 150 + 150 + 200 + 50 + 500);
    expect(me.breakdown.partial).toBe(500);

    // ── The fold is authoritative: rebuilding from the journal equals the snapshot. ──
    const snap = await loadState(db, event.id, team.id);
    const rebuilt = await rebuildState(db, event.id, team.id);
    expect(rebuilt).toEqual(snap);
    const inst = await db.select().from(challengeInstances).where(eq(challengeInstances.teamId, team.id));
    expect(inst.length).toBeGreaterThanOrEqual(5);
  }, 120_000);

  it("per-team instances: another team's answers do not work, and locked nodes refuse actions", async () => {
    const a = await makeTeam(db, event, "Team Alpha");
    const b = await makeTeam(db, event, "Team Beta");
    const fa = await facts(a.id);
    const fb = await facts(b.id);
    const hb = await teamHeaders(db, b.id);
    expect((await act(hb, "portal", { type: "answer", value: "x" })).json.error.code).toBe("locked");
    if (fa.codeword !== fb.codeword) expect((await act(hb, "message", { type: "answer", value: fa.codeword! })).json.correct).toBe(false);
    // Different teams get different generated passphrases.
    expect(fa.maintPass).not.toBe(fb.maintPass);
  }, 60_000);

  it("hints are ordered, cost points and render per-team text", async () => {
    const t = await makeTeam(db, event, "Hint Seekers");
    const { takeHint } = await import("../../src/server/game/engine");
    const r = await takeHint(db, { event, teamId: t.id, nodeId: "message", index: 0 });
    expect(r.cost).toBe(25);
    const lb = await getLeaderboard(db, event.id, "live");
    expect(lb.standings.find((x) => x.teamId === t.id)!.score).toBe(-25);
    const again = await takeHint(db, { event, teamId: t.id, nodeId: "message", index: 0 });
    expect(again.alreadyOwned).toBe(true);
  });

  it("the state journal is append-only at the database level", async () => {
    const rejects = async (p: Promise<unknown>) => {
      const e = await p.then(
        () => null,
        (x: Error & { cause?: Error }) => x,
      );
      expect(e).not.toBeNull();
      expect(`${e!.message} ${e!.cause?.message ?? ""}`).toMatch(/append-only/);
    };
    await rejects(db.execute(sql`UPDATE game_state_events SET type = 'x'`));
    await rejects(db.delete(gameStateEvents).where(and(eq(gameStateEvents.eventId, event.id))));
    await rejects(db.delete(eventLog));
  });
});
