import { beforeAll, describe, expect, it } from "vitest";
import { controlEvent } from "../../src/server/engine/event";
import { GameError } from "../../src/server/engine/errors";
import { caseFileView, dispatch, getBoard, nodeDetail } from "../../src/server/game/engine";
import { updateBoard } from "../../src/server/game/board";
import { awardCheckpoint, badgeToken, checkpointToken, claimCheckpoint, decideScan, getCheckpoint, stationQueue } from "../../src/server/engine/live";
import { rotateCheckpointToken } from "../../src/server/engine/admin";
import { getLeaderboard } from "../../src/server/engine/leaderboard";

import { SYSTEM_ACTOR } from "../../src/server/audit";
import { signToken } from "../../src/server/security/crypto";
import type { DB } from "../../src/server/db/client";
import type { EventRow } from "../../src/server/engine/types";
import { freshDb, importFixture, makeTeam, startEvent } from "../helpers";

let db: DB;
let event: EventRow;
const station = { type: "station" as const, id: "cp1", label: "station:cp1" };

beforeAll(async () => {
  ({ db } = await freshDb());
  event = await startEvent(db, await importFixture(db, "test-event"));
});

const submitAnswer = (_db: DB, o: { event: EventRow; teamId: string; challengeId: string; answer: string }) =>
  dispatch(_db, { event: o.event, teamId: o.teamId, nodeId: o.challengeId, action: { type: "answer", value: o.answer } });

/** The v1 accusation is now the `verdict` final-reconstruction node. */
async function fileAccusation(_db: DB, o: { event: EventRow; teamId: string; answers: Record<string, string> }) {
  const r = await dispatch(_db, { event: o.event, teamId: o.teamId, nodeId: "verdict", action: { type: "accuse", answers: o.answers } });
  const d = (r.feedback.data ?? {}) as { correctCount?: number; delta?: number };
  return { correctCount: r.solved ? 2 : (d.correctCount ?? 0), delta: r.solved ? r.pointsDelta : (d.delta ?? 0), fullyCorrect: r.solved, message: r.feedback.message ?? "" };
}

const score = async (teamId: string) => (await getLeaderboard(db, event.id, "live")).standings.find((s) => s.teamId === teamId)!.score;

describe("evidence pipeline", () => {
  it("reveals at start, after a challenge, and at a scheduled time — never earlier", async () => {
    const t = await makeTeam(db, event);
    let file = await caseFileView(db, event, t.id);
    const json = JSON.stringify(file);
    expect(file.evidence.map((e) => e.id)).toEqual(["ev-start"]);
    expect(file.sealed).toBe(2);
    expect(file.nextReleaseAt).toBe("2030-01-01T00:00:00.000Z");
    for (const secret of ["SEALED-TITLE-HIDDEN", "SEALED-BODY-HIDDEN", "SEALED-TITLE-LATER", "SEALED-TIMELINE", "SOLUTION-TEXT"]) expect(json).not.toContain(secret);
    expect(file.hiddenTimeline).toBe(1);
    expect(file.solution).toBeNull();

    await submitAnswer(db, { event, teamId: t.id, challengeId: "i1", answer: "Open  Sesame" });
    file = await caseFileView(db, event, t.id);
    expect(file.evidence.map((e) => e.id).sort()).toEqual(["ev-hidden", "ev-start"]);
    expect(JSON.stringify(file)).toContain("SEALED-TIMELINE");

    file = await caseFileView(db, { ...event, endsAt: null }, t.id, new Date("2030-01-02T00:00:00Z"));
    expect(file.evidence.map((e) => e.id)).toContain("ev-later");
  });
});

