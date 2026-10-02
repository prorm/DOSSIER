import { ZodError, type ZodType } from "zod";
import type { Actor } from "./audit";
import { getDb, type DB } from "./db/client";
import type { StaffRole } from "./db/schema";
import { env } from "./env";
import { GameError } from "./engine/errors";
import { getActiveEvent, getEvent } from "./engine/event";
import type { EventRow } from "./engine/types";
import {
  cookieName,
  hasRole,
  resolveStaffSession,
  resolveTeamSession,
  verifyCsrf,
  type StaffSession,
  type StationSession,
  type TeamSession,
} from "./auth/session";

export const CSRF_HEADER = "x-csrf-token";
const MAX_BODY = 64 * 1024;

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof GameError) return json({ error: { code: e.code, message: e.message, ...e.extra } }, { status: e.status });
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return json(
      { error: { code: "invalid", message: first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input", issues: e.issues.slice(0, 10) } },
      { status: 400 },
    );
  }
  console.error("[dossier] unhandled route error", e);
  return json({ error: { code: "internal", message: "Something went wrong. Try again." } }, { status: 500 });
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out;
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    // Behind a trusted proxy the client is the left-most hop; otherwise only the
    // right-most hop (added by the server itself) is trustworthy.
    const ip = env().TRUST_PROXY ? hops[0] : hops[hops.length - 1];
    if (ip) return ip.slice(0, 64);
  }
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? "unknown";
}

/** Same-origin check for state-changing requests (defence in depth on top of SameSite + CSRF tokens). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set<string>([new URL(env().APP_URL).origin]);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    allowed.add(`${proto}://${host}`);
  }
  return allowed.has(origin);
}

export async function readJson<T>(req: Request, schema: ZodType<T>, maxBytes = MAX_BODY): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new GameError("invalid", "Request body too large.");
  const text = await req.text();
  if (text.length > maxBytes) throw new GameError("invalid", "Request body too large.");
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new GameError("invalid", "Malformed JSON.");
  }
  return schema.parse(data);
}

type AuthMode = "none" | "team" | "staff" | "station" | "staffOrStation";

interface Ctx<A extends AuthMode> {
  req: Request;
  db: DB;
  ip: string;
  cookies: Record<string, string>;
  event: EventRow | null;
  team: A extends "team" ? TeamSession : TeamSession | null;
  staff: A extends "staff" ? StaffSession : StaffSession | StationSession | null;
  actor: Actor;
}

interface RouteOptions<A extends AuthMode> {
  auth: A;
  role?: StaffRole;
  /** Require the active event (404 otherwise). */
  event?: boolean;
}

/**
 * Wraps a route handler with: session resolution, role checks, same-origin +
 * per-session CSRF token verification on mutations, uniform error mapping.
 */
export function route<A extends AuthMode, P = Record<string, string>>(
  opts: RouteOptions<A>,
  handler: (ctx: Ctx<A>, params: P) => Promise<Response | unknown>,
) {
  return async (req: Request, context?: { params?: Promise<P> }): Promise<Response> => {
    try {
      const db = await getDb();
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (mutating && !sameOrigin(req)) throw new GameError("forbidden", "Cross-origin request rejected.");
      const cookies = parseCookies(req.headers.get("cookie"));
      const ip = clientIp(req);
      const team = opts.auth === "team" || opts.auth === "none" ? await resolveTeamSession(db, cookies[cookieName("team")]) : null;
      const staff = opts.auth !== "team" && opts.auth !== "none" ? await resolveStaffSession(db, cookies[cookieName("staff")]) : null;

      let actor: Actor = { type: "system", id: null, label: "anonymous", ip };
      let session: { csrfSecret: string } | null = null;
      switch (opts.auth) {
        case "team":
          if (!team) throw new GameError("unauthorized", "Sign in as a team first.");
          actor = { type: "team", id: team.team.id, label: team.team.name, ip };
          session = team;
          break;
        case "staff":
          if (!staff || staff.kind !== "staff") throw new GameError("unauthorized", "Staff sign-in required.");
          if (opts.role && !hasRole(staff.staff.role, opts.role)) throw new GameError("forbidden", "Your role does not allow this action.");
          actor = { type: "staff", id: staff.staff.id, label: staff.staff.email, ip };
          session = staff;
          break;
        case "station":
        case "staffOrStation":
          if (!staff) throw new GameError("unauthorized", "Station or staff sign-in required.");
          if (staff.kind === "station") {
            actor = { type: "station", id: staff.checkpointId, label: `station:${staff.checkpointId}`, ip };
          } else {
            if (opts.auth === "station") throw new GameError("forbidden", "Station session required.");
            if (!hasRole(staff.staff.role, opts.role ?? "volunteer")) throw new GameError("forbidden", "Your role does not allow this action.");
            actor = { type: "staff", id: staff.staff.id, label: staff.staff.email, ip };
          }
          session = staff;
          break;
        case "none":
          break;
      }
      if (mutating && session && !verifyCsrf(session, req.headers.get(CSRF_HEADER))) {
        throw new GameError("forbidden", "Missing or invalid CSRF token. Reload the page.");
      }
      // A team always plays its own event (organiser playtest teams play drafts); everyone else sees the active event.
      const event = opts.auth === "team" && team ? await getEvent(db, team.team.eventId) : await getActiveEvent(db);
      if (opts.event && !event) throw new GameError("not_found", "No active event.");
      if (event && staff?.kind === "station" && staff.eventId !== event.id) throw new GameError("unauthorized", "Station session belongs to another event.");
      if (event && team && opts.auth === "team" && team.team.kind !== "playtest" && !event.active && event.status === "draft")
        throw new GameError("unauthorized", "Your team's event is not open.");

      const params = (await context?.params) ?? ({} as P);
      const result = await handler({ req, db, ip, cookies, event, team, staff, actor } as Ctx<A>, params);
      return result instanceof Response ? result : json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function setCookieHeader(name: string, value: string, opts: { maxAge: number; secure: boolean }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${opts.maxAge}`];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}
