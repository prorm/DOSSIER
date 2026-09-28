"use client";

import { AlertOctagon, Megaphone, TriangleAlert } from "lucide-react";
import { useCallback, useState } from "react";

import SwipeToast from "@/components/reactbits/SwipeToast";
import { useRealtime } from "./realtime";

interface Announcement {
  id: string;
  title: string;
  body?: string;
  level?: "info" | "warning" | "critical" | string;
}

const MAX_VISIBLE = 2;

/**
 * Live announcements as swipe-dismissable toasts (React Bits SwipeToast, inline
 * mode, stacked in a region we position above the mobile tab bar). Critical
 * notices stay until dismissed; others burn down on a fuse that pauses on
 * hover/focus. Announcements are also listed on the console home, so a missed
 * toast never means missed information.
 */
export function AnnouncementToaster({ offsetBottom = true }: { offsetBottom?: boolean }) {
  const [items, setItems] = useState<Announcement[]>([]);

  useRealtime(
    (m) => {
      const a = m.data as unknown as Announcement | undefined;
      if (!a?.id) return;
      setItems((cur) => (cur.some((x) => x.id === a.id) ? cur : [...cur, a].slice(-5)));
    },
    ["announcement"],
  );

  const remove = useCallback((id: string) => setItems((cur) => cur.filter((x) => x.id !== id)), []);

  return (
    <div
      aria-label="Announcements"
      className={`pointer-events-none fixed right-3 left-3 z-[70] flex flex-col items-end gap-0 sm:left-auto sm:w-[380px] ${
        offsetBottom ? "bottom-[calc(76px+env(safe-area-inset-bottom,0px))] md:bottom-6" : "bottom-6"
      }`}
    >
      {items.slice(0, MAX_VISIBLE).map((a) => {
        const critical = a.level === "critical";
        const warn = a.level === "warning";
        return (
          <div key={a.id} className="pointer-events-auto w-full">
            <SwipeToast
              inline
              title={<span className="font-mono text-[0.78rem] uppercase tracking-[0.06em]">{a.title}</span>}
              description={a.body ? <span className="line-clamp-3">{a.body}</span> : undefined}
              icon={
                critical ? (
                  <AlertOctagon className="text-signal-magenta" />
                ) : warn ? (
                  <TriangleAlert className="text-signal-amber" />
                ) : (
                  <Megaphone className="text-signal-cyan" />
                )
              }
              width={380}
              radius={4}
              duration={critical ? 0 : warn ? 14_000 : 9_000}
              fuseColor={critical ? "var(--color-signal-magenta)" : warn ? "var(--color-signal-amber)" : "var(--color-signal-cyan)"}
              background="var(--color-raised)"
              closeButton
              className="[&_[role=status]]:border [&_[role=status]]:border-line-strong [&_[role=status]]:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.9)]"
              onClose={() => remove(a.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
