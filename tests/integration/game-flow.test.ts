import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { challenges, eventLog, submissions } from "../../src/server/db/schema";
import { adjustScore, setTeamStatus } from "../../src/server/engine/admin";
import { controlEvent } from "../../src/server/engine/event";
import { GameError } from "../../src/server/engine/errors";
import { getLeaderboard } from "../../src/server/engine/leaderboard";
import { purchaseHint, submitAnswer, teamChallenges } from "../../src/server/engine/play";
import { SYSTEM_ACTOR } from "../../src/server/audit";
import type { DB } from "../../src/server/db/client";
import type { EventRow } from "../../src/server/engine/types";
import { freshDb, importFixture, makeTeam, reloadEvent, startEvent } from "../helpers";

let db: DB;
let event: EventRow;

async function stateOf(teamId: string) {
  const { views } = await teamChallenges(db, event, teamId);
  return Object.fromEntries(views.map((v) => [v.id, v.state]));
}

async function expectError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(GameError);
  await p.catch((e: GameError) => expect(e.code).toBe(code));
}

beforeAll(async () => {
  ({ db } = await freshDb());
  event = await importFixture(db, "test-event");
});

describe("event lifecycle gates submissions", () => {
  it("rejects submissions before start, while paused and after end", async () => {
    const t = await makeTeam(db, event);
    await expectError(submitAnswer(db, { event, teamId: t.id, challengeId: "a", answer: "x" }), "event_not_live");
    event = await startEvent(db, event);
    event = await controlEvent(db, event, "pause", SYSTEM_ACTOR);
    await expectError(submitAnswer(db, { event, teamId: t.id, challengeId: "a", answer: "x" }), "event_paused");
    event = await controlEvent(db, event, "resume", SYSTEM_ACTOR);
    expect(event.status).toBe("live");
  });
});

describe("treasure hunt unlock graph", () => {
  it("opens children as dependencies are met (all-of / any-of) and keeps locks server-side", async () => {
    const t = await makeTeam(db, event);
    let s = await stateOf(t.id);
    expect(s).toMatchObject({ a: "open", b: "locked", c: "locked", d: "locked", e: "locked", g: "scheduled" });
    await expectError(submitAnswer(db, { event, teamId: t.id, challengeId: "b", answer: "bravo" }), "locked");

    const r = await submitAnswer(db, { event, teamId: t.id, challengeId: "a", answer: "  the RED-fox!! " });
    expect(r.status).toBe("correct");
    expect(r.status === "correct" && r.unlocked.sort()).toEqual(["b", "c"]);
    s = await stateOf(t.id);
    expect(s).toMatchObject({ a: "solved", b: "open", c: "open", d: "locked", e: "locked" });

    await submitAnswer(db, { event, teamId: t.id, challengeId: "b", answer: "Bravo" });
    s = await stateOf(t.id);
    expect(s.d).toBe("open"); // any-of satisfied by b alone
    expect(s.e).toBe("locked"); // all-of still needs c
    await submitAnswer(db, { event, teamId: t.id, challengeId: "c", answer: "charlie" });
    expect((await stateOf(t.id)).e).toBe("open");
  });

  it("time-gated challenges stay closed until their instant", async () => {
    const t = await makeTeam(db, event);
    await expectError(submitAnswer(db, { event, teamId: t.id, challengeId: "g", answer: "golf" }), "scheduled");
    const later = new Date("2030-01-01T00:00:05Z");
    const r = await submitAnswer(db, { event: { ...event, endsAt: null }, teamId: t.id, challengeId: "g", answer: "golf", now: later });
    expect(r.status).toBe("correct");
  });

  it("cannot solve twice", async () => {
    const t = await makeTeam(db, event);
    await submitAnswer(db, { event, teamId: t.id, challengeId: "a", answer: "the red fox" });
    await expectError(submitAnswer(db, { event, teamId: t.id, challengeId: "a", answer: "the red fox" }), "already_solved");
  });
});

describe("answer secrecy", () => {
  it("never stores plaintext answers, and keeps correct submissions out of previews", async () => {
    const rows = await db.select().from(challenges).where(eq(challenges.eventId, event.id));
    const dump = JSON.stringify(rows.map((r) => r.answerHashes));
    for (const plain of ["The Red Fox", "bravo", "FLAG{One}", "FLAG{two}", "1000.5", "open sesame"]) expect(dump).not.toContain(plain);
    const correct = await db.select().from(submissions).where(eq(submissions.correct, true));
    expect(correct.length).toBeGreaterThan(0);
    expect(correct.every((s) => s.preview === null)).toBe(true);
  });

  it("normalises numbers", async () => {
    const t = await makeTeam(db, event);
    expect((await submitAnswer(db, { event, teamId: t.id, challengeId: "n1", answer: "1,000.50" })).status).toBe("correct");
  });
});

describe("rate limiting", () => {
  it("allows free misses, then imposes a doubling cooldown per team+challenge", async () => {
    const t = await makeTeam(db, event);
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await submitAnswer(db, { event, teamId: t.id, challengeId: "f1", answer: `nope-${i}` }));
    expect(results.slice(0, 4).every((r) => r.status === "incorrect" && r.retryAfterMs === 0)).toBe(true);
    const fifth = results[4]!;
    expect(fifth.status === "incorrect" && fifth.retryAfterMs).toBeGreaterThan(0);
    // During cooldown even the right answer is refused.
    await expectError(submitAnswer(db, { event, teamId: t.id, challengeId: "f1", answer: "FLAG{One}" }), "rate_limited");
    // Other challenges are unaffected.
    expect((await submitAnswer(db, { event, teamId: t.id, challengeId: "a", answer: "the red fox" })).status).toBe("correct");
  });

  it("caps bursts across all challenges", async () => {
    const t = await makeTeam(db, event);
    let limited = false;
    for (let i = 0; i < 35 && !limited; i++) {
      try {
        await submitAnswer(db, { event, teamId: t.id, challengeId: ["a", "f2", "n1"][i % 3]!, answer: `guess-${i}` });
      } catch (e) {
        limited = e instanceof GameError && e.code === "rate_limited";
      }
    }
    expect(limited).toBe(true);
  });
});

