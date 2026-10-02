/**
 * DOSSIER presentation themes.
 *
 * A theme is not a palette. It decides how an event *behaves* on screen:
 * typography, surface language, navigation, density, how the case universe is
 * laid out and lit, how strings and exhibits look on the board, what the
 * opening sequence is made of and what every state change sounds like.
 *
 * This module is pure data (no React, no DOM) so the server can validate a
 * theme id, generate the CSS, and Studio can preview any theme without
 * publishing. The blueprint stores only `presentation.theme` (an id).
 */

export const THEME_IDS = ["blacksite", "neural-archive", "cold-case", "signal"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = "blacksite";

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === "string" && (THEME_IDS as readonly string[]).includes(v);
}

export type NavStyle = "rail" | "dock" | "tabs" | "tuner";
export type SurfaceStyle = "slab" | "glass" | "paper" | "console";
export type UniverseLayout = "strata" | "organic" | "wall" | "tunnel";
export type BackdropStyle = "grid-void" | "nebula" | "wall" | "spectrum";
export type NodeStyle = "crystal" | "orb" | "card" | "pulse";
export type EdgeStyle = "beam" | "filament" | "string" | "wave";
export type Formation = "seal" | "orb" | "folder" | "spectrum";
export type BoardMaterial = "holo" | "glass" | "cork" | "scope";

export interface Signals {
  green: string;
  cyan: string;
  magenta: string;
  amber: string;
}

export interface ThemePalette {
  bg: string;
  surface: string;
  raised: string;
  overlay: string;
  line: string;
  lineStrong: string;
  ink: string;
  inkDim: string;
  mute: string;
  faint: string;
  /** Text colour on top of a solid accent fill. */
  accentInk: string;
}

export interface SoundProfile {
  /** Base pitch in Hz; every cue is a small musical figure around it. */
  root: number;
  wave: OscillatorType;
  /** Length multiplier (long tails feel calmer). */
  tail: number;
  gain: number;
  /** Optional noise burst on impact cues (paper thump, static, key clack). */
  noise: number;
}

export interface UniverseParams {
  layout: UniverseLayout;
  backdrop: BackdropStyle;
  nodeStyle: NodeStyle;
  edgeStyle: EdgeStyle;
  /** Hex colours by presentation state. */
  colors: {
    locked: string;
    discovered: string;
    available: string;
    completed: string;
    failed: string;
    suspicious: string;
    edge: string;
    edgeLive: string;
    backdrop: string;
    fog: string;
  };
  fogDensity: number;
  bloom: number;
  vignette: number;
  grain: number;
  particles: number;
  /** Camera field of view and resting distance. */
  fov: number;
  distance: number;
  /** How strongly the camera drifts and follows the pointer (0 = locked off). */
  drift: number;
  /** Lighting temperature bias, -1 (cold) … 1 (warm). */
  warmth: number;
}

export interface ThemeDef {
  id: ThemeId;
  name: string;
  tagline: string;
  description: string;
  scheme: "dark" | "light";
  palette: ThemePalette;
  signals: Signals;
  /** The theme's own signature colour (used by hero moments, never by state). */
  brand: string;
  brand2: string;
  /**
   * "event": the organiser's accent colour drives highlights (Blacksite, Signal – palettes built around signal colours).
   * "theme": the theme's own brand colours do (Neural Archive is lilac, Cold Case is stamp red, whatever the accent says).
   */
  accentMode: "event" | "theme";
  fonts: { display: string; sans: string; mono: string };
  /** Corner language: controls (buttons, fields), chips (badges), panels. */
  radius: { ctl: string; chip: string; panel: string };
  surface: SurfaceStyle;
  density: "compact" | "comfortable" | "airy";
  nav: NavStyle;
  /** 2D vs 3D emphasis: how much of the player experience is spatial. */
  spatial: "high" | "medium" | "low";
  universe: UniverseParams;
  board: { material: BoardMaterial; pin: string; string: string };
  formation: Formation;
  motion: {
    /** Multiplier applied to durations (>1 = slower, calmer). */
    durationScale: number;
    /** CSS easing for UI transitions. */
    ease: string;
    /** 0 (restrained) … 1 (theatrical). */
    intensity: number;
  };
  sound: SoundProfile;
}

/* ─────────────────────────── The four themes ─────────────────────────── */

