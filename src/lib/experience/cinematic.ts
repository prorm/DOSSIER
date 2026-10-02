/**
 * Cinematic sequences as DATA.
 *
 * An opening is a list of beats on a timeline. A theme decides what the beats
 * are (a classified boot log, a memory waking, a case file being opened, a
 * signal locking on); the event decides the words (case number, title, kicker,
 * extra lines); the game decides the numbers (how many files, how many
 * exhibits are held). The player (GSAP timeline + R3F scene) just interprets
 * the resolved script, so a new opening is a new array, not new code.
 *
 * Always available: skip, a reduced-motion card, and a fast path for players
 * who have been here before.
 */

import type { Formation, ThemeId } from "./themes";
import { teamDressing } from "./variation";

export type SoundCue = "tick" | "lock" | "impact" | "sweep" | "confirm" | "deny" | "unlock" | "solve" | "connect";
export type TitleTreatment = "stamp" | "bloom" | "type" | "scan";
export type OpeningMode = "first" | "returning" | "reduced";

export type Beat =
  | { at: number; kind: "log"; lines: LogLine[]; interval: number }
  | { at: number; kind: "shards"; duration: number }
  | { at: number; kind: "title"; treatment: TitleTreatment; duration: number }
  | { at: number; kind: "kicker"; duration: number }
  | { at: number; kind: "flash"; strength: number }
  | { at: number; kind: "sound"; cue: SoundCue }
  | { at: number; kind: "cta" };

export interface LogLine {
  text: string;
  /** Right-aligned status token ("ok", "sealed", a frequency…). */
  status?: string;
  tone?: "ok" | "warn" | "info";
}

export interface ResolvedScript {
  id: string;
  mode: OpeningMode;
  formation: Formation;
  duration: number;
  beats: Beat[];
  title: { caseNumber: string; title: string; kicker: string; label: string; treatment: TitleTreatment };
  /** Returning players are let straight in after this many seconds (0 = wait for the player). */
  autoEnter: number;
  /** Shard census: how many fragments, and which are "held". */
  shards: { total: number; held: number };
}

export interface CinematicVars {
  eventName: string;
  teamName: string;
  caseNumber: string;
  title: string;
  kicker: string;
  extraLines: string[];
  world: string;
  files: number;
  open: number;
  solved: number;
  acts: number;
  exhibits: number;
  held: number;
  fingerprint: string;
  intensity: "calm" | "balanced" | "cinematic";
}

const pad = (n: number) => String(n).padStart(2, "0");

function shardCensus(v: CinematicVars) {
  const total = Math.max(36, Math.min(220, v.exhibits * 9 + v.files * 3));
  const held = v.exhibits ? Math.round((v.held / v.exhibits) * total) : Math.round(total * 0.08);
  return { total, held };
}

/** Timing multiplier from the organiser's intensity. */
function tempo(v: CinematicVars) {
  return v.intensity === "calm" ? 0.7 : v.intensity === "cinematic" ? 1.3 : 1;
}

function scale(beats: Beat[], k: number): Beat[] {
  return beats.map((b) => {
    const at = b.at * k;
    if (b.kind === "log") return { ...b, at, interval: b.interval * k };
    if (b.kind === "shards" || b.kind === "title" || b.kind === "kicker") return { ...b, at, duration: b.duration * k };
    return { ...b, at };
  });
}

interface ThemeOpening {
  formation: Formation;
  treatment: TitleTreatment;
  label: (v: CinematicVars) => string;
  log: (v: CinematicVars, d: ReturnType<typeof teamDressing>) => LogLine[];
  fast: (v: CinematicVars, d: ReturnType<typeof teamDressing>) => LogLine[];
  cta: string;
}