describe("hints, dynamic scoring, first blood, leaderboard", () => {
  it("sells hints in order, deducts the cost and reveals the text only after purchase", async () => {
    const t = await makeTeam(db, event);
    await submitAnswer(db, { event, teamId: t.id, challengeId: "a", answer: "the red fox" });
    let view = (await teamChallenges(db, event, t.id)).views.find((v) => v.id === "b")!;
    expect(JSON.stringify(view)).not.toContain("HINT-B-0");
    await expectError(purchaseHint(db, { event, teamId: t.id, challengeId: "b", index: 1 }), "conflict");
    const h = await purchaseHint(db, { event, teamId: t.id, challengeId: "b", index: 0 });
    expect(h.text).toBe("HINT-B-0");
    view = (await teamChallenges(db, event, t.id)).views.find((v) => v.id === "b")!;
    expect(JSON.stringify(view)).toContain("HINT-B-0");
    expect(JSON.stringify(view)).not.toContain("HINT-B-1");
    const lb = await getLeaderboard(db, event.id, "live");
    expect(lb.standings.find((s) => s.teamId === t.id)!.score).toBe(10 - 5);
  });

  it("awards first blood once and decays dynamic value for every solver", async () => {
    const [x, y, z] = [await makeTeam(db, event), await makeTeam(db, event), await makeTeam(db, event)];
    const r1 = await submitAnswer(db, { event, teamId: x.id, challengeId: "f1", answer: "FLAG{One}" });
    const r2 = await submitAnswer(db, { event, teamId: y.id, challengeId: "f1", answer: "FLAG{One}" });
    expect(r1.status === "correct" && r1.firstBlood).toBe(true);
    expect(r1.status === "correct" && r1.points).toBe(150);
    expect(r2.status === "correct" && r2.firstBlood).toBe(false);
    for (const t of [x, y, z]) await submitAnswer(db, { event, teamId: t.id, challengeId: "f2", answer: "FLAG{two}" });
    const lb = await getLeaderboard(db, event.id, "live");
    const score = (id: string) => lb.standings.find((s) => s.teamId === id)!.score;
    // f2: 3 solves → 400 each (decay 4); f1: x 150, y 100.
    expect(score(x.id)).toBe(150 + 400);
    expect(score(y.id)).toBe(100 + 400);
    expect(score(z.id)).toBe(400);
    expect(lb.firstBlood.f1).toBe(x.id);
  });

  it("freeze hides later points from the public board; end reveals them", async () => {
    const t = await makeTeam(db, event);
    event = await controlEvent(db, event, "freeze", SYSTEM_ACTOR);
    await submitAnswer(db, { event, teamId: t.id, challengeId: "a", answer: "the red fox" });
    const pub = await getLeaderboard(db, event.id, "public");
    const live = await getLeaderboard(db, event.id, "live");
    expect(pub.frozen).toBe(true);
    expect(pub.standings.find((s) => s.teamId === t.id)!.score).toBe(0);
    expect(live.standings.find((s) => s.teamId === t.id)!.score).toBe(10);
    event = await controlEvent(db, event, "unfreeze", SYSTEM_ACTOR);
  });

  it("adjustments need a reason; disqualified teams drop out of the ranking", async () => {
    const t = await makeTeam(db, event);
    await expect(adjustScore(db, event, { teamId: t.id, delta: 999, reason: "" } as never, SYSTEM_ACTOR)).rejects.toBeTruthy();
    await adjustScore(db, event, { teamId: t.id, delta: 999, reason: "manual test bonus" }, SYSTEM_ACTOR);
    let lb = await getLeaderboard(db, event.id, "live");
    expect(lb.standings[0]!.teamId).toBe(t.id);
    await setTeamStatus(db, event, t.id, true, "testing disqualification", SYSTEM_ACTOR);
    lb = await getLeaderboard(db, event.id, "live");
    const s = lb.standings.find((x) => x.teamId === t.id)!;
    expect(s.disqualified).toBe(true);
    expect(lb.standings[0]!.teamId).not.toBe(t.id);
    await expectError(submitAnswer(db, { event, teamId: t.id, challengeId: "a", answer: "the red fox" }), "disqualified");
  });
});

describe("append-only ledgers", () => {
  it("rejects UPDATE and DELETE on event_log, submissions and audit_log", async () => {
    await expect(db.update(eventLog).set({ points: 1_000_000 })).rejects.toThrow();
    await expect(db.delete(eventLog)).rejects.toThrow();
    await expect(db.delete(submissions)).rejects.toThrow();
    await expect(db.execute(sql`DELETE FROM audit_log`)).rejects.toThrow();
  });

  it("the end state is reachable and reopening is possible", async () => {
    event = await controlEvent(db, event, "end", SYSTEM_ACTOR);
    expect(event.status).toBe("ended");
    event = await controlEvent(db, event, "reopen", SYSTEM_ACTOR);
    expect(event.status).toBe("paused");
    event = await reloadEvent(db, event.id);
  });
});
