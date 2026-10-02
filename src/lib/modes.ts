import { FolderSearch, Home, MapPinned, Network, Trophy, Workflow, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
}

/** Team navigation. The investigation is one world: map, case file, board, field, standings. */
export function playNav(opts: { field: boolean }): NavItem[] {
  const items: NavItem[] = [
    { href: "/play", label: "Console", short: "Home", icon: Home },
    { href: "/play/map", label: "Case map", short: "Map", icon: Workflow },
    { href: "/play/case", label: "Case file", short: "Case", icon: FolderSearch },
    { href: "/play/board", label: "Board", short: "Board", icon: Network },
  ];
  if (opts.field) items.push({ href: "/play/live", label: "Field", short: "Field", icon: MapPinned });
  items.push({ href: "/play/leaderboard", label: "Leaderboard", short: "Ranks", icon: Trophy });
  return items;
}

export const FAMILY_LABEL: Record<string, string> = {
  cryptic: "Cryptic",
  browser: "Browser",
  forensics: "Forensics",
  ctf: "Technical",
  osint: "OSINT",
  inquest: "Inquest",
  physical: "Field",
  final: "Final",
  custom: "Special",
  hunt: "Hunt",
};

export const TIER_LABEL: Record<string, string> = {
  intro: "Intro",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
  nightmare: "Nightmare",
  final: "Final",
};

export function nodeHref(id: string) {
  return `/play/node/${encodeURIComponent(id)}`;
}

/** @deprecated kept for older links; nodes live at /play/node/:id. */
export const challengeHref = nodeHref;
