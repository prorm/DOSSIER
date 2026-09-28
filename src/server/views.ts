import type { EventRow } from "./engine/types";
import { eventPhase, freezeInstant } from "./engine/event";
import { signedAssetUrl } from "./assets/sign";

/** Public, client-safe projection of the event configuration. */
export interface EventView {
  id: string;
  name: string;
  tagline: string;
  organizer: string;
  modes: ("hunt" | "ctf" | "inquest" | "live")[];
  phase: "standby" | "live" | "paused" | "ended";
  frozen: boolean;
  startsAt: string | null;
  endsAt: string | null;
  rulesMd: string;
  theme: { accent: string; secondary: string; codename?: string; bootLines: string[]; logo?: string };
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
    phase: eventPhase(e),
    frozen: Boolean(freezeInstant(e)),
    startsAt: e.startsAt?.toISOString() ?? null,
    endsAt: e.endsAt?.toISOString() ?? null,
    rulesMd: c.rules_md ?? "",
    theme: { accent: c.theme?.accent ?? "green", secondary: c.theme?.secondary ?? "cyan", codename: c.theme?.codename, bootLines: c.theme?.boot_lines ?? [], logo: c.theme?.logo },
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
