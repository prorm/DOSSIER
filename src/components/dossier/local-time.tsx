"use client";

import { useIsClient } from "./effects";

const PRESETS = {
  time: { hour: "2-digit", minute: "2-digit" },
  "day-time": { weekday: "short", hour: "2-digit", minute: "2-digit" },
  full: { dateStyle: "medium", timeStyle: "short" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

/**
 * Times are always shown in the *viewer's* timezone and locale. The server
 * renders a neutral UTC placeholder; the client replaces it after hydration
 * (no hydration mismatch, no server-timezone leakage into the UI).
 */
export function LocalTime({ iso, format = "time", className }: { iso: string | Date; format?: keyof typeof PRESETS; className?: string }) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const client = useIsClient();
  const text = client ? new Intl.DateTimeFormat(undefined, PRESETS[format]).format(d) : `${d.toISOString().slice(11, 16)} UTC`;
  return (
    <time dateTime={d.toISOString()} className={className}>
      {text}
    </time>
  );
}