const OPENINGS: Record<ThemeId, ThemeOpening> = {
  blacksite: {
    formation: "seal",
    treatment: "stamp",
    label: () => "OPERATION FILE",
    cta: "Enter investigation",
    log: (v, d) => [
      // An operational order, not a boot log: every line is a fact about this team's case.
      { text: `CASE ${v.caseNumber} ISSUED TO ${v.teamName.toUpperCase()}`, status: d.callsign, tone: "info" },
      { text: `${pad(v.files)} FILES ACROSS ${pad(v.acts)} ACTS`, status: `${pad(v.solved)} CLOSED`, tone: "ok" },
      { text: `${pad(v.open)} FILES OPEN TO YOU NOW`, status: v.open ? "go" : "hold", tone: v.open ? "ok" : "warn" },
      { text: `EXHIBITS IN HAND  ${pad(v.held)}/${pad(v.exhibits)}`, status: v.held ? "ok" : "sealed", tone: v.held ? "ok" : "warn" },
      { text: `FACTS FOR THIS TEAM ONLY  ${v.world}`, status: "sealed", tone: "ok" },
      ...v.extraLines.map((t) => ({ text: t.toUpperCase(), status: "ok", tone: "ok" as const })),
    ],
    fast: (v, d) => [{ text: `reacquiring ${d.callsign} · world ${v.world}`, status: "ok", tone: "ok" }],
  },
  "neural-archive": {
    formation: "orb",
    treatment: "bloom",
    label: () => "the archive remembers",
    cta: "Step inside",
    log: (v, d) => [
      { text: "waking the archive", tone: "info" },
      { text: `recognising ${v.teamName}`, status: d.callsign.toLowerCase(), tone: "ok" },
      { text: `${v.files} memories indexed across ${v.acts} chapters`, tone: "ok" },
      { text: `${v.held} of ${v.exhibits} fragments recalled`, status: v.held ? "resonant" : "dormant", tone: v.held ? "ok" : "warn" },
      { text: `world ${v.world.toLowerCase()} settling`, status: "stable", tone: "ok" },
      ...v.extraLines.map((t) => ({ text: t.toLowerCase(), tone: "ok" as const })),
    ],
    fast: (v) => [{ text: `welcome back, ${v.teamName}`, tone: "ok" }],
  },
  "cold-case": {
    formation: "folder",
    treatment: "type",
    label: () => "COLD CASE FILE",
    cta: "Open the file",
    log: (v, d) => [
      { text: `FILE RETRIEVED FROM ARCHIVE`, status: d.dossierNo, tone: "info" },
      { text: `ASSIGNED TO: ${v.teamName.toUpperCase()}`, tone: "ok" },
      { text: `EXHIBITS ON RECORD: ${pad(v.exhibits)}`, status: `${pad(v.held)} HELD`, tone: "ok" },
      { text: `LEADS OUTSTANDING: ${pad(Math.max(0, v.files - v.solved))} OF ${pad(v.files)}`, status: `${pad(v.open)} OPEN NOW`, tone: "warn" },
      { text: `CUSTODY CHAIN ${v.world}`, status: "INTACT", tone: "ok" },
      ...v.extraLines.map((t) => ({ text: t.toUpperCase(), tone: "ok" as const })),
    ],
    fast: (v, d) => [{ text: `FILE ${d.dossierNo} RE-OPENED · ${v.teamName.toUpperCase()}`, tone: "ok" }],
  },
  signal: {
    formation: "spectrum",
    treatment: "scan",
    label: () => "INTERCEPT",
    cta: "Lock on",
    log: (v, d) => [
      { text: "SCANNING BAND 88.0 – 108.0 MHz", status: "sweep", tone: "info" },
      { text: `CARRIER ACQUIRED  ${(88 + (parseInt(v.world.slice(0, 2), 16) % 200) / 10).toFixed(1)} MHz`, status: "lock", tone: "ok" },
      { text: `SIGNAL ${v.world}  ·  ${d.callsign}`, status: "clean", tone: "ok" },
      { text: `${pad(v.files)} TRANSMISSIONS · ${pad(v.acts)} CHANNELS`, status: "ok", tone: "ok" },
      { text: `RECORDINGS DECODED  ${pad(v.held)}/${pad(v.exhibits)}`, status: v.held ? "ok" : "noise", tone: v.held ? "ok" : "warn" },
      ...v.extraLines.map((t) => ({ text: t.toUpperCase(), status: "ok", tone: "ok" as const })),
    ],
    fast: (v, d) => [{ text: `RETUNING ${d.callsign} · ${v.world}`, status: "lock", tone: "ok" }],
  },
};

