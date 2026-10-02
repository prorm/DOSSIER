"use client";

import type { UniverseInput } from "@/lib/experience/universe";
import { UniverseBackdrop, UniverseProvider } from "@/components/experience/universe/universe-stage";

/**
 * The case, seen from outside: the landing and sign-in pages sit in front of the
 * event's own universe — every file a classified silhouette, in the event's own
 * theme — so the first thing an attendee sees is the world they are about to enter.
 * Purely atmospheric: it is fed the spoiler-free teaser projection and is not interactive.
 */
export function FrontBackdrop({ input, fingerprint, layoutSeed, accent, shift = 0, veil = "left" }: { input: UniverseInput; fingerprint: string; layoutSeed: string; accent: string; shift?: number; veil?: "left" | "centre" | "showcase" }) {
  return (
    <UniverseProvider input={input} fingerprint={fingerprint} layoutSeed={layoutSeed} mode="player" posture="overview" accent={accent}>
      <UniverseBackdrop hud={false} labels={false} acts={false} list={false} fixed shift={shift} interactive={false} />
      <div className={`front-veil is-${veil}`} aria-hidden="true" />
    </UniverseProvider>
  );
}
