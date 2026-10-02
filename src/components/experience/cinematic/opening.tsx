"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { useMotion } from "@/components/experience/motion";
import { useTheme } from "@/components/experience/theme-provider";
import { BOOT_COOKIE } from "@/lib/boot";
import { ctaLabel, markOpeningSeen, openingModeFor, resolveOpening, type CinematicVars, type OpeningMode } from "@/lib/experience/cinematic";
import { withAccent } from "@/lib/experience/themes";
import { teamDressing } from "@/lib/experience/variation";

const OpeningPlayer = dynamic(() => import("./opening-player"), { ssr: false });

/** Everything an opening may quote – all of it real, all of it serialisable. */
export interface OpeningPayload {
  eventId: string;
  accent: string;
  vars: CinematicVars;
}

export function finishOpening(payload: OpeningPayload) {
  document.cookie = `${BOOT_COOKIE}=1; path=/; samesite=lax`;
  markOpeningSeen(payload.eventId, payload.vars.teamName);
}

/**
 * The first moments of the event. The server renders this only when the player
 * has not booted in this browser session (no boot cookie), and it renders a
 * calm themed cover straight away – no flash of the game before the sequence.
 * The client then decides which opening this is:
 *   first      the full data-driven sequence
 *   returning  a 1.5 s reacquire (they have seen it before)
 *   reduced    a still title card, no motion
 * and hands over to the (lazily loaded) player.
 */
export function Opening({ payload }: { payload: OpeningPayload }) {
  const base = useTheme();
  const theme = useMemo(() => withAccent(base, payload.accent), [base, payload.accent]);
  const motion = useMotion();
  const [mode, setMode] = useState<OpeningMode | null | undefined>(undefined);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Read the preferences directly: the motion store still reports its server snapshot on the hydration commit.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let off = false;
    try {
      off = window.localStorage.getItem("dossier.effects") === "off";
    } catch {
      /* private mode */
    }
    const m = openingModeFor(payload.eventId, payload.vars.teamName, reduced || off);
    if (m === null) finishOpening(payload);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decided once on mount from localStorage / matchMedia: it must not differ between the server render and the first client render
    setMode(m);
    // Decide once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gone || mode === null) return null;
  if (mode === undefined) {
    // Server / hydration frame: the cover.
    const d = teamDressing(payload.vars.fingerprint);
    return (
      <div className="opening opening-cover" data-theme-cover={theme.id} aria-hidden="true">
        <p className="font-display text-xs tracking-[0.3em] uppercase text-mute">{payload.vars.caseNumber} · {d.dossierNo}</p>
      </div>
    );
  }
  const script = resolveOpening(theme.id, mode, payload.vars);
  return (
    <OpeningPlayer
      script={script}
      theme={theme}
      cta={ctaLabel(theme.id)}
      vars={payload.vars}
      canScene={motion.webgl && motion.effects && !motion.lean}
      tier={motion.tier}
      onDone={() => {
        finishOpening(payload);
        setGone(true);
      }}
    />
  );
}
