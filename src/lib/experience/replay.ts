/**
 * Turning a recorded build into something watchable, without inventing anything.
 *
 * A BuildTrace says what each stage really did and how long it really took. The
 * replay keeps that order, keeps the proportions (a stage that took ten times
 * longer holds the screen longer, within limits that keep it watchable) and
 * spends the file-reveal window exactly where the files were actually created.
 * It never produces a number the trace did not contain.
 */

import type { BuildStage, BuildTrace, StationId } from "./pipeline";

/** Which production-line stations a recorded stage belongs to (for lighting the rail as the replay passes). */
export function stationsOf(kind: BuildTrace["kind"], stageId: string): StationId[] {
  if (kind === "generate") {
    switch (stageId) {
      case "story":
        return ["story"];
      case "plan":
        return ["world", "challenges"];
      case "identity":
        return ["presentation"];
      case "wire":
        return ["logic"];
      default:
        return [];
    }
  }
  if (kind === "validate") return ["playtest"];
  // publish
  return stageId === "validate" ? ["playtest"] : ["publish"];
}

export interface ReplayStep {
  index: number;
  stage: BuildStage;
  start: number;
  end: number;
  stations: StationId[];
}

export interface ReplayPlan {
  steps: ReplayStep[];
  total: number;
  /** The window in which files come into being (generate traces only): count goes 0 → `to`. */
  reveal: { stage: string; start: number; end: number; to: number } | null;
}

export interface ReplayOptions {
  /** Number of files in the world (drives how long the reveal window lasts). */
  nodes?: number;
  /** 1 = the full show. 0 = jump to the end (reduced motion). */
  speed?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function replayPlan(trace: BuildTrace, opts: ReplayOptions = {}): ReplayPlan {
  const speed = opts.speed ?? 1;
  const nodes = opts.nodes ?? 0;
  if (speed <= 0) {
    const steps = trace.stages.map((stage, index) => ({ index, stage, start: 0, end: 0, stations: stationsOf(trace.kind, stage.id) }));
    return { steps, total: 0, reveal: trace.kind === "generate" && nodes ? { stage: "plan", start: 0, end: 0, to: nodes } : null };
  }
  let t = 0;
  let reveal: ReplayPlan["reveal"] = null;
  const steps: ReplayStep[] = trace.stages.map((stage, index) => {
    // Proportional to the measured time, bounded both ways so neither a 2 ms nor a 3 s stage wrecks the pacing.
    let d = clamp(0.32 + (stage.ms / 1000) * 0.9, 0.42, 2.2);
    if (trace.kind === "generate" && stage.id === "plan" && nodes) d = clamp(0.8 + nodes * 0.055, 1.4, 3.6);
    if (stage.status === "skip") d = 0.18;
    d /= speed;
    const step: ReplayStep = { index, stage, start: t, end: t + d, stations: stationsOf(trace.kind, stage.id) };
    if (trace.kind === "generate" && stage.id === "plan" && nodes) reveal = { stage: stage.id, start: step.start + d * 0.08, end: step.end - d * 0.04, to: nodes };
    t += d;
    return step;
  });
  return { steps, total: t, reveal };
}

/** Where in the replay we are at time `t`: the running step, the stages already behind us. */
export function replayAt(plan: ReplayPlan, t: number): { running: number; done: number; count: number } {
  let running = -1;
  let done = 0;
  for (const s of plan.steps) {
    if (t >= s.end) done = s.index + 1;
    else if (t >= s.start) running = s.index;
  }
  const r = plan.reveal;
  let count = 0;
  if (r) count = r.end <= r.start || t >= r.end ? r.to : t <= r.start ? 0 : Math.round(((t - r.start) / (r.end - r.start)) * r.to);
  return { running, done, count };
}
