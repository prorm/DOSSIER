"use client";

import { useEffect, useSyncExternalStore } from "react";

import { useEffectsEnabled } from "@/components/dossier/effects";

/**
 * One place that decides how much spectacle this device gets.
 *
 *   reduced  the OS asks for less motion → no camera moves, no cinematic timelines
 *   effects  reduced-motion respected AND the player has not turned effects off
 *   webgl    a WebGL2 context can actually be created
 *   tier     how much GPU we dare spend (low / mid / high)
 *   visible  the tab is on screen (hidden tabs never render frames)
 *   lean     the connection is slow or the player asked the browser to save data: the heavy 3D
 *            stack (~350 KB) is not fetched on its own initiative (the 3D toggle still offers it)
 *
 * `?fx=off|low|mid|high` overrides the heuristics (demos, screenshots, bug reports).
 */
export type Tier = "low" | "mid" | "high";

export interface MotionState {
  reduced: boolean;
  effects: boolean;
  webgl: boolean;
  tier: Tier;
  visible: boolean;
  coarse: boolean;
  lean: boolean;
  /** WebGL scenes may run: effects on, GL available, tab visible. */
  scenes: boolean;
}

let glProbe: boolean | null = null;

/** Creates (and immediately discards) a WebGL2 context once per page load. */
export function probeWebGL(): boolean {
  if (glProbe !== null) return glProbe;
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    glProbe = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    glProbe = false;
  }
  return glProbe;
}

function fxOverride(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("fx") ?? window.localStorage.getItem("dossier.fx");
  } catch {
    return null;
  }
}

function detectTier(): Tier {
  const o = fxOverride();
  if (o === "low" || o === "mid" || o === "high") return o;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse && (mem <= 3 || cores <= 4)) return "low";
  if (window.innerWidth < 520 && cores <= 6) return "low";
  if (!coarse && cores >= 8 && mem >= 8 && window.innerWidth >= 1000) return "high";
  return "mid";
}

const subscribers = new Set<() => void>();
const bump = () => subscribers.forEach((f) => f());

function subscribe(cb: () => void) {
  subscribers.add(cb);
  const mqs = [window.matchMedia("(prefers-reduced-motion: reduce)"), window.matchMedia("(pointer: coarse)")];
  mqs.forEach((m) => m.addEventListener("change", cb));
  document.addEventListener("visibilitychange", cb);
  window.addEventListener("resize", cb);
  return () => {
    subscribers.delete(cb);
    mqs.forEach((m) => m.removeEventListener("change", cb));
    document.removeEventListener("visibilitychange", cb);
    window.removeEventListener("resize", cb);
  };
}

let last: MotionState | null = null;
function snapshot(effects: boolean): MotionState {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const o = fxOverride();
  const webgl = o === "off" ? false : probeWebGL();
  const visible = !document.hidden;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const tier = detectTier();
  const eff = effects && o !== "off";
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  // An explicit ?fx=low|mid|high always wins: a demo on hotel Wi-Fi should still get the show.
  const lean = o !== "low" && o !== "mid" && o !== "high" && Boolean(conn?.saveData || (conn?.effectiveType && /^(slow-2g|2g|3g)$/.test(conn.effectiveType)));
  const next: MotionState = { reduced, effects: eff, webgl, tier, visible, coarse, lean, scenes: eff && webgl && visible };
  if (last && (Object.keys(next) as (keyof MotionState)[]).every((k) => last![k] === next[k])) return last;
  last = next;
  return next;
}

const SERVER: MotionState = { reduced: false, effects: false, webgl: false, tier: "mid", visible: true, coarse: false, lean: false, scenes: false };

export function useMotion(): MotionState {
  const effects = useEffectsEnabled();
  return useSyncExternalStore(
    subscribe,
    () => snapshot(effects),
    () => SERVER,
  );
}

/** Budget for a WebGL scene at a given tier. */
export function sceneBudget(tier: Tier) {
  return {
    dpr: (tier === "high" ? [1, 1.75] : tier === "mid" ? [1, 1.4] : [1, 1]) as [number, number],
    post: tier !== "low",
    antialias: tier === "high",
    particles: tier === "high" ? 1 : tier === "mid" ? 0.6 : 0.3,
    fps: tier === "high" ? 60 : 45,
  };
}

/** Re-evaluate after the effects toggle changes (the store is external to React). */
export function useMotionRefresh() {
  useEffect(() => {
    bump();
  }, []);
}
