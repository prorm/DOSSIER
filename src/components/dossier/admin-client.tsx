"use client";

import {
  Activity,
  Boxes,
  ClipboardList,
  FileSearch,
  Flag,
  LogOut,
  MapPinned,
  Menu,
  Clapperboard,
  Monitor,
  Radar,
  Settings2,
  ShieldAlert,
  Users,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { EffectsBoot } from "./effects";
import { PhaseChip, type Phase } from "./phase";
import { RealtimeProvider, useConnectionState, useRealtime } from "./realtime";

interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  owner?: boolean;
}

const NAV: AdminNavItem[] = [
  { href: "/admin", label: "Control room", icon: Activity },
  { href: "/admin/event", label: "Event control", icon: Settings2 },
  { href: "/studio", label: "Studio", icon: Clapperboard },
  { href: "/admin/challenges", label: "Challenges", icon: Flag },
  { href: "/admin/teams", label: "Teams", icon: Users },
  { href: "/admin/submissions", label: "Submissions", icon: FileSearch },
  { href: "/admin/signals", label: "Signals", icon: ShieldAlert },
  { href: "/admin/checkpoints", label: "Checkpoints", icon: MapPinned },
  { href: "/admin/packs", label: "Packs", icon: Boxes },
  { href: "/admin/staff", label: "Staff", icon: UserCog, owner: true },
  { href: "/admin/audit", label: "Audit log", icon: ClipboardList },
];

function NavList({ role, onNavigate }: { role: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {NAV.filter((n) => !n.owner || role === "owner").map((n) => {
        const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-sm px-2.5 font-mono text-[0.72rem] uppercase tracking-[0.1em]",
                active ? "bg-raised text-ink shadow-[inset_2px_0_0_var(--accent)]" : "text-mute hover:bg-raised/60 hover:text-ink",
              )}
            >
              <n.icon className="size-4" aria-hidden="true" /> {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function LinkState() {
  const s = useConnectionState();
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-mute" role="status">
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", s === "live" ? "bg-signal-green" : s === "polling" ? "bg-signal-amber" : "bg-signal-magenta")} />
      {/* The phase chip says LIVE; the link names itself only when it is degraded. */}
      {s === "live" ? <span className="sr-only">link live</span> : s}
    </span>
  );
}

/** Operations console shell: sidebar on desktop, sheet on mobile, live link to the event. */
export function AdminShell({ children, staff, eventName, phase, frozen }: { children: ReactNode; staff: { email: string; role: string }; eventName: string | null; phase: Phase | null; frozen: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const logout = async () => {
    await api("/api/staff/logout", { method: "POST", body: {} }).catch(() => {});
    router.push("/staff/login");
  };
  return (
    <RealtimeProvider streamUrl="/api/stream?scope=staff" pollUrl="/api/admin/pulse" refreshOn={["event-status"]}>
      <EffectsBoot />
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface p-3 lg:flex">
          <div className="mb-4 px-1.5 pt-1">
            <p className="font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em]">DOSSIER · Ops</p>
            <p className="truncate font-mono text-[0.62rem] uppercase tracking-[0.12em] text-faint">{eventName ?? "no active event"}</p>
          </div>
          <nav aria-label="Admin">
            <NavList role={staff.role} />
          </nav>
          <div className="mt-auto space-y-2 border-t border-line px-1.5 pt-3">
            <Link href="/display" target="_blank" className="flex items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-mute hover:text-ink">
              <Monitor className="size-3.5" aria-hidden="true" /> Projector view
            </Link>
            <Link href="/volunteer" className="flex items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-mute hover:text-ink">
              <Radar className="size-3.5" aria-hidden="true" /> Station console
            </Link>
            <p className="truncate font-mono text-[0.62rem] text-faint">
              {staff.email} · {staff.role}
            </p>
            <Button size="xs" variant="ghost" onClick={logout} className="-ml-2">
              <LogOut /> Sign out
            </Button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-line bg-[color-mix(in_srgb,var(--color-bg)_85%,transparent)] px-4 backdrop-blur">
            <Button size="icon-sm" variant="ghost" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
              <Menu />
            </Button>
            <span className="truncate font-mono text-[0.72rem] uppercase tracking-[0.12em] text-ink-dim lg:hidden">{eventName ?? "DOSSIER"}</span>
            {phase ? <PhaseChip phase={phase} frozen={frozen} /> : null}
            <span className="ml-auto">
              <LinkState />
            </span>
          </header>
          <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6">
            {children}
          </main>
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-3">
          <SheetHeader>
            <SheetTitle>Operations</SheetTitle>
          </SheetHeader>
          <nav aria-label="Admin" className="px-1">
            <NavList role={staff.role} onNavigate={() => setOpen(false)} />
          </nav>
          <Button size="sm" variant="ghost" onClick={logout} className="mt-4">
            <LogOut /> Sign out
          </Button>
        </SheetContent>
      </Sheet>
    </RealtimeProvider>
  );
}

/** Re-renders the current server page on selected realtime signals, at most once per `minMs`. */
export function LiveRefresh({ types, minMs = 4000 }: { types: string[]; minMs?: number }) {
  const router = useRouter();
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useRealtime(() => {
    const wait = Math.max(0, last.current + minMs - Date.now());
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      last.current = Date.now();
      router.refresh();
    }, wait);
  }, types);
  useEffect(() => () => clearTimeout(timer.current), []);
  return null;
}

/** Hook for admin mutations: loading + error + success message, then refresh. */
export function useAction<T = unknown>() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = useCallback(
    async (path: string, body: unknown, opts: { method?: string; success?: string | ((r: T) => string); refresh?: boolean } = {}) => {
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        const r = await api<T>(path, { method: opts.method ?? "POST", body });
        setMessage(typeof opts.success === "function" ? opts.success(r) : (opts.success ?? "Done."));
        if (opts.refresh !== false) router.refresh();
        return r;
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Request failed.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );
  return { run, busy, error, message, setMessage, setError };
}

export function ActionFeedback({ error, message }: { error: string | null; message: string | null }) {
  if (!error && !message) return null;
  return (
    <p role={error ? "alert" : "status"} className={cn("font-mono text-xs", error ? "text-signal-magenta" : "text-signal-green")}>
      {error ?? message}
    </p>
  );
}
