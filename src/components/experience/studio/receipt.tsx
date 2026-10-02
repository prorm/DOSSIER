"use client";

import { Check, CircleAlert, Loader2, Minus, X } from "lucide-react";

import { LocalTime } from "@/components/dossier/local-time";
import type { BuildStage, BuildTrace } from "@/lib/experience/pipeline";
import { cn } from "@/lib/utils";
import type { Replay } from "./use-build-replay";

export type Traces = Partial<Record<BuildTrace["kind"], BuildTrace>>;

export const KIND_LABEL: Record<BuildTrace["kind"], string> = { generate: "Build", validate: "Playtest", publish: "Publish" };
const NOTHING_YET: Record<BuildTrace["kind"], string> = {
  generate: "Nothing has been built yet. Building the world leaves a receipt here — every stage timed, every count real.",
  validate: "Nothing has been validated yet. Validation plays sample teams through the whole event; its receipt lands here.",
  publish: "Nothing has been published yet. Publishing seals the answers and opens the event; its receipt lands here.",
};

export function fmtMs(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 1) return "<1 ms";
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * The receipt of a build: every stage with the time it really took and the
 * numbers it really produced. Nothing on it is estimated. While a replay is
 * running, stages the playhead has not reached stay dark.
 */
export function Receipt({ traces, kind, onKind, replay, className }: { traces: Traces; kind: BuildTrace["kind"]; onKind: (k: BuildTrace["kind"]) => void; replay: Replay; className?: string }) {
  const kinds = (Object.keys(KIND_LABEL) as BuildTrace["kind"][]).filter((k) => traces[k]);
  const trace = traces[kind];
  const replaying = replay.playing && replay.trace?.kind === kind;
  return (
    <section className={cn("rc", className)} aria-label="Build receipt">
      <header className="rc-head">
        <p className="label-mono">Receipt</p>
        <div className="rc-tabs" role="tablist" aria-label="Which run">
          {(kinds.includes(kind) ? kinds : [...kinds, kind]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={k === kind} className={cn(k === kind && "is-on")} onClick={() => onKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </header>
      {trace ? (
        <>
          <ol className="rc-list">
            {trace.stages.map((s, i) => (
              <Row key={s.id} stage={s} state={replaying ? (i < replay.done ? "done" : i === replay.running ? "running" : "waiting") : "done"} />
            ))}
          </ol>
          <footer className="rc-foot">
            <span className={cn("rc-verdict", replaying ? "is-ok" : trace.ok ? "is-ok" : "is-bad")}>{replaying ? "Replaying" : trace.ok ? "Completed" : "Stopped"}</span>
            <span className="num">{fmtMs(trace.totalMs)}</span>
            <span className="text-faint">
              <LocalTime iso={trace.at} format="full" />
            </span>
            {replaying ? (
              <button type="button" className="rc-skip" onClick={replay.skip}>
                Skip
              </button>
            ) : null}
          </footer>
        </>
      ) : (
        <p className="rc-empty">{NOTHING_YET[kind]}</p>
      )}
    </section>
  );
}

function Row({ stage, state }: { stage: BuildStage; state: "done" | "running" | "waiting" }) {
  const tone = state === "waiting" ? "wait" : stage.status;
  return (
    <li className={cn("rc-row", `is-${tone}`, state === "running" && "is-running")}>
      <span className="rc-mark" aria-hidden="true">
        {state === "running" ? <Loader2 className="size-3 animate-spin" /> : state === "waiting" ? null : stage.status === "ok" ? <Check className="size-3" strokeWidth={3} /> : stage.status === "warn" ? <CircleAlert className="size-3" /> : stage.status === "fail" ? <X className="size-3" strokeWidth={3} /> : <Minus className="size-3" />}
      </span>
      <span className="rc-label">{stage.label}</span>
      <span className="rc-ms num">{state === "done" ? fmtMs(stage.ms) : ""}</span>
      {state === "done" && (stage.metrics.length || stage.note) ? (
        <span className="rc-detail">
          {stage.metrics.map((m) => (
            <span key={m.label} className="rc-chip">
              <b className="num">{m.value}</b> {m.label}
            </span>
          ))}
          {stage.note ? <span className="rc-note">{stage.note}</span> : null}
        </span>
      ) : null}
    </li>
  );
}
