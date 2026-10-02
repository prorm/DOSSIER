"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import DecryptedText from "@/components/reactbits/DecryptedText";
import { BOOT_COOKIE } from "@/lib/boot";
import { cn } from "@/lib/utils";
import { useIsClient } from "./effects";


const BASE_LINES = ["establishing uplink", "verifying session", "syncing scoreboard"];

/**
 * ~2s skippable boot sequence. Rendered visible from the server (no flash) only
 * when the boot cookie is absent; any key, click or tap skips it instantly.
 * Hidden entirely for reduced-motion users (CSS) and with effects turned off.
 */
export function BootSequence({ eventName, codename, lines = [] }: { eventName: string; codename?: string; lines?: string[] }) {
  const [phase, setPhase] = useState<"running" | "leaving" | "done">("running");
  const [shown, setShown] = useState(0);
  const all = useMemo(() => [...BASE_LINES.map((l) => `${l} ${".".repeat(Math.max(3, 26 - l.length))} ok`), ...lines].slice(0, 6), [lines]);
  const client = useIsClient();
  const suppressed =
    client && (document.documentElement.classList.contains("effects-off") || window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const finish = useCallback(() => {
    document.cookie = `${BOOT_COOKIE}=1; path=/; samesite=lax`;
    setPhase((p) => (p === "running" ? "leaving" : p));
  }, []);

  useEffect(() => {
    // Seen once is enough: navigating away mid-sequence must not replay it on the next page.
    document.cookie = `${BOOT_COOKIE}=1; path=/; samesite=lax`;
    if (suppressed) return;
    const step = setInterval(() => setShown((n) => n + 1), 230);
    const end = setTimeout(finish, 2000);
    const skip = () => finish();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      clearInterval(step);
      clearTimeout(end);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [finish, suppressed]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const t = setTimeout(() => setPhase("done"), 260);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "done" || suppressed) return null;
  const progress = Math.min(100, Math.round((shown / (all.length + 2)) * 100));

  return (
    <div
      role="presentation"
      className={cn(
        "boot-overlay fixed inset-0 z-[90] flex items-center justify-center bg-bg px-6 transition-opacity duration-250 motion-reduce:hidden [.effects-off_&]:hidden",
        phase === "leaving" && "pointer-events-none opacity-0",
      )}
    >
      <div aria-hidden="true" className="grid-bg absolute inset-0 opacity-30 [mask-image:radial-gradient(55%_55%_at_50%_50%,#000,transparent)]" />
      <div className="relative w-full max-w-md font-mono">
        <div className="mb-6 flex items-center justify-between text-[0.68rem] uppercase tracking-[0.14em] text-mute">
          <span>
            DOSSIER <span className="text-faint">{"//"}</span> {codename ?? "BOOT"}
          </span>
          <button type="button" onClick={finish} className="rounded-xs border border-line-strong px-2 py-1 text-ink-dim hover:border-[var(--accent)] hover:text-ink">
            Skip ›
          </button>
        </div>
        <ul className="min-h-[9.5rem] space-y-1.5 text-[0.78rem] text-ink-dim" aria-hidden="true">
          {all.slice(0, shown).map((l, i) => (
            <li key={i} className="animate-reveal-up truncate">
              <span className="text-signal">›</span> {l}
            </li>
          ))}
          {shown < all.length ? (
            <li>
              <span className="animate-blink text-signal">▌</span>
            </li>
          ) : null}
        </ul>
        <div className="mt-4 h-1 w-full overflow-hidden bg-raised" aria-hidden="true">
          <div className="h-full bg-signal transition-[width] duration-200 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-6 text-xl font-semibold uppercase tracking-[0.08em] text-ink sm:text-2xl">
          <DecryptedText text={eventName} animateOn="mount" sequential speed={28} revealDirection="start" encryptedClassName="text-signal/70" />
        </p>
      </div>
    </div>
  );
}
