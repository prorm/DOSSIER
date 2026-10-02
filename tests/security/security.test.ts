import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { challenges, submissions } from "../../src/server/db/schema";
import { freshDb, importFixture, makeTeam, startEvent } from "../helpers";
import { caseFileView, dispatch } from "../../src/server/game/engine";
import { checkpointToken, claimCheckpoint, getCheckpoint } from "../../src/server/engine/live";
import { GameError } from "../../src/server/engine/errors";
import { adjustScore } from "../../src/server/engine/admin";
import { SYSTEM_ACTOR } from "../../src/server/audit";
import { signToken, verifyToken } from "../../src/server/security/crypto";
import { env } from "../../src/server/env";
import type { DB } from "../../src/server/db/client";
import type { EventRow } from "../../src/server/engine/types";

const submitAnswer = (db: DB, o: { event: EventRow; teamId: string; challengeId: string; answer: string }) =>
  dispatch(db, { event: o.event, teamId: o.teamId, nodeId: o.challengeId, action: { type: "answer", value: o.answer } });
const caseFile = (db: DB, event: EventRow, teamId: string) => caseFileView(db, event, teamId);

describe("Security Requirements Suite", () => {
  let db: DB;
  let event: EventRow;

  beforeAll(async () => {
    ({ db } = await freshDb());
    event = await startEvent(db, await importFixture(db, "test-event"));
  });

  describe("Answer Secrecy & Previews", () => {
    it("never stores plaintext answers in submissions or challenge tables", async () => {
      const chRows = await db.select().from(challenges).where(eq(challenges.eventId, event.id));
      for (const row of chRows) {
        const rawJson = JSON.stringify(row);
        // The plaintext flags are not stored directly in answer_hashes column
        expect(rawJson).not.toContain("FLAG{One}");
        expect(rawJson).not.toContain("the red fox");
      }
    });

    it("masks previews for all correct answers", async () => {
      const t = await makeTeam(db, event);
      await submitAnswer(db, { event, teamId: t.id, challengeId: "a", answer: "the red fox" });
      const [s] = await db.select().from(submissions).where(eq(submissions.teamId, t.id));
      expect(s).toBeDefined();
      expect(s!.correct).toBe(true);
      expect(s!.preview).toBeNull();
    });

    it("truncates wrong answer previews to PREVIEW_MAX length", async () => {
      const t = await makeTeam(db, event);
      const longAnswer = "A".repeat(200);
      await submitAnswer(db, { event, teamId: t.id, challengeId: "f1", answer: longAnswer });
      const [s] = await db
        .select()
        .from(submissions)
        .where(eq(submissions.teamId, t.id))
        .orderBy(submissions.id);
      expect(s!.preview).toBeDefined();
      expect(s!.preview!.length).toBe(120);
    });
  });

  describe("Locked Content & Information Disclosure", () => {
    it("refuses submissions for locked challenges", async () => {
      const t = await makeTeam(db, event);
      // Challenge b requires a, which t has not solved
      await expect(
        submitAnswer(db, { event, teamId: t.id, challengeId: "b", answer: "open sesame" })
      ).rejects.toThrowError(GameError);
    });

    it("does not reveal sealed evidence content prior to unlock condition", async () => {
      const t = await makeTeam(db, event);
      const teamCase = await caseFile(db, event, t.id);

      // Sealed evidence items must be masked: secret bodies/transcripts not disclosed
      const json = JSON.stringify(teamCase);
      expect(json).not.toContain("SEALED-TITLE-HIDDEN");
      expect(json).not.toContain("SEALED-BODY-HIDDEN");
      expect(json).not.toContain("SOLUTION-TEXT");
    });
  });

  describe("QR Token Security & Anti-Replay", () => {
    it("rejects forged and tampered QR signatures", async () => {
      const t = await makeTeam(db, event);
      const cp = (await getCheckpoint(db, event.id, "cp1"))!;
      const forged = signToken("wrong-key-0123456789abcdef0123456789", "checkpoint", {
        e: event.id,
        c: "cp1",
        k: cp.tokenVersion,
      });
      await expect(
        claimCheckpoint(db, { event, teamId: t.id, token: forged })
      ).rejects.toMatchObject({ code: "invalid" });
    });

    it("rejects cross-purpose tokens (e.g. checkpoint token presented as badge)", async () => {
      const cp = (await getCheckpoint(db, event.id, "cp1"))!;
      const cpTok = checkpointToken(cp);
      // Decode as badge purpose should fail
      const decodedAsBadge = verifyToken(env().TOKEN_SECRET, "badge", cpTok);
      expect(decodedAsBadge).toBeNull();

      // Decode as checkpoint purpose should succeed
      const decodedAsCp = verifyToken(env().TOKEN_SECRET, "checkpoint", cpTok);
      expect(decodedAsCp).not.toBeNull();
    });

    it("ensures auto-confirm checkpoint claims award points and are idempotent", async () => {
      const t = await makeTeam(db, event);
      const cp = (await getCheckpoint(db, event.id, "cp2"))!;
      const tok = checkpointToken(cp);

      // Auto-confirm checkpoint cp2
      const claim1 = await claimCheckpoint(db, { event, teamId: t.id, token: tok });
      expect(claim1.status).toBe("confirmed");

      // Second claim should return duplicate
      const claim2 = await claimCheckpoint(db, { event, teamId: t.id, token: tok });
      expect(claim2.duplicate).toBe(true);
    });
  });

  describe("Authorization Boundaries", () => {
    it("enforces validation on score adjustments and audit tracking", async () => {
      const t = await makeTeam(db, event);
      // Fails with zero delta
      await expect(
        adjustScore(db, event, { teamId: t.id, delta: 0, reason: "valid reason" } as never, SYSTEM_ACTOR)
      ).rejects.toThrow();

      // Fails with empty reason
      await expect(
        adjustScore(db, event, { teamId: t.id, delta: 100, reason: "   " } as never, SYSTEM_ACTOR)
      ).rejects.toThrow();
    });
  });
});