const blacksite: ThemeDef = {
  id: "blacksite",
  name: "BLACKSITE",
  tagline: "Classified. Cold. Tactical.",
  description: "A sealed operations floor. Graphite surfaces, phosphor signals, layered tactical depth. Files sit in strata; the further you get, the deeper the map goes.",
  scheme: "dark",
  palette: {
    bg: "#05070a",
    surface: "#0b1017",
    raised: "#111a24",
    overlay: "#16212d",
    line: "#1c2a38",
    lineStrong: "#2a3d50",
    ink: "#d7e4f0",
    inkDim: "#a9bccf",
    mute: "#7f93a8",
    faint: "#4f6377",
    accentInk: "#03140b",
  },
  signals: { green: "#39ff88", cyan: "#00e5ff", magenta: "#ff2e88", amber: "#ffb020" },
  brand: "#39ff88",
  brand2: "#00e5ff",
  accentMode: "event",
  fonts: {
    display: "var(--font-jetbrains), ui-monospace, monospace",
    sans: "var(--font-plex), ui-sans-serif, system-ui, sans-serif",
    mono: "var(--font-jetbrains), ui-monospace, monospace",
  },
  radius: { ctl: "3px", chip: "2px", panel: "5px" },
  surface: "slab",
  density: "compact",
  nav: "rail",
  spatial: "high",
  universe: {
    layout: "strata",
    backdrop: "grid-void",
    nodeStyle: "crystal",
    edgeStyle: "beam",
    colors: {
      locked: "#2b3b4d",
      discovered: "#5b7c99",
      available: "#39ff88",
      completed: "#00e5ff",
      failed: "#ff2e88",
      suspicious: "#ffb020",
      edge: "#27506a",
      edgeLive: "#39ff88",
      backdrop: "#04060a",
      fog: "#04060a",
    },
    fogDensity: 0.028,
    bloom: 0.7,
    vignette: 0.55,
    grain: 0.05,
    particles: 90,
    fov: 42,
    distance: 30,
    drift: 0.6,
    warmth: -0.2,
  },
  board: { material: "holo", pin: "#ff2e88", string: "#ff2e88" },
  formation: "seal",
  motion: { durationScale: 1, ease: "cubic-bezier(0.23, 1, 0.32, 1)", intensity: 0.7 },
  sound: { root: 196, wave: "sine", tail: 1, gain: 0.05, noise: 0.15 },
};

const neuralArchive: ThemeDef = {
  id: "neural-archive",
  name: "NEURAL ARCHIVE",
  tagline: "Memory, remembered.",
  description: "A living archive suspended in dark glass. Soft light, slow motion, ideas that drift together. Evidence clusters like memory and connections grow like nerves.",
  scheme: "dark",
  palette: {
    bg: "#070614",
    surface: "#0e0c25",
    raised: "#16133a",
    overlay: "#1e1a4d",
    line: "#2a2560",
    lineStrong: "#3d3785",
    ink: "#efeaff",
    inkDim: "#c6bff0",
    mute: "#928bc8",
    faint: "#5d5793",
    accentInk: "#0a0620",
  },
  signals: { green: "#5eead4", cyan: "#7dd3fc", magenta: "#f472b6", amber: "#fcd34d" },
  brand: "#a78bfa",
  brand2: "#5eead4",
  accentMode: "theme",
  fonts: {
    display: "var(--font-instrument), Georgia, serif",
    sans: "var(--font-plex), ui-sans-serif, system-ui, sans-serif",
    mono: "var(--font-jetbrains), ui-monospace, monospace",
  },
  radius: { ctl: "999px", chip: "999px", panel: "22px" },
  surface: "glass",
  density: "airy",
  nav: "dock",
  spatial: "high",
  universe: {
    layout: "organic",
    backdrop: "nebula",
    nodeStyle: "orb",
    edgeStyle: "filament",
    colors: {
      locked: "#332d6b",
      discovered: "#7c6fd6",
      available: "#a78bfa",
      completed: "#5eead4",
      failed: "#f472b6",
      suspicious: "#fcd34d",
      edge: "#4b3fa8",
      edgeLive: "#c4b5fd",
      backdrop: "#06051a",
      fog: "#0a0824",
    },
    fogDensity: 0.02,
    bloom: 1.15,
    vignette: 0.6,
    grain: 0.06,
    particles: 220,
    fov: 46,
    distance: 32,
    drift: 1,
    warmth: 0.1,
  },
  board: { material: "glass", pin: "#c4b5fd", string: "#c4b5fd" },
  formation: "orb",
  motion: { durationScale: 1.35, ease: "cubic-bezier(0.22, 0.8, 0.25, 1)", intensity: 0.85 },
  sound: { root: 261.6, wave: "sine", tail: 2.2, gain: 0.045, noise: 0 },
};

