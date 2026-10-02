import { createHash, createHmac } from "node:crypto";

/**
 * Deterministic PRNG (sfc32) seeded from a hex/utf8 seed. Every procedural
 * generator in DOSSIER draws from one of these so that a (event, team, node)
 * triple always produces byte-identical content.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  readonly seed: string;

  constructor(seed: string) {
    this.seed = seed;
    const h = createHash("sha256").update(seed).digest();
    this.a = h.readUInt32LE(0);
    this.b = h.readUInt32LE(4);
    this.c = h.readUInt32LE(8);
    this.d = h.readUInt32LE(12);
    for (let i = 0; i < 12; i++) this.u32();
  }

  /** Raw 32-bit output. */
  u32(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.u32() / 4294967296;
  }

  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(list: readonly T[]): T {
    if (list.length === 0) throw new Error("Rng.pick on empty list");
    return list[Math.floor(this.next() * list.length)]!;
  }

  shuffle<T>(list: readonly T[]): T[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  sample<T>(list: readonly T[], n: number): T[] {
    return this.shuffle(list).slice(0, Math.max(0, Math.min(n, list.length)));
  }

  hex(bytes: number): string {
    let s = "";
    for (let i = 0; i < bytes; i++) s += this.int(0, 255).toString(16).padStart(2, "0");
    return s;
  }

  bytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = this.int(0, 255);
    return out;
  }

  /**
   * Pattern codes: `#` digit, `?` uppercase letter (no I/O), `*` uppercase
   * alphanumeric (no ambiguous glyphs), `x` lowercase hex. Other characters
   * are literal.
   */
  code(pattern: string): string {
    const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (const ch of pattern) {
      if (ch === "#") s += String(this.int(0, 9));
      else if (ch === "?") s += L[this.int(0, L.length - 1)];
      else if (ch === "*") s += A[this.int(0, A.length - 1)];
      else if (ch === "x") s += "0123456789abcdef"[this.int(0, 15)];
      else s += ch;
    }
    return s;
  }

  /** Independent child stream (order-insensitive: forking does not advance this stream). */
  fork(label: string): Rng {
    return new Rng(`${this.seed}/${label}`);
  }
}

/**
 * Keyed instance seed. The key is a server secret: generators are open source,
 * so an unkeyed seed (e.g. sha256(event+team+node)) would let a player compute
 * their own answers offline.
 */
export function instanceSeed(secret: string, eventId: string, teamId: string, scope: string): string {
  return createHmac("sha256", secret).update(`dossier-seed|v1|${eventId}|${teamId}|${scope}`).digest("hex");
}
