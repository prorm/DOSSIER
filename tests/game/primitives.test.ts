import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { dnsQueryName, readPcap } from "../../src/server/game/artifacts/pcap";
import { readZip } from "../../src/server/game/artifacts/zip";
import { unbase32 } from "../../src/server/game/core/ciphers";
import { emptyState, reduceAll, type GameState, type StateEvent, type StateEventBody } from "../../src/server/game/core/state";
import { cryptic } from "../../src/server/game/primitives/cryptic";
import { gitForensics } from "../../src/server/game/primitives/git-forensics";
import { boardDeduction, finalReconstruction, gpsCheckpoint, haversineM, qrCheckpoint, scoreBoard } from "../../src/server/game/primitives/inquest";
import { interview } from "../../src/server/game/primitives/interview";
import { networkCapture } from "../../src/server/game/primitives/network-capture";
import { miniMarkup, osintTrail } from "../../src/server/game/primitives/osint-trail";
import { listPrimitives, primitiveCatalog } from "../../src/server/game/primitives/registry";
import { sessionState } from "../../src/server/game/primitives/session-state";
import { sqlInvestigation } from "../../src/server/game/primitives/sql-investigation";
import { concordance, timeline } from "../../src/server/game/primitives/timeline";
import type { ChallengePrimitive, SiteRequest } from "../../src/server/game/primitives/types";
import { webInvestigation } from "../../src/server/game/primitives/web-investigation";
import { closeAllSandboxes, guardSql, runSandboxQuery } from "../../src/server/game/sql-sandbox";
import { buildAll, instantiate, RT, solveWithIntended, state, teamFacts } from "./harness";

afterAll(() => closeAllSandboxes());

/** Folds primitive events into a state (fills the node id the engine normally supplies). */
function apply(s: GameState, events: StateEventBody[], node = "n1"): GameState {
  let id = s.version;
  const evs = events.map((e) => ({ ...("node" in e && e.node === "" ? { ...e, node } : e), seq: ++id, at: new Date().toISOString() }) as StateEvent);
  return reduceAll(s, evs);
}

function withEvidence(...ids: string[]): GameState {
  return apply(emptyState("harness", "team"), ids.map((id) => ({ type: "evidence.gained", id, source: "test" })));
}

const req = (p: Partial<SiteRequest> & { path: string }): SiteRequest => ({ method: "GET", query: new URLSearchParams(), headers: new Headers(), cookies: {}, body: "", ...p });

describe("registry", () => {
  it("registers every primitive with a schema-valid example config", () => {
    const ids = listPrimitives().map((p) => p.id);
    for (const id of ["cryptic", "web-investigation", "session-state", "image-forensics", "audio-forensics", "pdf-forensics", "file-forensics", "git-forensics", "sql-investigation", "network-capture", "osint-trail", "timeline", "interview", "board-deduction", "qr-checkpoint", "gps-checkpoint", "final-reconstruction"])
      expect(ids).toContain(id);
    for (const p of listPrimitives()) expect(p.schema.safeParse(p.example()).success, p.id).toBe(true);
    expect(primitiveCatalog().find((p) => p.id === "sql-investigation")!.hasSql).toBe(true);
  });
});

describe("cryptic", () => {
  const cfg = {
    steps: [
      { prompt: "Shifted three: {{codeword | caesar:3}}", answer: "{{codeword}}", reveal: "Good." },
      { prompt: "Now the badge, reversed: {{badgeId | reverse}}", answer: "{{badgeId}}" },
    ],
    intentional: ["caesar", "reverse"],
  };
  it("reveals steps sequentially and only solves after the last", async () => {
    const { inst } = await instantiate(cryptic, "t1", cfg);
    const f = teamFacts("t1");
    let s = state();
    let v = cryptic.view(inst, s.nodes.n1, s) as { steps: unknown[] };
    expect(v.steps).toHaveLength(1);
    const t1 = cryptic.applyAction({ type: "answer", value: f.codeword!.toLowerCase() }, inst, undefined, s, RT) as Awaited<ReturnType<typeof cryptic.applyAction>>;
    expect(t1.correct).toBe(true);
    expect(t1.solved).toBe(false);
    s = apply(apply(s, [{ type: "node.unlocked", node: "n1", reason: "t" }]), t1.events);
    v = cryptic.view(inst, s.nodes.n1, s) as { steps: unknown[] };
    expect(v.steps).toHaveLength(2);
    const t2 = cryptic.applyAction({ type: "answer", value: f.badgeId! }, inst, s.nodes.n1, s, RT) as Awaited<ReturnType<typeof cryptic.applyAction>>;
    expect(t2.solved).toBe(true);
  });
});

