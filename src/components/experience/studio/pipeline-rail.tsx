"use client";

import { Check, X } from "lucide-react";

import type { Station, StationId } from "@/lib/experience/pipeline";
import { cn } from "@/lib/utils";
import type { Lit } from "./use-build-replay";

/**
 * The production line: STORY → WORLD → CHALLENGES → LOGIC → PRESENTATION → PLAYTEST → PUBLISH.
 *
 * Every mark on it is read from the draft (see derivePipeline): a station is lit
 * because the thing it stands for exists, and its headline quotes the real
 * numbers. While a recorded build replays, the playhead lights stations in the
 * order the stages actually ran.
 */
export function PipelineRail({
  stations,
  active,
  next,
  lit,
  busy,
  onSelect,
}: {
  stations: Station[];
  active: StationId;
  /** The first station that still needs attention. */
  next: StationId;
  lit: Lit | null;
  /** The station whose work is in flight on the server right now (indeterminate). */
  busy: StationId | null;
  onSelect: (id: StationId) => void;
}) {
  return (
    <nav className="pl" aria-label="Production line">
      <ol>
        {stations.map((s) => {
          const l = lit?.[s.id];
          return (
            <li key={s.id} className={cn("pl-st", `is-${s.status}`, l && `lit-${l}`, active === s.id && "is-active", busy === s.id && "is-busy", next === s.id && s.status !== "done" && "is-next")} style={{ ["--i" as string]: s.index }}>
              <button type="button" onClick={() => onSelect(s.id)} aria-current={active === s.id ? "step" : undefined} data-station={s.id}>
                <span className="pl-no" aria-hidden="true">
                  {String(s.index + 1).padStart(2, "0")}
                </span>
                <span className="pl-node" aria-hidden="true">
                  {s.status === "done" || (l === "done" && s.status !== "fail") ? <Check className="size-2.5" strokeWidth={3.5} /> : s.status === "fail" ? <X className="size-2.5" strokeWidth={3.5} /> : null}
                </span>
                <span className="pl-title">{s.title}</span>
                <span className="pl-verb">{s.verb}</span>
                <span className="pl-head">{s.headline}</span>
                <span className="sr-only">
                  {` — ${s.status}${busy === s.id ? ", working" : ""}${next === s.id && s.status !== "done" ? ", next up" : ""}`}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
