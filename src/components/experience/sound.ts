"use client";

import { useSyncExternalStore } from "react";

import type { SoundCue } from "@/lib/experience/cinematic";
import type { SoundProfile } from "@/lib/experience/themes";

/**
 * Sound hooks. Every moment of the game (an unlock, a solve, a string tied, a
 * wrong answer) fires a *cue*; the theme decides what a cue sounds like by
 * giving the synth a root pitch, a waveform and a tail. Nothing is downloaded:
 * cues are synthesised. Off by default (browsers rightly forbid surprise
 * audio); the player opts in from the command palette or the HUD.
 */
const KEY = "dossier.sound";
const listeners = new Set<() => void>();
let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
  if (on) void audio()?.resume();
  listeners.forEach((l) => l());
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    read,
    () => false,
  );
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function noise(c: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

interface Tone {
  f: number;
  to?: number;
  at?: number;
  len: number;
  g?: number;
  wave?: OscillatorType;
}

export function playCue(cue: SoundCue, p: SoundProfile) {
  if (!read()) return;
  const c = audio();
  if (!c || c.state === "closed") return;
  if (c.state === "suspended") void c.resume();
  const r = p.root;
  const T = p.tail;
  const tones: Tone[] = [];
  let thump = 0;
  switch (cue) {
    case "tick":
      tones.push({ f: r * 4, len: 0.03 * T, g: 0.5 });
      break;
    case "lock":
      tones.push({ f: r * 2, len: 0.09 * T }, { f: r * 3, at: 0.08, len: 0.14 * T });
      break;
    case "impact":
      tones.push({ f: r / 2, to: r / 4, len: 0.4 * T, g: 1.3 });
      thump = 1;
      break;
    case "sweep":
      tones.push({ f: r, to: r * 6, len: 0.9 * T, g: 0.35 });
      break;
    case "confirm":
      tones.push({ f: r * 2, len: 0.1 * T }, { f: r * 3, at: 0.09, len: 0.2 * T });
      break;
    case "deny":
      tones.push({ f: r * 1.5, to: r * 1.42, len: 0.28 * T, g: 0.9, wave: "sawtooth" });
      break;
    case "unlock":
      [2, 2.5, 3, 4].forEach((m, i) => tones.push({ f: r * m, at: i * 0.075, len: 0.24 * T }));
      break;
    case "solve":
      [2, 2.5, 3, 4, 5].forEach((m, i) => tones.push({ f: r * m, at: i * 0.07, len: 0.42 * T, g: 0.8 }));
      tones.push({ f: r * 8, at: 0.3, len: 0.5 * T, g: 0.25 });
      break;
    case "connect":
      tones.push({ f: r * 3, len: 0.05 * T, wave: "square", g: 0.4 }, { f: r * 5, at: 0.05, len: 0.1 * T });
      thump = 0.35;
      break;
  }
  const now = c.currentTime;
  const master = c.createGain();
  master.gain.value = p.gain;
  master.connect(c.destination);
  for (const t of tones) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = t.wave ?? p.wave;
    const t0 = now + (t.at ?? 0);
    o.frequency.setValueAtTime(t.f, t0);
    if (t.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, t.to), t0 + t.len);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(t.g ?? 1, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t.len);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + t.len + 0.05);
  }
  if (p.noise > 0 && (thump || cue === "tick")) {
    const n = c.createBufferSource();
    n.buffer = noise(c);
    const f = c.createBiquadFilter();
    f.type = cue === "tick" ? "highpass" : "lowpass";
    f.frequency.value = cue === "tick" ? 4000 : 600;
    const g = c.createGain();
    const amp = p.noise * (thump || 0.25);
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18 * T);
    n.connect(f).connect(g).connect(master);
    n.start(now);
    n.stop(now + 0.25 * T);
  }
}
