import type { Rng } from "../core/rng";

/**
 * A tiny RGB raster with just enough drawing to produce convincing synthetic
 * photos, whiteboards and CCTV frames — including text rendered into pixels
 * (so the clue is in the image content, not in any metadata).
 */

// Classic 5×7 column-major glyphs (bit 0 = top row).
const GLYPHS: Record<string, number[]> = {
  " ": [0, 0, 0, 0, 0], "!": [0, 0, 0x5f, 0, 0], '"': [0, 7, 0, 7, 0], "#": [0x14, 0x7f, 0x14, 0x7f, 0x14],
  "$": [0x24, 0x2a, 0x7f, 0x2a, 0x12], "%": [0x23, 0x13, 0x08, 0x64, 0x62], "&": [0x36, 0x49, 0x56, 0x20, 0x50],
  "'": [0, 0x08, 0x07, 0x03, 0], "(": [0, 0x1c, 0x22, 0x41, 0], ")": [0, 0x41, 0x22, 0x1c, 0], "*": [0x2a, 0x1c, 0x7f, 0x1c, 0x2a],
  "+": [0x08, 0x08, 0x3e, 0x08, 0x08], ",": [0, 0x80, 0x70, 0x30, 0], "-": [0x08, 0x08, 0x08, 0x08, 0x08], ".": [0, 0, 0x60, 0x60, 0],
  "/": [0x20, 0x10, 0x08, 0x04, 0x02], "0": [0x3e, 0x51, 0x49, 0x45, 0x3e], "1": [0, 0x42, 0x7f, 0x40, 0], "2": [0x72, 0x49, 0x49, 0x49, 0x46],
  "3": [0x21, 0x41, 0x49, 0x4d, 0x33], "4": [0x18, 0x14, 0x12, 0x7f, 0x10], "5": [0x27, 0x45, 0x45, 0x45, 0x39], "6": [0x3c, 0x4a, 0x49, 0x49, 0x31],
  "7": [0x41, 0x21, 0x11, 0x09, 0x07], "8": [0x36, 0x49, 0x49, 0x49, 0x36], "9": [0x46, 0x49, 0x49, 0x29, 0x1e], ":": [0, 0, 0x14, 0, 0],
  ";": [0, 0x40, 0x34, 0, 0], "<": [0, 0x08, 0x14, 0x22, 0x41], "=": [0x14, 0x14, 0x14, 0x14, 0x14], ">": [0, 0x41, 0x22, 0x14, 0x08],
  "?": [0x02, 0x01, 0x59, 0x09, 0x06], "@": [0x3e, 0x41, 0x5d, 0x59, 0x4e], A: [0x7c, 0x12, 0x11, 0x12, 0x7c], B: [0x7f, 0x49, 0x49, 0x49, 0x36],
  C: [0x3e, 0x41, 0x41, 0x41, 0x22], D: [0x7f, 0x41, 0x41, 0x41, 0x3e], E: [0x7f, 0x49, 0x49, 0x49, 0x41], F: [0x7f, 0x09, 0x09, 0x09, 0x01],
  G: [0x3e, 0x41, 0x41, 0x51, 0x73], H: [0x7f, 0x08, 0x08, 0x08, 0x7f], I: [0, 0x41, 0x7f, 0x41, 0], J: [0x20, 0x40, 0x41, 0x3f, 0x01],
  K: [0x7f, 0x08, 0x14, 0x22, 0x41], L: [0x7f, 0x40, 0x40, 0x40, 0x40], M: [0x7f, 0x02, 0x1c, 0x02, 0x7f], N: [0x7f, 0x04, 0x08, 0x10, 0x7f],
  O: [0x3e, 0x41, 0x41, 0x41, 0x3e], P: [0x7f, 0x09, 0x09, 0x09, 0x06], Q: [0x3e, 0x41, 0x51, 0x21, 0x5e], R: [0x7f, 0x09, 0x19, 0x29, 0x46],
  S: [0x26, 0x49, 0x49, 0x49, 0x32], T: [0x03, 0x01, 0x7f, 0x01, 0x03], U: [0x3f, 0x40, 0x40, 0x40, 0x3f], V: [0x1f, 0x20, 0x40, 0x20, 0x1f],
  W: [0x3f, 0x40, 0x38, 0x40, 0x3f], X: [0x63, 0x14, 0x08, 0x14, 0x63], Y: [0x03, 0x04, 0x78, 0x04, 0x03], Z: [0x61, 0x59, 0x49, 0x4d, 0x43],
  "[": [0, 0x7f, 0x41, 0x41, 0x41], "]": [0, 0x41, 0x41, 0x41, 0x7f], _: [0x40, 0x40, 0x40, 0x40, 0x40], "|": [0, 0, 0x7f, 0, 0],
};

export function glyph(ch: string): number[] {
  return GLYPHS[ch.toUpperCase()] ?? GLYPHS["?"]!;
}

/** Glyph as rows × cols boolean grid (7 rows, 5 cols). */
export function glyphBitmap(ch: string): boolean[][] {
  const cols = glyph(ch);
  return Array.from({ length: 7 }, (_, r) => cols.map((c) => Boolean((c >> r) & 1)));
}

export type RGB = [number, number, number];

export class Raster {
  readonly data: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
    fill: RGB = [255, 255, 255],
  ) {
    this.data = new Uint8Array(width * height * 3);
    this.rect(0, 0, width, height, fill);
  }

  set(x: number, y: number, c: RGB) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 3;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
  }

  get(x: number, y: number): RGB {
    const i = (y * this.width + x) * 3;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!];
  }

  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = Math.max(0, y); j < Math.min(this.height, y + h); j++) for (let i = Math.max(0, x); i < Math.min(this.width, x + w); i++) this.set(i, j, c);
  }

  /** Vertical gradient between two colours. */
  gradient(top: RGB, bottom: RGB) {
    for (let y = 0; y < this.height; y++) {
      const t = y / Math.max(1, this.height - 1);
      const c: RGB = [0, 1, 2].map((k) => Math.round(top[k]! + (bottom[k]! - top[k]!) * t)) as RGB;
      for (let x = 0; x < this.width; x++) this.set(x, y, c);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB, thick = 1) {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.rect(x0 - (thick >> 1), y0 - (thick >> 1), thick, thick, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  text(x: number, y: number, s: string, scale: number, c: RGB, jitter?: Rng) {
    let cx = x;
    for (const ch of s) {
      const cols = glyph(ch);
      const dy = jitter ? jitter.int(-1, 1) : 0;
      cols.forEach((col, i) => {
        for (let r = 0; r < 8; r++) if ((col >> r) & 1) this.rect(cx + i * scale, y + dy + r * scale, scale, scale, c);
      });
      cx += 6 * scale;
    }
    return cx;
  }

  noise(rng: Rng, amount: number) {
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i]! + rng.int(-amount, amount);
      this.data[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }

  /** Horizontal scanlines (CCTV look). */
  scanlines(every: number, darken: number) {
    for (let y = 0; y < this.height; y += every)
      for (let x = 0; x < this.width; x++) {
        const [r, g, b] = this.get(x, y);
        this.set(x, y, [Math.max(0, r - darken), Math.max(0, g - darken), Math.max(0, b - darken)]);
      }
  }

  vignette(strength: number) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const max = Math.hypot(cx, cy);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const f = 1 - strength * (Math.hypot(x - cx, y - cy) / max) ** 2;
        const [r, g, b] = this.get(x, y);
        this.set(x, y, [Math.round(r * f), Math.round(g * f), Math.round(b * f)]);
      }
  }
}
