import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "../lib/experience/themes";
import { getDb } from "./db/client";
import { getActiveEvent, getEvent } from "./engine/event";
import type { EventRow } from "./engine/types";
import { env } from "./env";
import { pageTeamSession } from "./page-auth";
import { presentationOf } from "./views";

export const THEME_COOKIE = "dossier_theme";

/** Staff surfaces (Studio, Control Room, volunteer stations) keep one stable operations look. */
const STAFF_PREFIXES = ["/studio", "/admin", "/volunteer", "/staff", "/display"];

/**
 * Which theme paints this request. The event's `presentation.theme` decides;
 * a team plays *its own* event (organiser playtests run drafts), everyone else
 * sees the active event. Staff tools are deliberately not themed by the event
 * (an organiser must be able to read the control room under any theme), and
 * in development `dossier_theme` lets you preview any theme on real data.
 */
export async function resolveTheme(): Promise<{ theme: ThemeId; event: EventRow | null }> {
  const h = await headers();
  const path = h.get("x-pathname") ?? "";
  const db = await getDb();
  let event: EventRow | null = null;
  const team = await pageTeamSession().catch(() => null);
  if (team) event = await getEvent(db, team.team.eventId).catch(() => null);
  event ??= await getActiveEvent(db).catch(() => null);

  const override = (await cookies()).get(THEME_COOKIE)?.value;
  if (override && isThemeId(override) && env().DEV_UI) return { theme: override, event };
  if (STAFF_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return { theme: DEFAULT_THEME, event };
  return { theme: presentationOf(event).theme, event };
}
