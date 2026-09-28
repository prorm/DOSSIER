"use client";

import { useEffect, useState } from "react";

import { useIsClient } from "./effects";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Mono countdown (HH:MM:SS). Announces only coarse changes to assistive tech. */
export function Countdown({ to, label, className }: { to: string; label: string; className?: string }) {
  const target = new Date(to).getTime();
  const client = useIsClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = client ? target - now : null;
  const p = parts(left ?? 0);
  const text = left === null ? "--:--:--" : `${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}:${String(p.s).padStart(2, "0")}`;
  return (
    <span className={className}>
      <span className="sr-only">
        {label}: {left === null ? "" : `${p.h} hours ${p.m} minutes`}
      </span>
      <span aria-hidden="true" className="num">
        {left !== null && left <= 0 ? "00:00:00" : text}
      </span>
    </span>
  );
}