describe("accusations (final-reconstruction)", () => {
  it("awards partial credit, escalates penalties, reports only the count, and locks when correct", async () => {
    const t = await makeTeam(db, event);
    const a1 = await fileAccusation(db, { event, teamId: t.id, answers: { who: "s1", why: "greed" } });
    expect(a1).toMatchObject({ correctCount: 1, delta: 40, fullyCorrect: false });
    expect(a1.message).not.toContain("s2");
    const a2 = await fileAccusation(db, { event, teamId: t.id, answers: { who: "s1", why: "love" } });
    expect(a2).toMatchObject({ correctCount: 0, delta: -20 });
    const a3 = await fileAccusation(db, { event, teamId: t.id, answers: { who: "s2", why: "greed" } });
    expect(a3).toMatchObject({ fullyCorrect: true });
    expect(await score(t.id)).toBe(40 - 20 + 100);
    await expect(fileAccusation(db, { event, teamId: t.id, answers: { who: "s2", why: "greed" } })).rejects.toMatchObject({ code: "already_solved" });
  });

  it("stops after the attempt limit and rejects invalid options", async () => {
    const t = await makeTeam(db, event);
    await expect(fileAccusation(db, { event, teamId: t.id, answers: { who: "nobody", why: "greed" } })).rejects.toBeInstanceOf(GameError);
    for (let i = 0; i < 3; i++) await fileAccusation(db, { event, teamId: t.id, answers: { who: "s1", why: "love" } });
    await expect(fileAccusation(db, { event, teamId: t.id, answers: { who: "s2", why: "greed" } })).rejects.toMatchObject({ code: "attempts_exhausted" });
  });

  it("does not offer sealed evidence as an accusation option", async () => {
    const t = await makeTeam(db, event);
    const d = await nodeDetail(db, event, t.id, "verdict");
    expect(JSON.stringify(d)).not.toContain("SEALED");
  });
});

describe("evidence board", () => {
  it("persists team-private layouts and ignores sealed evidence", async () => {
    const [t, other] = [await makeTeam(db, event), await makeTeam(db, event)];
    await updateBoard(db, event, t.id, [
      { op: "place", id: "ev:ev-start", x: 10, y: 20 },
      { op: "place", id: "ev:ev-hidden", x: 0, y: 0 },
      { op: "place", id: "sus:s1", x: 300, y: 20 },
      { op: "link", id: "l1", from: "ev:ev-start", to: "sus:s1", label: "alibi?" },
      { op: "note", id: "note:n1", text: "check the canteen", x: 5, y: 5 },
      { op: "annotate", id: "ev:ev-start", text: "private thought" },
    ]);
    const b = await getBoard(db, event.id, t.id);
    expect(Object.keys(b.layout.nodes).sort()).toEqual(["ev:ev-start", "sus:s1"]);
    expect(b.layout.links).toHaveLength(1);
    expect(b.layout.annotations["ev:ev-start"]).toBe("private thought");
    expect(b.version).toBe(1);
    expect((await getBoard(db, event.id, other.id)).layout.nodes).toEqual({});
    // Concurrent teammate ops merge on the server.
    await Promise.all([updateBoard(db, event, t.id, [{ op: "pin", id: "sus:s1", pinned: true }]), updateBoard(db, event, t.id, [{ op: "place", id: "ev:ev-start", x: 50, y: 50 }])]);
    const b2 = await getBoard(db, event.id, t.id);
    expect(b2.layout.nodes["sus:s1"]!.pinned).toBe(true);
    expect(b2.layout.nodes["ev:ev-start"]!.x).toBe(50);
    expect(b2.version).toBe(3);
  });
});