const coldCase: ThemeDef = {
  id: "cold-case",
  name: "COLD CASE",
  tagline: "Paper never forgets.",
  description: "An evidence room under a desk lamp. Manila folders, typewriter labels, red string. The map is a wall of pinned cards; the board is real cork.",
  scheme: "light",
  palette: {
    bg: "#e6dcc5",
    surface: "#f4edda",
    raised: "#faf5e8",
    overlay: "#fffdf6",
    line: "#c9bc9a",
    lineStrong: "#a6976f",
    ink: "#221d14",
    inkDim: "#3f3828",
    mute: "#675d47",
    faint: "#8c8168",
    accentInk: "#fdf8ec",
  },
  signals: { green: "#2f6b3f", cyan: "#1f4e79", magenta: "#a4262c", amber: "#9a5b00" },
  brand: "#a4262c",
  brand2: "#1f4e79",
  accentMode: "theme",
  fonts: {
    display: "var(--font-courier), 'Courier New', monospace",
    sans: "var(--font-newsreader), Georgia, serif",
    mono: "var(--font-courier), 'Courier New', monospace",
  },
  radius: { ctl: "1px", chip: "1px", panel: "2px" },
  surface: "paper",
  density: "comfortable",
  nav: "tabs",
  spatial: "medium",
  universe: {
    layout: "wall",
    backdrop: "wall",
    nodeStyle: "card",
    edgeStyle: "string",
    colors: {
      locked: "#b7ab8c",
      discovered: "#8a7d5c",
      available: "#a4262c",
      completed: "#2f6b3f",
      failed: "#3a3226",
      suspicious: "#9a5b00",
      edge: "#a4262c",
      edgeLive: "#c8322f",
      backdrop: "#5b4630",
      fog: "#3a2c1c",
    },
    fogDensity: 0.006,
    bloom: 0,
    vignette: 0.7,
    // Film grain, not sandpaper: typed cards have to stay legible under it.
    grain: 0.04,
    particles: 26,
    fov: 30,
    distance: 44,
    drift: 0.35,
    warmth: 0.8,
  },
  board: { material: "cork", pin: "#b3261e", string: "#b3261e" },
  formation: "folder",
  motion: { durationScale: 1.15, ease: "cubic-bezier(0.3, 0.7, 0.3, 1)", intensity: 0.5 },
  sound: { root: 130.8, wave: "triangle", tail: 0.6, gain: 0.06, noise: 0.6 },
};

const signal: ThemeDef = {
  id: "signal",
  name: "SIGNAL",
  tagline: "Tune in. Lock on.",
  description: "A broadcast intercept station. Everything is a waveform: progress is a signal path, files are pulses on a carrier, and the map is a tunnel you fly down.",
  scheme: "dark",
  palette: {
    bg: "#03050b",
    surface: "#080d18",
    raised: "#0d1526",
    overlay: "#121d34",
    line: "#182644",
    lineStrong: "#26396a",
    ink: "#e8f1ff",
    inkDim: "#b6c8ea",
    mute: "#7f96c2",
    faint: "#4d6290",
    accentInk: "#010612",
  },
  signals: { green: "#3dffc0", cyan: "#26d4ff", magenta: "#ff3d8b", amber: "#ffb020" },
  brand: "#26d4ff",
  brand2: "#ff3d8b",
  accentMode: "event",
  fonts: {
    display: "var(--font-chakra), var(--font-plex), sans-serif",
    sans: "var(--font-plex), ui-sans-serif, system-ui, sans-serif",
    mono: "var(--font-jetbrains), ui-monospace, monospace",
  },
  radius: { ctl: "0px", chip: "0px", panel: "0px" },
  surface: "console",
  density: "compact",
  nav: "tuner",
  spatial: "high",
  universe: {
    layout: "tunnel",
    backdrop: "spectrum",
    nodeStyle: "pulse",
    edgeStyle: "wave",
    colors: {
      locked: "#1f2f57",
      discovered: "#3f62b5",
      available: "#26d4ff",
      completed: "#3dffc0",
      failed: "#ff3d8b",
      suspicious: "#ffb020",
      edge: "#22407f",
      edgeLive: "#26d4ff",
      backdrop: "#02040a",
      fog: "#02040a",
    },
    fogDensity: 0.022,
    bloom: 0.95,
    vignette: 0.5,
    grain: 0.035,
    particles: 140,
    fov: 58,
    distance: 26,
    drift: 0.85,
    warmth: -0.4,
  },
  board: { material: "scope", pin: "#3dffc0", string: "#26d4ff" },
  formation: "spectrum",
  motion: { durationScale: 0.85, ease: "cubic-bezier(0.16, 1, 0.3, 1)", intensity: 0.95 },
  sound: { root: 220, wave: "square", tail: 0.55, gain: 0.03, noise: 0.25 },
};

