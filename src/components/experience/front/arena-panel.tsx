"use client";

import type { UniverseInput } from "@/lib/experience/universe";
import { UniverseBackdrop, UniverseProvider } from "@/components/experience/universe/universe-stage";
import { cn } from "@/lib/utils";

/**
 * The case as a public screen shows it: silhouettes that light up as teams open them. Fed the arena
 * projection (solve counts only), so a projector can show progress without showing a single clue.
 */
export function ArenaPanel({ input, fingerprint, layoutSeed, accent, solved, files, className }: { input: UniverseInput; fingerprint: string; layoutSeed: string; accent: string; solved: number; files: number; className?: string }) {
  return (
    <figure className={cn("arena", className)}>
      <UniverseProvider input={input} fingerprint={fingerprint} layoutSeed={layoutSeed} mode="player" posture="overview" accent={accent}>
        <UniverseBackdrop hud={false} labels={false} list={false} interactive={false} intro={false} />
      </UniverseProvider>
      <figcaption>
        <b className="num">{solved}</b> / <span className="num">{files}</span> files open
      </figcaption>
    </figure>
  );
}