describe("web investigation site mechanics", () => {
  it("spreads fragments over channels; the assembled answer exists nowhere in the site", async () => {
    const { inst, ctx } = await instantiate(webInvestigation, "t1", { site: "portal", channels: ["response-header", "indexeddb", "html-comment", "query-param"], decoys: 2 });
    const site = webInvestigation.site!(inst, ctx)!;
    const answer = inst.outputs.answer!;
    const frags = answer.split("-");
    expect(frags).toHaveLength(4);
    const ep = site.endpoints!.find((e) => e.path === "api/diagnostics")!;
    const diagOff = ep.handle(req({ path: "api/diagnostics" }));
    const diagOn = ep.handle(req({ path: "api/diagnostics", query: new URLSearchParams("verbose=1") }));
    expect(diagOff.status).toBe(400);
    expect(diagOn.discovery?.key).toMatch(/^diag-/);
    const serialized = JSON.stringify({ ...site, endpoints: undefined }) + String(diagOn.body);
    for (const f of frags) expect(serialized).toContain(f);
    expect(serialized).not.toContain(answer);
    // The ordering rule lives only in the source notes (source map).
    expect(site.sourceNotes!.join(" ")).toMatch(/\.join\('-'\)/);
  });

  it("chain mode links localStorage → IndexedDB → Cache Storage with decoys", async () => {
    const { inst, ctx } = await instantiate(webInvestigation, "t2", { site: "portal", mode: "chain", decoys: 3 });
    const site = webInvestigation.site!(inst, ctx)!;
    const cursor = JSON.parse(site.storage!.find((s) => s.key === "portal.sync")!.value).cursor;
    const rec = site.indexedDb![0]!.records.find((r) => r.key === cursor)!.value as { blob: string };
    const entry = site.cache!.find((c) => c.url === rec.blob)!;
    expect(entry.body).toContain(inst.outputs.answer);
    expect(site.cache!.length).toBeGreaterThan(3);
    expect(site.indexedDb![0]!.records.length).toBeGreaterThan(3);
  });
});

describe("session-state", () => {
  const cfg = { site: "portal", code: "{{zipPassword}}", rows: [["02:47", "B-114", "{{badgeId}}", "GRANTED"]], answer: "{{badgeId}}" };
  it("refuses records until a clearance request carries the discovered code; signed cookies cannot be forged", async () => {
    const { inst, ctx } = await instantiate(sessionState, "t3", cfg);
    const f = teamFacts("t3");
    const site = sessionState.site!(inst, ctx)!;
    const records = site.endpoints!.find((e) => e.path === "api/records")!;
    const clearance = site.endpoints!.find((e) => e.path === "api/session/clearance")!;
    const initial = site.cookies!.find((c) => c.name === "case_session")!.value;
    const denied = records.handle(req({ path: "api/records", cookies: { case_session: initial } }));
    expect(denied.status).toBe(403);
    expect(denied.headers!["X-Clearance-Endpoint"]).toBe("api/session/clearance");
    // Forging the payload breaks the signature.
    const [body, sig] = initial.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), clearance: "records" })).toString("base64url") + "." + sig;
    expect(records.handle(req({ path: "api/records", cookies: { case_session: forged } })).status).toBe(403);
    expect(clearance.handle(req({ path: "api/session/clearance", method: "POST", headers: new Headers({ "X-Case-Code": "WRONG" }) })).status).toBe(401);
    const ok = clearance.handle(req({ path: "api/session/clearance", method: "POST", headers: new Headers({ "X-Case-Code": f.zipPassword! }) }));
    expect(ok.status).toBe(200);
    const granted = ok.setCookies![0]!.split("=").slice(1).join("=");
    const rec = records.handle(req({ path: "api/records", cookies: { case_session: granted } }));
    expect(rec.status).toBe(200);
    expect(String(rec.body)).toContain(f.badgeId);
    expect(rec.discovery?.key).toBe("records");
  });
});