export const THEMES: Record<ThemeId, ThemeDef> = {
  blacksite,
  "neural-archive": neuralArchive,
  "cold-case": coldCase,
  signal,
};

export function getTheme(id: string | null | undefined): ThemeDef {
  return isThemeId(id) ? THEMES[id] : THEMES[DEFAULT_THEME];
}

/** The theme as this event wears it: "event"-accent themes take the organiser's accent for what is open and alive. */
export function withAccent(theme: ThemeDef, accent: string | null | undefined): ThemeDef {
  if (theme.accentMode !== "event") return theme;
  const hex = theme.signals[(accent as keyof Signals) ?? "green"];
  if (!hex) return theme;
  return { ...theme, universe: { ...theme.universe, colors: { ...theme.universe.colors, available: hex, edgeLive: hex } } };
}

export const THEME_LIST: ThemeDef[] = THEME_IDS.map((id) => THEMES[id]);

/* ─────────────────────────── CSS generation ─────────────────────────── */

/** Accent names an organiser can choose; each theme tunes what they look like. */
export const ACCENT_NAMES = ["green", "cyan", "magenta", "amber"] as const;

function vars(t: ThemeDef): string {
  const p = t.palette;
  const s = t.signals;
  return [
    `--color-bg:${p.bg}`,
    `--color-surface:${p.surface}`,
    `--color-raised:${p.raised}`,
    `--color-overlay:${p.overlay}`,
    `--color-line:${p.line}`,
    `--color-line-strong:${p.lineStrong}`,
    `--color-ink:${p.ink}`,
    `--color-ink-dim:${p.inkDim}`,
    `--color-mute:${p.mute}`,
    `--color-faint:${p.faint}`,
    `--color-signal-green:${s.green}`,
    `--color-signal-cyan:${s.cyan}`,
    `--color-signal-magenta:${s.magenta}`,
    `--color-signal-amber:${s.amber}`,
    `--accent-ink:${p.accentInk}`,
    `--brand:${t.brand}`,
    `--brand-2:${t.brand2}`,
    // Themes with a strong identity own their highlight colours; the others follow the organiser's accent.
    ...(t.accentMode === "theme" ? [`--accent:${t.brand}`, `--accent-2:${t.brand2}`] : []),
    `--font-mono:${t.fonts.mono}`,
    `--font-sans:${t.fonts.sans}`,
    `--font-display:${t.fonts.display}`,
    `--r-ctl:${t.radius.ctl}`,
    `--r-chip:${t.radius.chip}`,
    `--r-panel:${t.radius.panel}`,
    // Wells, plots, editors: big enough to read as rounded, never so round that a wide block becomes an oval.
    `--r-well:min(${t.radius.panel},14px)`,
    `--radius-md:${t.radius.panel}`,
    `--theme-ease:${t.motion.ease}`,
    `--theme-dur:${t.motion.durationScale}`,
    `--pin:${t.board.pin}`,
    `--string:${t.board.string}`,
    `--u-available:${t.universe.colors.available}`,
    `--u-completed:${t.universe.colors.completed}`,
    `--u-locked:${t.universe.colors.locked}`,
    `--u-suspicious:${t.universe.colors.suspicious}`,
    `color-scheme:${t.scheme}`,
  ].join(";");
}

/** All four theme blocks as one stylesheet (~2 KB). Single source of truth for tokens. */
export function themeStyleSheet(): string {
  return THEME_LIST.map((t) => `:root[data-dossier-theme="${t.id}"]{${vars(t)}}`).join("\n");
}

/** Minimal token block for a scoped preview (Studio previews a theme inside a container). */
export function themeScopeStyle(id: ThemeId): Record<string, string> {
  const t = THEMES[id];
  const out: Record<string, string> = {};
  for (const decl of vars(t).split(";")) {
    const i = decl.indexOf(":");
    const key = decl.slice(0, i);
    // React wants camelCase for real CSS properties; custom properties keep their dashes.
    out[key === "color-scheme" ? "colorScheme" : key] = decl.slice(i + 1);
  }
  return out;
}
