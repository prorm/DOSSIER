"use client";

import { Command as CommandIcon, LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { playNav, type ModeId } from "@/lib/modes";
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
  eventName: string;
  codename?: string;
  logoUrl?: string | null;
  teamName: string;
  modes: ModeId[];
  huntTitle?: string;
  phase: Phase;
  frozen: boolean;
  startsAt?: string | null;
  disqualified?: string | null;
  hud: { score: number; rank: number | null; teams: number };
}

function ConnectionDot() {
  const state = useConnectionState();
  const label = state === "live" ? "Live link" : state === "polling" ? "Polling" : state === "offline" ? "Offline" : "Connecting";
  const tone = state === "live" ? "bg-signal-green" : state === "polling" ? "bg-signal-amber" : state === "offline" ? "bg-signal-magenta" : "bg-mute";
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-mute" role="status" aria-label={`Realtime: ${label}`}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", tone, state !== "live" && "animate-pulse-dot")} />
      <span className="hidden lg:inline">{label}</span>
    </span>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/play" ? pathname === "/play" : pathname === href || pathname.startsWith(`${href}/`);
}

export function PlayShell(p: PlayShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [palette, setPalette] = useState(false);
  const nav = useMemo(() => playNav(p.modes, { hunt: p.huntTitle }), [p.modes, p.huntTitle]);
  const refreshOn = useMemo(() => ["solve", "checkpoint", "accusation", "event-status", "content", "status", "team-changed", "reconnected"], []);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.push("/login");
    router.refresh();
  };

  return (
    <RealtimeProvider streamUrl="/api/stream?scope=team" pollUrl="/api/play/state" refreshOn={refreshOn}>
      <EffectsBoot />
      <div className="flex min-h-dvh flex-col">
        {/* ── Top bar ── */}
        <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] backdrop-blur-md supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--color-bg)_72%,transparent)]">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
            <Link href="/play" className="flex min-w-0 items-center gap-2.5 rounded-xs" aria-label={`${p.eventName} — console home`}>
              {p.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.logoUrl} alt="" width={28} height={28} className="size-7 shrink-0" />
              ) : (
                <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-xs border border-[var(--accent)] font-mono text-xs font-bold text-signal">
                  D
                </span>
              )}
              <span className="hidden min-w-0 flex-col leading-tight sm:flex">
                <span className="truncate font-mono text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-ink">{p.eventName}</span>
                <span className="truncate font-mono text-[0.62rem] uppercase tracking-[0.14em] text-faint">{p.teamName}</span>
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
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-mute">{p.teamName}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setPalette(true)}>
                    <CommandIcon /> Command palette
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={logout} className="text-signal-magenta focus:text-signal-magenta">
                    <LogOut /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {/* Desktop mode rail */}
          <nav aria-label="Sections" className="mx-auto hidden max-w-6xl px-2 md:block">
            <ul className="flex">
              {nav.map((n) => {
                const active = isActive(pathname, n.href);
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex h-10 items-center gap-2 px-3 font-mono text-[0.7rem] uppercase tracking-[0.12em] transition-colors",
                        active ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-[var(--accent)]" : "text-mute hover:text-ink",
                      )}
                    >
                      <n.icon className="size-3.5" aria-hidden="true" />
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </header>

        <PhaseBanner phase={p.phase} frozen={p.frozen} disqualified={p.disqualified} startsAt={p.startsAt} />

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:pb-12">
          {p.children}
        </main>

        {/* Mobile tab bar: thumb-reachable, safe-area aware */}
        <nav
          aria-label="Sections"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md md:hidden"
        >
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
      </div>
      <CommandPalette nav={nav} open={palette} onOpenChange={setPalette} />
      <AnnouncementToaster />
    </RealtimeProvider>
  );
}
