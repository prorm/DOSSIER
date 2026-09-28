import { Binary, Crosshair, FolderSearch, Home, MapPinned, Trophy, type LucideIcon } from "lucide-react";

export type ModeId = "hunt" | "ctf" | "inquest" | "live";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  mode?: ModeId;
}

/** Team navigation. Only modes enabled by the pack are shown. */
export function playNav(modes: ModeId[], labels: Partial<Record<ModeId, string>> = {}): NavItem[] {
  const items: NavItem[] = [{ href: "/play", label: "Console", short: "Home", icon: Home }];
  if (modes.includes("hunt")) items.push({ href: "/play/hunt", label: labels.hunt ?? "Hunt", short: "Hunt", icon: Crosshair, mode: "hunt" });
  if (modes.includes("ctf")) items.push({ href: "/play/ctf", label: "CTF", short: "CTF", icon: Binary, mode: "ctf" });
  if (modes.includes("inquest")) items.push({ href: "/play/inquest", label: "Case File", short: "Case", icon: FolderSearch, mode: "inquest" });
  if (modes.includes("live")) items.push({ href: "/play/live", label: "Checkpoints", short: "Live", icon: MapPinned, mode: "live" });
  items.push({ href: "/play/leaderboard", label: "Leaderboard", short: "Ranks", icon: Trophy });
  return items;
}

export const MODE_LABEL: Record<"hunt" | "ctf" | "inquest", string> = { hunt: "Hunt", ctf: "CTF", inquest: "Inquest" };

export function challengeHref(id: string) {
  return `/play/challenge/${encodeURIComponent(id)}`;
}
