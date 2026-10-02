"use client";

import { Command as CommandIcon, Crosshair, LogOut, Map as MapIcon, Menu, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { Opening, type OpeningPayload } from "@/components/experience/cinematic/opening";
import { playCue, setSoundEnabled, useSoundEnabled } from "@/components/experience/sound";
import { useTheme } from "@/components/experience/theme-provider";
import { UniverseBackdrop, UniverseProvider, useUniverse } from "@/components/experience/universe/universe-stage";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { clearOpeningSeen } from "@/lib/experience/cinematic";
import type { UniverseInput } from "@/lib/experience/universe";
import { teamDressing } from "@/lib/experience/variation";
import { playNav, type NavItem } from "@/lib/modes";
import { cn } from "@/lib/utils";
import { AnnouncementToaster } from "./announcement-toaster";
import { CommandPalette } from "./command-palette";
import { EffectsBoot } from "./effects";
import { HudScore } from "./hud-score";
import { PhaseBanner, PhaseChip, type Phase } from "./phase";
import { Kbd } from "./primitives";
import { RealtimeProvider, useConnectionState } from "./realtime";

export interface PlayShellProps {
  children: ReactNode;
  eventId: string;
  eventName: string;
  codename?: string;
  logoUrl?: string | null;
  teamName: string;
  /** Show the Field (physical checkpoints) section. */
  field: boolean;
  phase: Phase;
  frozen: boolean;
  startsAt?: string | null;
  disqualified?: string | null;
  hud: { score: number; rank: number | null; teams: number };
  universe: { input: UniverseInput; fingerprint: string; layoutSeed: string };
  opening: OpeningPayload | null;
  /** The organiser's accent colour name (green | cyan | magenta | amber). */
  accent: string;
}

/** How the map is drawn, and where it is looking: in the team menu, so it is never hidden under the header. */
function ViewItems() {
  const u = useUniverse();
  return (
    <>
      {u.can3d ? (
        <DropdownMenuItem onSelect={() => u.setRenderer(u.renderer === "3d" ? "2d" : "3d")}>
          <MapIcon /> {u.renderer === "3d" ? "Flat map instead of 3D" : "Show the map in 3D"}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onSelect={u.recenter}>
        <Crosshair /> Recentre the map
      </DropdownMenuItem>
    </>
  );
}

function ConnectionDot() {
  const state = useConnectionState();
  const label = state === "live" ? "Live link" : state === "polling" ? "Polling" : state === "offline" ? "Offline" : "Connecting";
  const tone = state === "live" ? "bg-signal-green" : state === "polling" ? "bg-signal-amber" : state === "offline" ? "bg-signal-magenta" : "bg-mute";
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-mute" role="status" aria-label={`Realtime: ${label}`}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", tone, state !== "live" && "animate-pulse-dot")} />
      {/* The phase chip already says LIVE; the link only speaks up when it is degraded. */}
      {state === "polling" || state === "offline" ? <span className="hidden lg:inline">{label}</span> : null}
    </span>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/play" ? pathname === "/play" : pathname === href || pathname.startsWith(`${href}/`);
}

/* ─────────────────────────── navigation, four ways ─────────────────────────── */

/** BLACKSITE: an icon rail down the left edge, like a control deck. */
function NavRail({ nav, pathname }: { nav: NavItem[]; pathname: string }) {
  return (
    <nav aria-label="Sections" className="fixed top-14 bottom-0 left-0 z-40 hidden w-[68px] flex-col items-center gap-1 border-r border-line bg-[color-mix(in_srgb,var(--color-bg)_84%,transparent)] py-4 backdrop-blur-md md:flex">
      {nav.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            aria-label={n.label}
            className={cn(
              "group relative flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-sm font-mono text-[0.5rem] uppercase tracking-[0.12em] transition-colors",
              active ? "bg-raised text-ink before:absolute before:top-2 before:bottom-2 before:-left-[10px] before:w-0.5 before:bg-[var(--accent)]" : "text-mute hover:bg-raised/60 hover:text-ink",
            )}
          >
            <n.icon className="size-[18px]" aria-hidden="true" />
            <span>{n.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** NEURAL ARCHIVE: a floating pill dock; only the active destination spells itself out. */
function NavDock({ nav, pathname }: { nav: NavItem[]; pathname: string }) {
  return (
    <nav
      aria-label="Sections"
      className="panel fixed bottom-5 left-1/2 z-40 hidden -translate-x-1/2 items-center gap-1 !rounded-full !p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] md:flex"
    >
      {nav.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            aria-label={n.label}
            className={cn("flex h-11 items-center gap-2 rounded-full px-3.5 text-[0.8rem] transition-all duration-300", active ? "bg-[color-mix(in_srgb,var(--brand)_22%,transparent)] pr-4 text-ink" : "text-mute hover:text-ink")}
          >
            <n.icon className="size-[18px]" aria-hidden="true" />
            {active ? <span className="font-sans font-medium">{n.label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** COLD CASE: folder tabs. The active file sits forward, the others are filed behind it. */
function NavTabs({ nav, pathname }: { nav: NavItem[]; pathname: string }) {
  return (
    <nav aria-label="Sections" className="mx-auto hidden max-w-6xl px-4 md:block">
      <ul className="flex items-end gap-1 pt-1">
        {nav.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <li key={n.href} className={cn(active ? "relative z-10" : "translate-y-[3px]")}>
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 border border-b-0 px-4 font-mono text-[0.72rem] uppercase tracking-[0.1em] transition-all",
                  active ? "h-10 border-line-strong bg-surface text-ink shadow-[0_-3px_8px_-4px_rgba(60,40,10,0.35)]" : "h-8 border-line bg-raised text-mute hover:h-9 hover:text-ink",
                )}
                style={{ borderRadius: "6px 6px 0 0" }}
              >
                <n.icon className="size-3.5" aria-hidden="true" />
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** SIGNAL: a tuning strip on the right edge; the active channel is where the needle sits. */
function NavTuner({ nav, pathname }: { nav: NavItem[]; pathname: string }) {
  return (
    <nav aria-label="Sections" className="fixed top-14 right-0 bottom-0 z-40 hidden w-[58px] border-l border-line bg-[color-mix(in_srgb,var(--color-bg)_84%,transparent)] backdrop-blur-md md:block">
      <ul className="flex h-full flex-col justify-center">
        {nav.map((n, i) => {
          const active = isActive(pathname, n.href);
          return (
            <li key={n.href} className="relative">
              <Link href={n.href} aria-current={active ? "page" : undefined} aria-label={n.label} className={cn("relative flex h-[76px] flex-col items-center justify-center gap-2 font-display text-[0.6rem] uppercase tracking-[0.22em] transition-colors", active ? "text-signal" : "text-mute hover:text-ink")}>
                <n.icon className="size-4" aria-hidden="true" />
                <span className="[writing-mode:vertical-rl]">{n.short}</span>
                {active ? <span aria-hidden="true" className="absolute top-1/2 left-0 h-px w-5 -translate-y-1/2 bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" /> : null}
              </Link>
              {i < nav.length - 1 ? <span aria-hidden="true" className="mx-auto block h-px w-4 bg-line-strong" /> : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MobileBar({ nav, pathname }: { nav: NavItem[]; pathname: string }) {
  return (
    <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[color-mix(in_srgb,var(--color-bg)_90%,transparent)] pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md md:hidden">
      <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
        {nav.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 font-mono text-[0.58rem] uppercase tracking-[0.1em]",
                  active ? "text-signal before:absolute before:inset-x-3 before:top-0 before:h-0.5 before:bg-[var(--accent)]" : "text-mute active:text-ink",
                )}
              >
                <n.icon className="size-5" aria-hidden="true" />
                {n.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ─────────────────────────── the shell ─────────────────────────── */

export function PlayShell(p: PlayShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const [palette, setPalette] = useState(false);
  const sound = useSoundEnabled();
  const nav = useMemo(() => playNav({ field: p.field }), [p.field]);
  const dress = useMemo(() => teamDressing(p.universe.fingerprint), [p.universe.fingerprint]);
  const refreshOn = useMemo(() => ["state", "board", "checkpoint", "event-status", "content", "status", "team-changed", "reconnected"], []);
  const onUniverse = pathname === "/play" || pathname === "/play/map";
  const posture = pathname === "/play/map" ? "overview" : "focus";
  const navStyle = theme.nav;

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.push("/login");
    router.refresh();
  };

  return (
    <RealtimeProvider streamUrl="/api/stream?scope=team" pollUrl="/api/play/state" refreshOn={refreshOn}>
      <EffectsBoot />
      <UniverseProvider input={p.universe.input} fingerprint={p.universe.fingerprint} layoutSeed={p.universe.layoutSeed} posture={posture} accent={p.accent}>
        {p.opening ? <Opening payload={p.opening} /> : null}
        <div className="shell relative flex min-h-dvh flex-col" data-nav={navStyle} data-universe={onUniverse ? "true" : "false"}>
          {onUniverse ? <UniverseBackdrop fixed labels={posture === "focus"} /> : null}
          {onUniverse && posture === "focus" ? (
            <>
              {/* Scrims: the scene stays visible, the instruments stay legible. */}
              <div aria-hidden="true" className="pointer-events-none fixed inset-y-0 left-0 z-[5] hidden w-[min(560px,90vw)] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-bg)_95%,transparent)_0%,color-mix(in_srgb,var(--color-bg)_84%,transparent)_62%,transparent_100%)] md:block" />
              <div aria-hidden="true" className="pointer-events-none fixed inset-y-0 right-0 z-[5] hidden w-[min(460px,90vw)] bg-[linear-gradient(270deg,color-mix(in_srgb,var(--color-bg)_90%,transparent)_0%,color-mix(in_srgb,var(--color-bg)_58%,transparent)_55%,transparent_100%)] md:block" />
              <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-[5] h-[75dvh] bg-[linear-gradient(0deg,var(--color-bg)_0%,color-mix(in_srgb,var(--color-bg)_88%,transparent)_45%,transparent_100%)] md:hidden" />
            </>
          ) : null}

          {/* ── Top bar ── */}
          <header className={cn("sticky top-0 z-40 border-b border-line", onUniverse ? "hud-glass" : "bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] backdrop-blur-md supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--color-bg)_72%,transparent)]")}>
            <div className={cn("mx-auto flex h-14 items-center gap-3 px-4", navStyle === "rail" || navStyle === "tuner" ? "max-w-none md:px-6" : "max-w-6xl", navStyle === "rail" && "md:pl-[84px]", navStyle === "tuner" && "md:pr-[74px]")}>
              <Link href="/play" className="flex min-w-0 items-center gap-2.5 rounded-xs" aria-label={`${p.eventName} — console home`}>
                {p.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.logoUrl} alt="" width={28} height={28} className="size-7 shrink-0" />
                ) : (
                  <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-xs border border-[var(--accent)] font-display text-xs font-bold text-signal">
                    D
                  </span>
                )}
                <span className="hidden min-w-0 flex-col leading-tight sm:flex">
                  <span className="truncate font-display text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-ink">{p.eventName}</span>
                  <span className="truncate font-mono text-[0.6rem] uppercase tracking-[0.14em] text-faint">
                    {p.teamName} · {dress.callsign}
                  </span>
                </span>
              </Link>
              <PhaseChip phase={p.phase} frozen={p.frozen} />
              <div className="ml-auto flex items-center gap-2 sm:gap-4">
                <ConnectionDot />
                <HudScore initial={p.hud} />
                <Button variant="outline" size="sm" className="hidden gap-2 md:inline-flex" onClick={() => setPalette(true)} aria-label="Open command palette">
                  <CommandIcon className="size-3.5" />
                  <span className="text-mute">Search</span>
                  <Kbd>⌘K</Kbd>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Team menu">
                      <Menu />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuLabel className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-mute">
                      {p.teamName} · {dress.callsign}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setPalette(true)}>
                      <CommandIcon /> Command palette
                    </DropdownMenuItem>
                    <ViewItems />
                    <DropdownMenuItem
                      onSelect={() => {
                        setSoundEnabled(!sound);
                        if (!sound) setTimeout(() => playCue("confirm", theme.sound), 80);
                      }}
                    >
                      {sound ? <VolumeX /> : <Volume2 />} {sound ? "Sound off" : "Sound on"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        clearOpeningSeen(p.eventId, p.teamName);
                        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload is the point: the server picks the opening from the boot cookie
                        window.location.assign("/play");
                      }}
                    >
                      Replay the opening
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={logout} className="text-signal-magenta focus:text-signal-magenta">
                      <LogOut /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {navStyle === "tabs" ? <NavTabs nav={nav} pathname={pathname} /> : null}
          </header>

          <PhaseBanner phase={p.phase} frozen={p.frozen} disqualified={p.disqualified} startsAt={p.startsAt} />

          {navStyle === "rail" ? <NavRail nav={nav} pathname={pathname} /> : null}
          {navStyle === "dock" ? <NavDock nav={nav} pathname={pathname} /> : null}
          {navStyle === "tuner" ? <NavTuner nav={nav} pathname={pathname} /> : null}

          <main
            id="main"
            className={cn(
              "relative z-10 w-full flex-1",
              onUniverse ? "pointer-events-none px-4 pt-4 pb-28 md:px-6" : "mx-auto max-w-6xl px-4 pt-6 pb-28 md:pb-12",
              navStyle === "rail" && "md:pl-[92px]",
              navStyle === "tuner" && "md:pr-[80px]",
              navStyle === "dock" && "md:pb-28",
            )}
          >
            {p.children}
          </main>

          <MobileBar nav={nav} pathname={pathname} />
        </div>
      </UniverseProvider>
      <CommandPalette nav={nav} open={palette} onOpenChange={setPalette} />
      <AnnouncementToaster />
    </RealtimeProvider>
  );
}
