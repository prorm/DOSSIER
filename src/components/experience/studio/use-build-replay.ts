"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { useMotion } from "@/components/experience/motion";
import type { BuildTrace, StationId } from "@/lib/experience/pipeline";
import { replayAt, replayPlan, type ReplayPlan } from "@/lib/experience/replay";

export type Lit = Partial<Record<StationId, "running" | "done">>;

/** `?replay=0.25` plays builds four times slower (for demos and screenshots); clamped to something watchable. */
function replaySpeed(): number {
  try {
    const v = Number(new URLSearchParams(window.location.search).get("replay"));
    return Number.isFinite(v) && v > 0 ? Math.min(4, Math.max(0.05, v)) : 1;
  } catch {
    return 1;
  }
}

/** Sentinel the scene reads as "everything exists". */
export const ALL = 1e6;

export interface Replay {
  trace: BuildTrace | null;
  playing: boolean;
  /** Index of the stage on screen now (-1 between stages / when idle). */
  running: number;
  /** Stages already behind the playhead. */
  done: number;
  /** Files that exist so far (generate traces). */
  count: number;
  /** Stations the playhead has lit; null when nothing is playing. */
  lit: Lit | null;
  /** Read by the 3D scene every frame – a fraction is a thread still growing. */
  revealRef: MutableRefObject<number>;
  /**
   * Start a replay. `onEnd` fires when it finishes or is skipped (not when a newer replay replaces it).
   * `pace` < 1 plays slower (the build theatre uses it so a 30 ms build can be watched); proportions are kept.
   */
  play: (trace: BuildTrace, nodes: number, onEnd?: () => void, pace?: number) => void;
  skip: () => void;
}

/**
 * Plays a recorded build. The playhead is a plain clock; everything it reveals —
 * which stage is running, how many files exist, which stations are lit — is read
 * from the trace by `replayAt`. Reduced-motion players get the end state at once.
 */
export function useBuildReplay(): Replay {
  const motion = useMotion();
  const revealRef = useRef(ALL);
  const raf = useRef(0);
  const planRef = useRef<ReplayPlan | null>(null);
  const endRef = useRef<(() => void) | undefined>(undefined);
  const [st, setSt] = useState<Pick<Replay, "trace" | "playing" | "running" | "done" | "count" | "lit">>({ trace: null, playing: false, running: -1, done: 0, count: 0, lit: null });

  const litOf = (plan: ReplayPlan, running: number, done: number): Lit => {
    const lit: Lit = {};
    for (const s of plan.steps) {
      if (s.index < done) for (const id of s.stations) lit[id] = "done";
    }
    const cur = plan.steps[running];
    if (cur) for (const id of cur.stations) lit[id] = "running";
    return lit;
  };

  const finish = useCallback((trace: BuildTrace, plan: ReplayPlan, nodes: number) => {
    cancelAnimationFrame(raf.current);
    revealRef.current = ALL;
    setSt({ trace, playing: false, running: -1, done: plan.steps.length, count: nodes, lit: null });
    const end = endRef.current;
    endRef.current = undefined;
    end?.();
  }, []);

  const play = useCallback(
    (trace: BuildTrace, nodes: number, onEnd?: () => void, pace = 1) => {
      cancelAnimationFrame(raf.current);
      endRef.current = onEnd;
      const speed = motion.reduced || !motion.effects ? 0 : replaySpeed() * pace;
      const plan = replayPlan(trace, { nodes, speed });
      planRef.current = plan;
      if (plan.total <= 0) {
        finish(trace, plan, nodes);
        return;
      }
      revealRef.current = plan.reveal ? 0 : ALL;
      const t0 = performance.now();
      let last = { running: -2, done: -1, count: -1 };
      setSt({ trace, playing: true, running: 0, done: 0, count: 0, lit: litOf(plan, 0, 0) });
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        if (t >= plan.total) return finish(trace, plan, nodes);
        const at = replayAt(plan, t);
        const r = plan.reveal;
        if (r) {
          const p = Math.min(1, Math.max(0, (t - r.start) / (r.end - r.start)));
          // The window is stretched so the last file's threads have finished growing when it closes.
          revealRef.current = p >= 1 ? ALL : p * (r.to + 2.6);
        }
        if (at.running !== last.running || at.done !== last.done || at.count !== last.count) {
          last = at;
          setSt({ trace, playing: true, running: at.running, done: at.done, count: at.count, lit: litOf(plan, at.running, at.done) });
        }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [motion.reduced, motion.effects, finish],
  );

  const skip = useCallback(() => {
    const plan = planRef.current;
    const trace = st.trace;
    if (!plan || !trace) return;
    finish(trace, plan, plan.reveal?.to ?? 0);
  }, [finish, st.trace]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return { ...st, revealRef, play, skip };
}
