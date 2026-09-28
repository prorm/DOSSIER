"use client";

import { useEffect, useState } from "react";

/**
 * Tracks which ids this browser has already seen as "open". Ids that are open
 * now but were not open on the previous visit are "fresh" — used for the unlock
 * reveal (a one-time decrypt + glow). The first visit marks everything seen.
 */
export function useFresh(scope: string, openIds: string[]): Set<string> {
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const key = `dossier.seen.${scope}`;
  const joined = openIds.join("|");
  useEffect(() => {
    let seen: string[] | null = null;
    try {
      seen = JSON.parse(localStorage.getItem(key) ?? "null") as string[] | null;
    } catch {
      seen = null;
    }
    const ids = joined ? joined.split("|") : [];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot, hydration-safe read of localStorage (an external store)
    if (seen) setFresh(new Set(ids.filter((id) => !seen!.includes(id))));
    try {
      localStorage.setItem(key, JSON.stringify(Array.from(new Set([...(seen ?? []), ...ids]))));
    } catch {
      /* storage unavailable */
    }
  }, [key, joined]);
  return fresh;
}
