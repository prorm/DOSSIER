import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db/client";
import type { StaffRole } from "./db/schema";
import { getActiveEvent, getEvent } from "./engine/event";
import {
  cookieName,
  csrfTokenFor,
  hasRole,
  resolveStaffSession,
  resolveTeamSession,
  type StaffSession,
  type StationSession,
  type TeamSession,
} from "./auth/session";

/** Server-component helpers: resolve sessions from the request cookies. */

export async function pageTeamSession(): Promise<TeamSession | null> {
  const db = await getDb();
  const jar = await cookies();
  return resolveTeamSession(db, jar.get(cookieName("team"))?.value);
}

/** Team pages render the team's own event (playtest teams may be inside a draft). */
export async function requireTeamPage(returnTo?: string) {
  const [session, db] = await Promise.all([pageTeamSession(), getDb()]);
  const event = session ? await getEvent(db, session.team.eventId) : null;
  if (!session || !event || (session.team.kind !== "playtest" && !event.active && event.status === "draft")) {
    redirect(`/login${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ""}`);
  }
  return { session, event, db, csrf: csrfTokenFor(session) };
}

export async function pageStaffSession(): Promise<StaffSession | StationSession | null> {
  const db = await getDb();
  const jar = await cookies();
  return resolveStaffSession(db, jar.get(cookieName("staff"))?.value);
}

export async function requireStaffPage(role: StaffRole = "admin") {
  const session = await pageStaffSession();
  if (!session || session.kind !== "staff") redirect("/staff/login");
  if (!hasRole(session.staff.role, role)) redirect(session.staff.role === "volunteer" ? "/volunteer" : "/staff/login?denied=1");
  const db = await getDb();
  const event = await getActiveEvent(db);
  return { session, db, event, csrf: csrfTokenFor(session) };
}

export async function cspNonce(): Promise<string | undefined> {
  return (await headers()).get("x-nonce") ?? undefined;
}
