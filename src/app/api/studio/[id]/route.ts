import { z } from "zod";
import { json, readJson, route, setCookieHeader } from "@/server/http";
import { Presentation } from "@/server/game/core/blueprint";
import { startTeamSession } from "@/server/auth/accounts";
import { cookieName, cookieOptions, destroySession } from "@/server/auth/session";
import { GameError } from "@/server/engine/errors";
import {
  activateEvent,
  applyProposal,
  copilot,
  editNode,
  generate,
  harden,
  importStory,
  loadStudioEvent,
  NodeEdit,
  otherActiveEvent,
  PlanInput,
  playtestTeam,
  publishDraft,
  saveMeta,
  savePlan,
  savePresentation,
  saveStory,
  startEventNow,
  StoryImport,
  StudioMeta,
  studioView,
  validateDraft,
} from "@/server/game/studio";

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("meta"), meta: StudioMeta }),
  z.object({ op: z.literal("story-import"), sources: StoryImport.shape.sources }),
  z.object({ op: z.literal("story-save"), story: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal("plan"), plan: PlanInput }),
  z.object({ op: z.literal("presentation"), presentation: Presentation }),
  z.object({ op: z.literal("generate") }),
  z.object({ op: z.literal("validate") }),
  z.object({ op: z.literal("harden"), node: z.string().max(64).optional(), round: z.string().max(64).optional() }),
  z.object({ op: z.literal("copilot"), prompt: z.string().min(3).max(500) }),
  z.object({ op: z.literal("copilot-apply"), accept: z.boolean() }),
  z.object({ op: z.literal("node"), edit: NodeEdit }),
  z.object({ op: z.literal("publish"), activate: z.boolean().default(false) }),
  z.object({ op: z.literal("activate") }),
  z.object({ op: z.literal("start") }),
  z.object({ op: z.literal("playtest"), reset: z.boolean().default(false) }),
]);

type P = { id: string };

export const GET = route<"staff", P>({ auth: "staff", role: "admin" }, async ({ db }, { id }) => {
  const { event, draft } = await loadStudioEvent(db, id);
  return studioView(event, draft, await otherActiveEvent(db, id));
});

// Studio bodies (story Markdown) can exceed the default JSON limit.
export const POST = route<"staff", P>({ auth: "staff", role: "admin" }, async ({ req, db, actor, staff, ip, cookies }, { id }) => {
  const body = await readJson(req, Op, 1024 * 1024);
  let extra: Record<string, unknown> = {};
  switch (body.op) {
    case "meta":
      await saveMeta(db, id, body.meta);
      break;
    case "story-import":
      await importStory(db, id, { sources: body.sources });
      break;
    case "story-save":
      await saveStory(db, id, body.story);
      break;
    case "plan":
      await savePlan(db, id, body.plan);
      break;
    case "presentation":
      await savePresentation(db, id, body.presentation);
      break;
    case "generate":
      await generate(db, id);
      break;
    case "validate":
      await validateDraft(db, id);
      break;
    case "harden": {
      const r = await harden(db, id, { node: body.node, round: body.round });
      extra = { harden: r.result };
      break;
    }
    case "copilot":
      await copilot(db, id, body.prompt);
      break;
    case "copilot-apply":
      await applyProposal(db, id, body.accept);
      break;
    case "node":
      await editNode(db, id, body.edit);
      break;
    case "publish": {
      const r = await publishDraft(db, id, actor, { activate: body.activate });
      extra = { version: r.version };
      break;
    }
    case "activate":
      await activateEvent(db, id, actor);
      break;
    case "start":
      await startEventNow(db, id, actor);
      break;
    case "playtest": {
      if (!staff || staff.kind !== "staff") throw new GameError("forbidden", "Staff only.");
      const team = await playtestTeam(db, id, { id: staff.staff.id, name: staff.staff.name, email: staff.staff.email }, { reset: body.reset });
      await destroySession(db, cookies[cookieName("team")]);
      const { token, ttlMs } = await startTeamSession(db, team.id, ip, req.headers.get("user-agent"));
      const o = cookieOptions(ttlMs);
      return json({ ok: true, redirect: "/play", team: { id: team.id, name: team.name } }, { headers: { "set-cookie": setCookieHeader(cookieName("team"), token, { maxAge: o.maxAge, secure: o.secure }) } });
    }
  }
  const { event, draft } = await loadStudioEvent(db, id);
  return { ...studioView(event, draft, await otherActiveEvent(db, id)), ...extra };
});