describe("git forensics", () => {
  const cfg = {
    question: "What did the deleted key file contain?",
    answer: "{{keyFragment}}",
    repo: "lodestar-ground",
    people: [{ name: "Theo Marsh", email: "tmarsh@lab.example.edu" }, { name: "Ilse Varga", email: "ivarga@lab.example.edu" }],
    history: [
      { op: "commit", label: "init", message: "initial import", date: "2026-03-01T10:00:00Z", tz: "+0530", changes: { "README.md": "# lodestar-ground\n", "config/uplink.key": "{{keyFragment}}\n" } },
      { op: "tag", name: "v0.9-pre-audit", at: "init", message: "state before the audit", author: 1, date: "2026-03-02T09:00:00Z" },
      { op: "commit", label: "clean", message: "remove debug creds", date: "2026-03-10T10:00:00Z", changes: { "config/uplink.key": null, "src/main.py": "print('ok')\n" } },
      { op: "commit", label: "oops", message: "wip notes", date: "2026-03-12T10:00:00Z", changes: { "notes.txt": "meet at the dome\n" } },
      { op: "reset", branch: "main", to: "clean", date: "2026-03-12T10:05:00Z" },
    ],
  };
  it("produces a repository that real git reads: deleted file in history, annotated tag, dangling commit", async () => {
    let git = true;
    try {
      execFileSync("git", ["--version"]);
    } catch {
      git = false;
    }
    const { inst, ctx } = await instantiate(gitForensics, "t4", cfg);
    const [zip] = await buildAll(gitForensics as ChallengePrimitive, inst, ctx);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dossier-git-"));
    for (const e of readZip(zip!.data)) {
      const p = path.join(dir, e.name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, e.data!);
    }
    const repo = path.join(dir, "lodestar-ground");
    expect(fs.existsSync(path.join(repo, "config/uplink.key"))).toBe(false);
    if (!git) return;
    const run = (...a: string[]) => execFileSync("git", ["-c", "safe.directory=*", ...a], { cwd: repo }).toString();
    expect(run("log", "--format=%s")).toBe("remove debug creds\ninitial import\n");
    expect(run("log", "--all", "-p")).toContain(teamFacts("t4").keyFragment);
    expect(run("cat-file", "-t", "v0.9-pre-audit")).toBe("tag\n");
    expect(run("reflog")).toMatch(/reset: moving to/);
    expect(run("fsck", "--lost-found")).toMatch(/dangling commit/);
    expect(run("status", "--porcelain")).toBe("");
    fs.rmSync(dir, { recursive: true, force: true });
  }, 90_000);
});

