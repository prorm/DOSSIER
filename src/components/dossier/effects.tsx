"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Effects preference. Separate from the OS "reduce motion" setting: players on
 * weak phones or projectors can turn ambient effects off from the command
 * palette. Stored per browser. `html.effects-off` is honoured by CSS and by
 * `useEffectsEnabled()` for JS-driven effects (WebGL backgrounds, pointer FX).
 */
const KEY = "dossier.effects";
const listeners = new Set<() => void>();

function read(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setEffectsEnabled(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
  document.documentElement.classList.toggle("effects-off", !on);
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", fn);
  return () => {
    listeners.delete(fn);
    mq.removeEventListener("change", fn);
  };
}

/** True when ambient/JS effects may run: user hasn't disabled them and OS doesn't request reduced motion. */
export function useEffectsEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

export function useEffectsPreference(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}

/** Applies the stored preference to <html> on first paint of client code. */
export function EffectsBoot() {
  useEffect(() => {
    document.documentElement.classList.toggle("effects-off", !read());
  }, []);
  return null;
}

/** Heavy effects only on capable, fine-pointer, visible screens. */
export function useCapableDevice(minWidth = 768): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("resize", cb);
      return () => window.removeEventListener("resize", cb);
    },
    () => {
      const nav = navigator as Navigator & { deviceMemory?: number };
      return window.innerWidth >= minWidth && (nav.deviceMemory ?? 8) >= 4 && (navigator.hardwareConcurrency ?? 8) >= 4;
    },
    () => false,
  );
}

const noopSubscribe = () => () => {};
/** False during SSR and hydration, true afterwards — for browser-only values without effects. */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
