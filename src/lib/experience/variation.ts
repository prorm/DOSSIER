/**
 * Procedural presentation variation.
 *
 * The engine already gives every team its own seeded world (different badges,
 * keys, times, files, answers). This extends the same idea to *dressing*: the
 * dossier number on the folder, the file codes on nodes, evidence tag numbers,
 * the callsign in the HUD, how the universe is rotated, which way the light
 * leans. Same rules, different believable world.
 *
 * SAFETY: everything here is cosmetic and derives from a *presentation
 * fingerprint* — an HMAC of (event, team, "presentation") computed on the
 * server — never from the answer seed. Nothing produced here can be an answer,
 * a key, a gate input or anything that changes what a team must do, and it
 * never reorders anything a team needs to reason about (only decorative lists).
 */

/** xmur3 string hash → 32-bit seed. */
export function hash32(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32: small, fast, deterministic. */
export function prng(seed: string | number): () => number {
  let a = typeof seed === "number" ? seed >>> 0 : hash32(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CALLSIGNS = ["WREN", "HALCYON", "MERLIN", "VESPER", "KITE", "OSPREY", "LARK", "SABLE", "ONYX", "CINDER", "TALON", "NOCTIS", "ORCHID", "FALCON", "EMBER", "RAVEN"];
const AMBIENT = [
  "carrier lock held",
  "relay handshake ok",
  "archive index consistent",
  "custody chain verified",
  "sensor sweep nominal",
  "uplink jitter 4ms",
  "checksum manifest sealed",
  "clock drift corrected",
  "cold storage mounted",
  "audit trail appended",
];

export interface TeamDressing {
  /** The presentation fingerprint this dressing was derived from. */
  id: string;
  /** "7F3A-91C2": the world's short id, shown in the opening and the HUD. */
  world: string;
  /** "DOS-4471" */
  dossierNo: string;
  callsign: string;
  /** -1…1: nudges light temperature / hue inside the theme's own bounds. */
  tone: number;
  /** Rotation of the universe layout (radians), so no two teams' maps look alike. */
  rotation: number;
  /** Stable "F-0841" style code for a file. */
  fileCode: (id: string) => string;
  /** Stable "EX-2291-B" evidence tag. */
  exhibitTag: (id: string) => string;
  /** Decorative status lines in a per-team order. */
  ambient: string[];
  /** Deterministic 0…1 noise keyed by a string (jitter, star positions, pin colours). */
  noise: (key: string) => number;
}

export function teamDressing(fingerprint: string): TeamDressing {
  const fp = (fingerprint || "0000000000000000").replace(/[^0-9a-f]/gi, "0").padEnd(16, "0");
  const r = prng(fp);
  const world = `${fp.slice(0, 4).toUpperCase()}-${fp.slice(4, 8).toUpperCase()}`;
  const dossierNo = `DOS-${String(1000 + Math.floor(r() * 8999))}`;
  const callsign = `${CALLSIGNS[Math.floor(r() * CALLSIGNS.length)]}-${1 + Math.floor(r() * 9)}`;
  const tone = r() * 2 - 1;
  const rotation = (r() - 0.5) * 0.9;
  const order = [...AMBIENT].sort(() => r() - 0.5);
  return {
    id: fp,
    world,
    dossierNo,
    callsign,
    tone,
    rotation,
    fileCode: (id) => `F-${String(hash32(`${fp}:f:${id}`) % 9000 + 1000)}`,
    exhibitTag: (id) => `EX-${String(hash32(`${fp}:e:${id}`) % 9000 + 1000)}-${"ABCDEFGH"[hash32(`${fp}:b:${id}`) % 8]}`,
    ambient: order,
    noise: (key) => hash32(`${fp}:n:${key}`) / 4294967296,
  };
}

/** "CASE 017" from an event id/codename when the organiser hasn't written one. */
export function deriveCaseNumber(eventId: string, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  const digits = /(\d{2,4})/.exec(eventId)?.[1];
  if (digits) return `CASE ${digits.padStart(3, "0")}`;
  return `CASE ${String(hash32(eventId) % 900 + 100)}`;
}

/** A stable 16-hex cosmetic fingerprint for anything that is not a team (Studio previews, demos). */
export function fingerprintOf(seed: string): string {
  return hash32(`fp:${seed}`).toString(16).padStart(8, "0") + hash32(`fp2:${seed}`).toString(16).padStart(8, "0");
}