describe("sql investigation", () => {
  const cfg = {
    question: "Whose phone was on B-114's access point when the door opened?",
    people: [
      { key: "culprit", name: "Theo Marsh", title: "PhD Scholar" },
      { key: "badge", name: "Dana Whitlock", department: "Facilities", badge: "{{badgeId}}" },
      { key: "prof", name: "Anand Rao", title: "Professor" },
    ],
    incident: { room: "B-114", time: "{{wipeTime}}", badgeOf: "badge", present: "culprit", alibi: { person: "badge", leftAt: "01:10" }, decoy: "prof" },
  };
  const JOIN = (t: string) => `
    SELECT DISTINCT e.employee_id
    FROM access_logs l
    JOIN access_points ap ON ap.room = l.door
    JOIN wifi_sessions w ON w.ap_name = ap.ap_name AND l.ts BETWEEN w.connected_at AND w.disconnected_at
    JOIN devices d ON d.mac = w.mac
    JOIN employees e ON e.employee_id = d.employee_id
    WHERE l.door = 'B-114' AND l.ts LIKE '%${t}%'`;

  it("plants a consistent incident: the intended join finds exactly the present person, per team", async () => {
    const answers = new Set<string>();
    for (const team of ["t5", "t6"]) {
      const { inst } = await instantiate(sqlInvestigation, team, cfg);
      const f = teamFacts(team);
      const ds = sqlInvestigation.sqlDataset!(inst);
      expect(ds.data).toContain(f.badgeId);
      const r = await runSandboxQuery(`test:${team}`, () => ds, JOIN(`${f.wipeTime}:13`));
      expect(r.rows).toEqual([[inst.outputs.answer]]);
      answers.add(inst.outputs.answer!);
      // Badge owner is not the answer: the badge was theirs, the phone was not.
      const owner = await runSandboxQuery(`test:${team}`, () => ds, `SELECT employee_id FROM employees WHERE badge_id = '${f.badgeId}'`);
      expect(owner.rows[0]![0]).not.toBe(inst.outputs.answer);
    }
    expect(answers.size).toBe(2);
  }, 60_000);

  it("the sandbox is read-only and single-statement", async () => {
    const { inst } = await instantiate(sqlInvestigation, "t5", cfg);
    const ds = sqlInvestigation.sqlDataset!(inst);
    await expect(runSandboxQuery("test:t5", () => ds, "DELETE FROM employees")).rejects.toThrow(/Only read queries/);
    await expect(runSandboxQuery("test:t5", () => ds, "SELECT 1; SELECT 2")).rejects.toThrow(/One statement/);
    await expect(runSandboxQuery("test:t5", () => ds, "SELECT pg_sleep(10)")).rejects.toThrow(/not available/);
    await expect(runSandboxQuery("test:t5", () => ds, "WITH x AS (DELETE FROM employees RETURNING 1) SELECT * FROM x")).rejects.toThrow(/read-only/);
    expect(() => guardSql("  select * from employees; ")).not.toThrow();
  }, 60_000);

  it("runs queries through the primitive runtime and counts them", async () => {
    const { inst } = await instantiate(sqlInvestigation, "t5", cfg);
    const ds = sqlInvestigation.sqlDataset!(inst);
    const t = await sqlInvestigation.applyAction({ type: "query", sql: "SELECT count(*) FROM employees" }, inst, undefined, state(), { ...RT, sql: (q) => runSandboxQuery("test:t5", () => ds, q) });
    expect(t.correct).toBeNull();
    expect((t.feedback.data!.result as { rows: unknown[][] }).rows[0]![0]).toBe(63);
    expect(await solveWithIntended(sqlInvestigation as ChallengePrimitive, inst)).toBe(true);
  }, 60_000);
});

