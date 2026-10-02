"use client";

import { ArrowRight, Check, Clapperboard, Orbit, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useUniverse } from "@/components/experience/universe/universe-stage";
import type { AuthorUniverse } from "@/lib/experience/author";
import type { Station, StationId } from "@/lib/experience/pipeline";
import type { Vec3 } from "@/lib/experience/universe";
import { FAMILY_LABEL } from "@/lib/modes";
import { cn } from "@/lib/utils";
import { fmtMs } from "./receipt";
import type { Replay } from "./use-build-replay";

/** What the finished world holds, read from the draft (never estimated). */
export interface WorldSummary {
  title: string;
  files: number;
  acts: number;
  rounds: number;
  exhibits: number;
  facts: number;
  depth: number;
  criticalMinutes: number;
  mechanics: number;
  people: number;
}

export type TheatreState = "off" | "building" | "done";

/**
 * The build theatre: the construction stage, full screen, while a build's
 * receipt replays — and then the world it made.
 *
 * Everything on it comes from the receipt and the draft: stations light in the
 * order the stages ran, each stage's caption carries the counts that stage
 * produced, the files that come into being are the draft's real files in the
 * order they can be solved, and the closing card quotes the world as built.
 * The timings shown are the measured ones; the replay only slows them down
 * enough to watch.
 */
export function BuildTheatre({ state, pending = false, replay, au, stations, world, onClose, onStation }: { state: TheatreState; pending?: boolean; replay: Replay; au: AuthorUniverse | null; stations: Station[]; world: WorldSummary | null; onClose: () => void; onStation: (id: StationId) => void }) {
  // While the engine works, the previous receipt is not this build's: show none of it.
  const trace = pending ? null : replay.trace;
  const playing = replay.playing && trace?.kind === "generate";
  const running = playing && trace ? trace.stages[replay.running] : null;
  const finished = trace ? trace.stages.slice(0, playing ? replay.done : trace.stages.length) : [];
  const last = finished.at(-1);
  const made = au && !pending ? au.input.nodes.slice(0, playing ? replay.count : au.input.nodes.length) : [];
  const elapsed = useElapsed(pending);

  useEffect(() => {
    if (state === "off") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [state, onClose]);

  if (state === "off") return null;
  return (
    <div className={cn("bt", state === "done" && "is-done")} role="dialog" aria-modal="true" aria-label={state === "done" ? "The world you built" : "Building the world"}>
      <header className="bt-top">
        <p className="bt-kicker">
          <Clapperboard className="size-3.5" aria-hidden="true" /> {state === "done" ? "Build complete" : "Building the world"}
          {trace ? (
            <span>
              · receipt {fmtMs(trace.totalMs)} measured{playing ? " · replayed slow enough to watch" : ""}
            </span>
          ) : null}
        </p>
        <ol className="bt-line" aria-label="Production line">
          {stations.map((s) => {
            // In flight, only the story is truly behind us; the engine is on the world.
            const lit = pending ? (s.id === "story" ? "done" : s.id === "world" ? "running" : undefined) : replay.lit?.[s.id];
            const on = lit === "done" || (!pending && !playing && (s.status === "ready" || s.status === "done" || s.status === "warn"));
            return (
              <li key={s.id} className={cn(lit === "running" && "is-running", on && "is-done")}>
                <i aria-hidden="true">{on ? <Check className="size-2.5" strokeWidth={3.5} /> : null}</i>
                <span>{s.title}</span>
              </li>
            );
          })}
        </ol>
        <button type="button" className="bt-x" onClick={onClose} aria-label="Leave the theatre">
          <X className="size-4" />
        </button>
      </header>

      {state === "building" ? (
        <>
          <div className="bt-voice" aria-live="polite">
            {pending ? (
              <>
                <p className="bt-now">
                  <span className="bt-dot" aria-hidden="true" /> The engine is building your world
                </p>
                <p className="bt-said">
                  Reading the story, planning rounds, generating every team&apos;s files
                  <span className="bt-metrics">
                    <span className="bt-ms num" aria-hidden="true">
                      {(elapsed / 1000).toFixed(1)} s
                    </span>
                  </span>
                </p>
              </>
            ) : null}
            {running ? (
              <p className="bt-now">
                <span className="bt-dot" aria-hidden="true" /> {running.label}
              </p>
            ) : null}
            {last ? (
              <p className="bt-said" key={last.id}>
                <Check className="size-3.5" aria-hidden="true" /> {last.label}
                <span className="bt-metrics">
                  {last.metrics.map((m) => (
                    <span key={m.label}>
                      <b className="num">{m.value}</b> {m.label}
                    </span>
                  ))}
                  <span className="bt-ms num">{fmtMs(last.ms)}</span>
                </span>
              </p>
            ) : null}
          </div>
          {made.length ? (
            <aside className="bt-files" aria-label="Files created so far">
              <p className="bt-files-head">
                <b className="num">{made.length}</b> / {au?.input.nodes.length ?? 0} files
              </p>
              <ol>
                {made
                  .slice(-7)
                  .reverse()
                  .map((n) => (
                    <li key={n.id}>
                      <span className="bt-fam">{FAMILY_LABEL[n.family] ?? n.family}</span>
                      <span className="bt-title">{n.title}</span>
                      <span className="bt-depth num">d{String(n.meta?.depth ?? 0)}</span>
                    </li>
                  ))}
              </ol>
            </aside>
          ) : null}
        </>
      ) : null}

      {state === "done" && world ? <WorldCard world={world} trace={trace ? { ms: trace.totalMs, ok: trace.ok } : null} onClose={onClose} onStation={onStation} /> : null}
    </div>
  );
}

/** Wall-clock time since `on` became true: the real wait, shown as it happens. */
function useElapsed(on: boolean) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t0 = performance.now();
    const id = setInterval(() => setMs(performance.now() - t0), 100);
    return () => {
      clearInterval(id);
      setMs(0);
    };
  }, [on]);
  return ms;
}