export function resolveOpening(themeId: ThemeId, mode: OpeningMode, v: CinematicVars): ResolvedScript {
  const o = OPENINGS[themeId];
  const d = teamDressing(v.fingerprint);
  const k = tempo(v);
  const slow = themeId === "neural-archive" ? 1.25 : themeId === "signal" ? 0.9 : 1;
  const title = { caseNumber: v.caseNumber, title: v.title, kicker: v.kicker, label: o.label(v), treatment: o.treatment };
  const shards = shardCensus(v);

  if (mode === "reduced") {
    return { id: `${themeId}:reduced`, mode, formation: o.formation, duration: 0, beats: [], title, autoEnter: 0, shards };
  }

  if (mode === "returning") {
    const beats: Beat[] = [
      { at: 0, kind: "log", lines: o.fast(v, d), interval: 0.2 },
      { at: 0.25, kind: "sound", cue: "lock" },
      { at: 0.35, kind: "title", treatment: o.treatment, duration: 0.55 },
    ];
    return { id: `${themeId}:returning`, mode, formation: o.formation, duration: 1.5, beats, title, autoEnter: 1.5, shards };
  }

  const lines = o.log(v, d);
  const logSpan = lines.length * 0.32;
  const beats: Beat[] = scale(
    [
      { at: 0, kind: "log", lines, interval: 0.32 },
      { at: 0.1, kind: "sound", cue: "tick" },
      { at: logSpan * 0.55, kind: "shards", duration: 2.7 },
      { at: logSpan * 0.55 + 0.4, kind: "sound", cue: "sweep" },
      { at: logSpan + 1.9, kind: "flash", strength: 0.9 },
      { at: logSpan + 1.9, kind: "sound", cue: "impact" },
      { at: logSpan + 2, kind: "title", treatment: o.treatment, duration: 1.1 * slow },
      { at: logSpan + 3.1 * slow, kind: "kicker", duration: 0.9 },
      { at: logSpan + 4.1 * slow, kind: "cta" },
    ],
    k * slow,
  );
  const duration = Math.max(...beats.map((b) => b.at)) + 0.6;
  return { id: `${themeId}:first`, mode, formation: o.formation, duration, beats, title, autoEnter: 0, shards };
}

export function ctaLabel(themeId: ThemeId): string {
  return OPENINGS[themeId].cta;
}

/* ─────────────────────────── First / returning / same-session ─────────────────────────── */

const KEY = (eventId: string, teamName: string) => `dossier.opening.${eventId}.${teamName}`;

/**
 * "first"      never opened this case on this browser → the full sequence
 * "returning"  opened it before, new browser session → a 1.5 s reacquire
 * null         already in this session → nothing at all
 */
export function openingModeFor(eventId: string, teamName: string, reduced: boolean): OpeningMode | null {
  try {
    const seenBefore = window.localStorage.getItem(KEY(eventId, teamName)) === "1";
    const thisSession = window.sessionStorage.getItem(KEY(eventId, teamName)) === "1";
    if (thisSession) return null;
    if (reduced) return seenBefore ? null : "reduced";
    return seenBefore ? "returning" : "first";
  } catch {
    return reduced ? "reduced" : "first";
  }
}

export function markOpeningSeen(eventId: string, teamName: string) {
  try {
    window.localStorage.setItem(KEY(eventId, teamName), "1");
    window.sessionStorage.setItem(KEY(eventId, teamName), "1");
  } catch {
    /* private mode */
  }
}

export function clearOpeningSeen(eventId: string, teamName: string) {
  try {
    window.localStorage.removeItem(KEY(eventId, teamName));
    window.sessionStorage.removeItem(KEY(eventId, teamName));
  } catch {
    /* private mode */
  }
}