describe("network capture", () => {
  const cfg = {
    question: "What code did the field unit report?",
    answer: "{{codeword}}",
    beacon: { host: "10.14.3.77", domain: "status.fieldunit.example", message: "UNIT OK CODE {{codeword}} BATT 71" },
    decoys: [{ host: "10.14.5.20", domain: "metrics.printer.example", count: 6 }],
    web: [{ offsetSec: 30, client: "10.14.2.9", server: "10.14.0.10", host: "portal.campus.example", path: "/status" }],
    resolverLog: { filename: "resolver.log" },
  };
  it("writes a valid pcap whose beacon lookups reassemble into the message", async () => {
    const { inst, ctx } = await instantiate(networkCapture, "t7", cfg);
    const [pcap, log] = await buildAll(networkCapture as ChallengePrimitive, inst, ctx);
    const pk = readPcap(pcap!.data);
    expect(pk.every((p) => p.ipOk)).toBe(true);
    const names = pk.filter((p) => p.proto === "udp" && p.dport === 53 && p.src === "10.14.3.77").map((p) => dnsQueryName(p.payload));
    const chunks = names.map((n) => n.split(".")[0]!).sort().map((l) => l.split("-")[1]!);
    const msg = unbase32(chunks.join("")).toString();
    expect(msg).toBe(`UNIT OK CODE ${teamFacts("t7").codeword} BATT 71`);
    expect(pk.some((p) => p.proto === "tcp" && Buffer.from(p.payload).toString().startsWith("GET /status"))).toBe(true);
    expect(Buffer.from(log!.data).toString()).toMatch(/client 10\.14\.3\.77#\d+ \(00-/);
    // The encoded message never appears decoded in the raw bytes.
    expect(Buffer.from(pcap!.data).toString("latin1")).not.toContain(teamFacts("t7").codeword);
  });
});

describe("osint trail", () => {
  it("serves linked fictional pages with escaped markup only", async () => {
    const { inst, ctx } = await instantiate(osintTrail, "t8", osintTrail.example());
    const site = osintTrail.site!(inst, ctx)!;
    expect(site.pages!.map((p) => p.path)).toEqual(["forum/thread-88", "u/nightowl-17"]);
    expect(site.pages![0]!.html).toContain('<a href="u/nightowl-17">');
    expect(miniMarkup("<script>alert(1)</script> [x](javascript:alert(1))")).not.toMatch(/<script|href="javascript/);
    expect(osintTrail.schema.safeParse({ ...osintTrail.example(), start: "nope" }).success).toBe(false);
  });
});

describe("timeline", () => {
  const cfg = {
    events: [
      { id: "storm", label: "Mains power lost", source: "UPS controller", shown: "21:01 UTC", trueTime: "02:31" },
      { id: "wipe", label: "Wipe begins", source: "syslog", shown: "{{wipeTime}}:41 IST", trueTime: "{{wipeTime}}" },
      { id: "tx", label: "Transmission", source: "Radio club", shown: "03:14 IST", trueTime: "03:14" },
      { id: "alibi", label: "Marsh says he was asleep", source: "Statement", shown: "all night", trueTime: "02:40", contradictory: true },
      { id: "photo", label: "Whiteboard photo", source: "EXIF", shown: "21:20 UTC", trueTime: "02:50", requiresEvidence: "whiteboard" },
    ],
  };
  it("needs missing evidence, correct clock normalisation and the right discards", async () => {
    const { inst } = await instantiate(timeline, "t9", cfg);
    const truth = inst.outputs.order!.split(">");
    expect(truth).toHaveLength(4);
    const noEv = state();
    const v = timeline.view(inst, undefined, noEv) as { events: unknown[]; missing: number };
    expect(v.missing).toBe(1);
    expect(timeline.validateAction({ type: "order", order: truth, discard: ["alibi"] }, inst, undefined, noEv).ok).toBe(false);
    const s = withEvidence("whiteboard");
    const partial = timeline.applyAction({ type: "order", order: [...truth].reverse(), discard: ["alibi"] }, inst, undefined, s, RT) as { solved?: boolean; feedback: { message?: string } };
    expect(partial.solved).toBeFalsy();
    const wrongDiscard = timeline.applyAction({ type: "order", order: [...truth.filter((x) => x !== "tx"), "alibi"], discard: ["tx"] }, inst, undefined, s, RT) as { solved?: boolean; feedback: { message?: string } };
    expect(wrongDiscard.feedback.message).toMatch(/contradicted/);
    const ok = timeline.applyAction({ type: "order", order: truth, discard: ["alibi"] }, inst, undefined, s, RT) as { solved?: boolean };
    expect(ok.solved).toBe(true);
    expect(concordance(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
    expect(concordance(["c", "b", "a"], ["a", "b", "c"])).toBe(0);
  });
});

describe("interview", () => {
  const cfg = {
    suspect: "marsh",
    name: "Theo Marsh",
    topics: [
      { id: "where", question: "Where were you at 02:45?", answer: "Home. Asleep by midnight.", kind: "lie" },
      { id: "badge", question: "Whose badge opens B-114?", answer: "Dana's. Not mine.", requires: { asked: "where" } },
      { id: "corvid", question: "Who is Corvid?", answer: "Never heard of them.", kind: "lie", requires: { evidence: "offer-email" } },
    ],
    confrontations: [
      { evidence: "wifi-log", response: "…Fine. I was in the lab. For ten minutes.", contradiction: { id: "marsh-alibi", label: "Marsh's alibi vs. the Wi-Fi log", breaks: "where" }, reveals: { evidence: ["marsh-statement"] } },
      { evidence: "offer-email", response: "That offer was never accepted.", contradiction: { id: "marsh-corvid", label: "Marsh knew Corvid", breaks: "corvid" }, requires: { asked: "corvid" } },
    ],
    goal: { contradictions: ["marsh-alibi", "marsh-corvid"] },
  };
  it("gates topics on state, records contradictions from evidence and solves only when the goal is met", async () => {
    const { inst } = await instantiate(interview, "t10", cfg);
    let s = withEvidence("wifi-log");
    expect(interview.validateAction({ type: "ask", topic: "badge" }, inst, undefined, s).ok).toBe(false);
    expect(interview.validateAction({ type: "confront", evidence: "offer-email" }, inst, undefined, s).ok).toBe(false);
    s = apply(s, (interview.applyAction({ type: "ask", topic: "where" }, inst, undefined, s, RT) as { events: StateEventBody[] }).events);
    expect((interview.view(inst, undefined, s) as { available: { id: string }[] }).available.map((a) => a.id)).toEqual(["badge"]);
    const c1 = interview.applyAction({ type: "confront", evidence: "wifi-log" }, inst, undefined, s, RT) as { events: StateEventBody[]; solved?: boolean };
    expect(c1.events.map((e) => e.type)).toEqual(["interview.confronted", "contradiction", "evidence.gained"]);
    expect(c1.solved).toBe(false);
    s = apply(s, c1.events);
    expect(s.contradictions["marsh-alibi"]).toBeTruthy();
    s = apply(s, [{ type: "evidence.gained", id: "offer-email", source: "t" }]);
    s = apply(s, (interview.applyAction({ type: "ask", topic: "corvid" }, inst, undefined, s, RT) as { events: StateEventBody[] }).events);
    const c2 = interview.applyAction({ type: "confront", evidence: "offer-email" }, inst, undefined, s, RT) as { solved?: boolean };
    expect(c2.solved).toBe(true);
  });
});

describe("board, checkpoints and final reconstruction", () => {
  it("scores labelled board links against the truth table in either direction", () => {
    const truth = [{ from: "ev:wifi", to: "sus:marsh", kind: "implicates" }, { from: "ev:parking", to: "sus:dana", kind: "alibi-for" }];
    expect(scoreBoard([{ from: "sus:marsh", to: "ev:wifi", label: "Implicates" }, { from: "ev:parking", to: "sus:dana", label: "alibi-for" }, { from: "ev:x", to: "sus:dana", label: "implicates" }, { from: "ev:x", to: "ev:y", label: "" }], truth)).toEqual({ valid: 2, invalid: 1 });
  });

  it("board-deduction evaluates the live board through the runtime", async () => {
    const { inst } = await instantiate(boardDeduction, "t11", { relations: [{ from: "ev:a", to: "sus:b", kind: "implicates" }], required: 1 });
    const t = await boardDeduction.applyAction({ type: "evaluate" }, inst, undefined, state(), { ...RT, boardLinks: async () => [{ from: "ev:a", to: "sus:b", label: "implicates" }] });
    expect(t.solved).toBe(true);
    expect(t.events[0]).toMatchObject({ type: "board.evaluated", valid: 1, invalid: 0 });
  });

  it("qr-checkpoint follows confirmed checkpoint state", async () => {
    const { inst } = await instantiate(qrCheckpoint, "t12", { checkpoint: "observatory" });
    expect((qrCheckpoint.applyAction({ type: "check" }, inst, undefined, state(), RT) as { solved?: boolean }).solved).toBe(false);
    const s = apply(state(), [{ type: "checkpoint.confirmed", id: "observatory" }]);
    expect((qrCheckpoint.applyAction({ type: "check" }, inst, undefined, s, RT) as { solved?: boolean }).solved).toBe(true);
  });

  it("gps-checkpoint enforces the geofence and accuracy", async () => {
    const bpCfg = { checkpoint: "mast" };
    const { inst: base } = await instantiate(gpsCheckpoint as ChallengePrimitive, "t13", bpCfg).catch(() => ({ inst: null }));
    expect(base).toBeNull(); // no checkpoint with geo in the harness blueprint → loud failure
    const p = gpsCheckpoint;
    const inst = { public: { checkpoint: "mast", prompt: "", radiusM: 40 }, secret: { geo: { lat: 12.9716, lon: 77.5946, radiusM: 40 }, maxAccuracyM: 60 }, outputs: {}, guarded: [] };
    expect(p.validateAction({ type: "locate", lat: 12.9716, lon: 77.5946, accuracy: 200 }, inst, undefined, state()).ok).toBe(false);
    const inside = p.applyAction({ type: "locate", lat: 12.9718, lon: 77.5947, accuracy: 10 }, inst, undefined, state(), RT) as { solved?: boolean; events: StateEventBody[] };
    expect(inside.solved).toBe(true);
    expect(inside.events).toContainEqual({ type: "checkpoint.confirmed", id: "mast" });
    expect((p.applyAction({ type: "locate", lat: 12.975, lon: 77.5946, accuracy: 10 }, inst, undefined, state(), RT) as { solved?: boolean }).solved).toBe(false);
    expect(Math.round(haversineM({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) / 1000)).toBe(111);
  });

  it("final reconstruction: partial credit, penalties, tolerance, held evidence, coherence bonus", async () => {
    const cfg = {
      fields: [
        { id: "culprit", label: "Culprit", type: "suspect", answer: ["marsh"], points: 200 },
        { id: "time", label: "Wipe time", type: "time", answer: ["{{wipeTime}}"], points: 100, toleranceMinutes: 2 },
        { id: "evidence", label: "Key evidence", type: "evidence", answer: ["wifi-log", "capture"], points: 100 },
        { id: "code", label: "Final code", type: "code", answer: ["{{keyFragment}}-{{codeword}}"], points: 150 },
      ],
      penalties: [0, 50, 100],
      coherenceBonus: 250,
    };
    const { inst } = await instantiate(finalReconstruction, "t14", cfg);
    const f = teamFacts("t14");
    let s = withEvidence("wifi-log", "decoy");
    expect(finalReconstruction.validateAction({ type: "accuse", answers: { culprit: "marsh", time: f.wipeTime!, evidence: "capture", code: "x" } }, inst, undefined, s).ok).toBe(false);
    const first = finalReconstruction.applyAction({ type: "accuse", answers: { culprit: "marsh", time: f.wipeTime!, evidence: "decoy", code: "nope" } }, inst, undefined, s, RT) as { ledgerPoints?: number; solved?: boolean; feedback: { message?: string }; events: StateEventBody[] };
    expect(first.ledgerPoints).toBe(300);
    expect(first.feedback.message).toMatch(/2 of 4/);
    expect(first.feedback.message).not.toMatch(/culprit|time/i);
    s = apply(s, first.events);
    const [h, m] = f.wipeTime!.split(":").map(Number);
    const near = `${String(h).padStart(2, "0")}:${String(m! + 1).padStart(2, "0")}`;
    const second = finalReconstruction.applyAction({ type: "accuse", answers: { culprit: "marsh", time: near, evidence: "wifi-log", code: `${f.keyFragment}-${f.codeword!.toLowerCase()}` } }, inst, undefined, s, RT) as { ledgerPoints?: number; solved?: boolean; solvePoints?: number };
    expect(second.solved).toBe(true);
    expect(second.ledgerPoints).toBe(200 + 100 + 100 + 150 + 250 - 300);
    expect(second.solvePoints).toBe(0);
  });
});