function WorldCard({ world, trace, onClose, onStation }: { world: WorldSummary; trace: { ms: number; ok: boolean } | null; onClose: () => void; onStation: (id: StationId) => void }) {
  const [touring, setTouring] = useState(false);
  return (
    <section className={cn("bt-card", touring && "is-touring")} aria-labelledby="bt-card-h">
      <p className="bt-card-kicker">{trace ? `${trace.ok ? "Compiled" : "Stopped"} in ${fmtMs(trace.ms)}` : "Your case"}</p>
      <h2 id="bt-card-h" className="bt-card-title">
        This is the world you just created.
      </h2>
      <p className="bt-card-sub">{world.title}</p>
      <dl className="bt-stats">
        {(
          [
            ["files", world.files],
            ["acts", world.acts],
            ["exhibits", world.exhibits],
            ["facts per team", world.facts],
            ["deepest chain", world.depth],
            ["critical path", `${world.criticalMinutes} min`],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dd className="num">{v}</dd>
            <dt>{k}</dt>
          </div>
        ))}
      </dl>
      <p className="bt-card-note">Every team gets its own instance: the same case, different facts, different answers.</p>
      <div className="bt-actions">
        <Tour onState={setTouring} />
        <button type="button" className="chip-btn is-primary" onClick={() => (onClose(), onStation("presentation"))}>
          Dress it <ArrowRight className="size-3.5" />
        </button>
        <button type="button" className="chip-btn" onClick={() => (onClose(), onStation("playtest"))}>
          <ShieldCheck className="size-3.5" /> Prove it
        </button>
        <button type="button" className="chip-btn" onClick={() => (onClose(), onStation("challenges"))}>
          See every file
        </button>
      </div>
    </section>
  );
}

/** A camera pass over the case, act by act, then back to the whole. Reads the scene's own acts. */
function Tour({ onState }: { onState: (on: boolean) => void }) {
  const u = useUniverse();
  const [on, setOn] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const start = () => {
    timers.current.forEach(clearTimeout);
    const stops: Vec3[] = u.model.acts
      .filter((a) => a.count)
      .map((a) => {
        const ns = u.model.nodes.filter((n) => n.actIndex === a.index);
        return [ns.reduce((s, n) => s + n.pos[0], 0) / ns.length, ns.reduce((s, n) => s + n.pos[1], 0) / ns.length, ns.reduce((s, n) => s + n.pos[2], 0) / ns.length] as Vec3;
      });
    setOn(true);
    onState(true);
    stops.forEach((p, i) => timers.current.push(setTimeout(() => u.flyTo(p, Math.max(22, u.theme.universe.distance * 0.95)), i * 2100)));
    timers.current.push(
      setTimeout(() => {
        u.recenter();
        setOn(false);
        onState(false);
      }, stops.length * 2100 + 400),
    );
  };
  return (
    <button type="button" className="chip-btn" onClick={start} disabled={on}>
      <Orbit className="size-3.5" /> {on ? "Flying…" : "Fly through it"}
    </button>
  );
}