describe("live checkpoints", () => {
  it("claim → pending → approve awards points exactly once; re-scans are idempotent", async () => {
    const t = await makeTeam(db, event);
    const cp = (await getCheckpoint(db, event.id, "cp1"))!;
    const tok = checkpointToken(cp);
    const c1 = await claimCheckpoint(db, { event, teamId: t.id, token: tok, clientRef: "abc" });
    expect(c1.status).toBe("pending");
    const c2 = await claimCheckpoint(db, { event, teamId: t.id, token: tok, clientRef: "abc" });
    expect(c2).toMatchObject({ status: "pending", duplicate: true });
    const scan = (await stationQueue(db, event.id, "cp1")).find((q) => q.teamId === t.id)!;
    await expect(decideScan(db, { event, scanId: scan.id, approve: true, actor: station, stationCheckpoint: "cp2" })).rejects.toMatchObject({ code: "forbidden" });
    expect((await decideScan(db, { event, scanId: scan.id, approve: true, actor: station, stationCheckpoint: "cp1" })).status).toBe("confirmed");
    expect((await decideScan(db, { event, scanId: scan.id, approve: true, actor: station, stationCheckpoint: "cp1" })).changed).toBe(false);
    expect(await score(t.id)).toBe(30);
  });

  it("auto-confirm checkpoints confirm on scan", async () => {
    const t = await makeTeam(db, event);
    const cp = (await getCheckpoint(db, event.id, "cp2"))!;
    expect((await claimCheckpoint(db, { event, teamId: t.id, token: checkpointToken(cp) })).status).toBe("confirmed");
    expect(await score(t.id)).toBe(15);
  });

  it("rejects forged, cross-purpose and rotated QR tokens", async () => {
    const t = await makeTeam(db, event);
    const cp = (await getCheckpoint(db, event.id, "cp1"))!;
    const forged = signToken("not-the-real-secret-0123456789abcdef", "checkpoint", { e: event.id, c: "cp1", k: cp.tokenVersion });
    await expect(claimCheckpoint(db, { event, teamId: t.id, token: forged })).rejects.toMatchObject({ code: "invalid" });
    const badge = badgeToken(event.id, t.id).token; // right secret, wrong purpose
    await expect(claimCheckpoint(db, { event, teamId: t.id, token: badge })).rejects.toMatchObject({ code: "invalid" });
    const old = checkpointToken(cp);
    await rotateCheckpointToken(db, event, "cp1", SYSTEM_ACTOR);
    await expect(claimCheckpoint(db, { event, teamId: t.id, token: old })).rejects.toMatchObject({ code: "invalid" });
    const fresh = checkpointToken((await getCheckpoint(db, event.id, "cp1"))!);
    expect((await claimCheckpoint(db, { event, teamId: t.id, token: fresh })).status).toBe("pending");
  });

  it("team badges are single-use (a replayed screenshot fails) and manual awards need a note", async () => {
    const t = await makeTeam(db, event);
    const { token } = badgeToken(event.id, t.id);
    expect((await awardCheckpoint(db, { event, checkpointId: "cp1", actor: station, badge: token })).status).toBe("confirmed");
    await expect(awardCheckpoint(db, { event, checkpointId: "cp2", actor: station, badge: token })).rejects.toMatchObject({ code: "conflict" });
    await expect(awardCheckpoint(db, { event, checkpointId: "cp2", actor: station, teamId: t.id })).rejects.toMatchObject({ code: "invalid" });
    expect((await awardCheckpoint(db, { event, checkpointId: "cp2", actor: station, teamId: t.id, note: "verified student IDs" })).status).toBe("confirmed");
    expect(await score(t.id)).toBe(45);
  });

  it("expired badges are rejected", async () => {
    const t = await makeTeam(db, event);
    const expired = signToken(process.env.TOKEN_SECRET!, "badge", { e: event.id, t: t.id, n: "x1", exp: Math.floor(Date.now() / 1000) - 1 });
    await expect(awardCheckpoint(db, { event, checkpointId: "cp1", actor: station, badge: expired })).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("solution disclosure", () => {
  it("reveals the inquest solution only after the event ends", async () => {
    const t = await makeTeam(db, event);
    expect((await caseFileView(db, event, t.id)).solution).toBeNull();
    const ended = await controlEvent(db, event, "end", SYSTEM_ACTOR);
    const file = await caseFileView(db, ended, t.id);
    expect(file.solution?.md).toBe("SOLUTION-TEXT");
    expect(file.solution?.answers).toEqual([
      { field: "Who", value: "Suspect Two" },
      { field: "Why", value: "Greed" },
    ]);
  });
});
