import type { EventRow } from "./engine/types";
import { eventPhase, freezeInstant } from "./engine/event";
import { signedAssetUrl } from "./assets/sign";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "../lib/experience/themes";

export interface PresentationView {
  theme: ThemeId;
  intensity: "calm" | "balanced" | "cinematic";
  cinematic: { caseNumber: string; kicker: string; lines: string[] };
}

/** Presentation settings of an event row (safe defaults for events published before themes existed). */
export function presentationOf(e: EventRow | null): PresentationView {
  const p = (e?.config as { presentation?: Partial<PresentationView> } | undefined)?.presentation;
  return {
    theme: isThemeId(p?.theme) ? p.theme : DEFAULT_THEME,
    intensity: p?.intensity === "calm" || p?.intensity === "cinematic" ? p.intensity : "balanced",
    cinematic: { caseNumber: p?.cinematic?.caseNumber ?? "", kicker: p?.cinematic?.kicker ?? "", lines: p?.cinematic?.lines ?? [] },
  };
}

/** Public, client-safe projection of the event configuration. */
export interface EventView {
  id: string;
  name: string;
  tagline: string;
  organizer: string;
  /** Navigation sections ("case", "live"). */
  modes: string[];
  /** Challenge families present in the event (leaderboard breakdown columns). */
  families: string[];
  phase: "standby" | "live" | "paused" | "ended";
  frozen: boolean;
  startsAt: string | null;
  endsAt: string | null;
  rulesMd: string;
  theme: { accent: string; secondary: string; codename?: string; bootLines: string[]; logo?: string };
  presentation: PresentationView;
  hunt: { title: string; introMd: string };
  ctfCategories: { id: string; name: string; description: string }[];
  registration: { open: boolean; requiresCode: boolean; minMembers: number; maxMembers: number };
}

export function eventView(e: EventRow): EventView {
  const c = e.config as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- validated at import
  return {
    id: e.id,
    name: e.name,
    tagline: c.tagline ?? "",
    organizer: c.organizer ?? "",
    modes: c.modes ?? [],
    families: c.families ?? c.modes ?? [],
    phase: eventPhase(e),
    frozen: Boolean(freezeInstant(e)),
    startsAt: e.startsAt?.toISOString() ?? null,
    endsAt: e.endsAt?.toISOString() ?? null,
    rulesMd: c.rules_md ?? "",
    theme: { accent: c.theme?.accent ?? "green", secondary: c.theme?.secondary ?? "cyan", codename: c.theme?.codename, bootLines: c.theme?.boot_lines ?? [], logo: c.theme?.logo },
    presentation: presentationOf(e),
    hunt: { title: c.hunt?.title ?? "Hunt", introMd: c.hunt?.intro_md ?? "" },
    ctfCategories: c.ctf?.categories ?? [],
    registration: {
      open: c.registration?.open !== false,
      requiresCode: Boolean(c.registration?.requiresCode),
      minMembers: c.registration?.min_members ?? 1,
      maxMembers: c.registration?.max_members ?? 4,
    },
  };
}

export function logoUrl(e: EventRow, subject = "public"): string | null {
  const logo = (e.config as { theme?: { logo?: string } }).theme?.logo;
  return logo ? signedAssetUrl(e.id, logo, subject, 60 * 60) : null;
}
