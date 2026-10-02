import { ByteWriter } from "./bytes";
import { MORSE } from "../core/ciphers";
import { glyphBitmap } from "./raster";
import type { Rng } from "../core/rng";

/**
 * PCM audio synthesis for audio-forensics challenges. Everything here produces
 * genuine signal content: Morse keyed tones, DTMF dual tones, text painted into
 * the spectrogram, reversed segments and per-channel payloads.
 */

export type Samples = Float32Array;

export function silence(rate: number, seconds: number): Samples {
  return new Float32Array(Math.round(rate * seconds));
}

function envelope(i: number, n: number, ramp: number) {
  if (i < ramp) return i / ramp;
  if (i > n - ramp) return Math.max(0, (n - i) / ramp);
  return 1;
}

export function tone(rate: number, freqs: number[], seconds: number, amp = 0.5): Samples {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  const ramp = Math.min(n / 4, rate * 0.004);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const f of freqs) v += Math.sin((2 * Math.PI * f * i) / rate);
    out[i] = (v / freqs.length) * amp * envelope(i, n, ramp);
  }
  return out;
}

export function join(parts: Samples[]): Samples {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function mix(a: Samples, b: Samples, gainB = 1): Samples {
  const out = new Float32Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0) * gainB;
  return out;
}

export function reverse(s: Samples): Samples {
  return Float32Array.from(s).reverse();
}

export function noise(rng: Rng, rate: number, seconds: number, amp: number): Samples {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = last * 0.6 + (rng.next() * 2 - 1) * 0.4; // slightly pink
    out[i] = last * amp;
  }
  return out;
}

/** International Morse at `wpm` words per minute (PARIS timing). */
export function morseAudio(rate: number, text: string, opts: { wpm?: number; freq?: number; amp?: number } = {}): Samples {
  const unit = 1.2 / (opts.wpm ?? 14);
  const f = opts.freq ?? 700;
  const parts: Samples[] = [];
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  words.forEach((w, wi) => {
    [...w].forEach((ch, ci) => {
      const code = MORSE[ch];
      if (!code) return;
      [...code].forEach((sym, si) => {
        parts.push(tone(rate, [f], sym === "." ? unit : unit * 3, opts.amp ?? 0.6));
        if (si < code.length - 1) parts.push(silence(rate, unit));
      });
      if (ci < w.length - 1) parts.push(silence(rate, unit * 3));
    });
    if (wi < words.length - 1) parts.push(silence(rate, unit * 7));
  });
  return join(parts);
}

const DTMF: Record<string, [number, number]> = {
  "1": [697, 1209], "2": [697, 1336], "3": [697, 1477], A: [697, 1633],
  "4": [770, 1209], "5": [770, 1336], "6": [770, 1477], B: [770, 1633],
  "7": [852, 1209], "8": [852, 1336], "9": [852, 1477], C: [852, 1633],
  "*": [941, 1209], "0": [941, 1336], "#": [941, 1477], D: [941, 1633],
};

export function dtmfAudio(rate: number, digits: string, opts: { tone?: number; gap?: number; amp?: number } = {}): Samples {
  const parts: Samples[] = [];
  for (const d of digits.toUpperCase()) {
    const f = DTMF[d];
    if (!f) continue;
    parts.push(tone(rate, f, opts.tone ?? 0.18, opts.amp ?? 0.5), silence(rate, opts.gap ?? 0.12));
  }
  return join(parts);
}

/**
 * Paints `text` into the spectrogram: each glyph column is a time slice and
 * each lit pixel row a sine at a frequency between fLow and fHigh (top row =
 * highest frequency). Visible in Audacity / Sonic Visualiser spectrogram view.
 */
export function spectrogramText(rate: number, text: string, opts: { fLow?: number; fHigh?: number; colSeconds?: number; amp?: number } = {}): Samples {
  const fLow = opts.fLow ?? 2500;
  const fHigh = opts.fHigh ?? 7500;
  const col = opts.colSeconds ?? 0.07;
  const rows = 7;
  const freqs = Array.from({ length: rows }, (_, r) => fHigh - (r * (fHigh - fLow)) / (rows - 1));
  const columns: boolean[][] = [];
  for (const ch of text) {
    const bm = glyphBitmap(ch);
    for (let c = 0; c < 5; c++) columns.push(bm.map((row) => row[c]!));
    columns.push(new Array(rows).fill(false));
  }
  const parts = columns.map((lit) => {
    const fs = freqs.filter((_, r) => lit[r]);
    return fs.length ? tone(rate, fs, col, (opts.amp ?? 0.35) * Math.min(1, 2 / Math.sqrt(fs.length))) : silence(rate, col);
  });
  return join(parts);
}

export function normalizePeak(s: Samples, peak = 0.9): Samples {
  let m = 0;
  for (const v of s) m = Math.max(m, Math.abs(v));
  if (m === 0) return s;
  const k = peak / m;
  return s.map((v) => v * k);
}

/** 16-bit PCM WAV (mono or stereo). */
export function encodeWav(rate: number, channels: Samples[], opts: { info?: Record<string, string> } = {}): Uint8Array {
  const nch = channels.length;
  const len = Math.max(...channels.map((c) => c.length));
  const dataBytes = len * nch * 2;
  const info = new ByteWriter();
  const entries = Object.entries(opts.info ?? {});
  if (entries.length) {
    info.str("INFO");
    for (const [k, v] of entries) {
      const bytes = Buffer.from(`${v}\0`, "latin1");
      info.str(k.slice(0, 4).padEnd(4, " ")).u32le(bytes.length).bytes(new Uint8Array(bytes));
      if (bytes.length & 1) info.u8(0);
    }
  }
  const infoChunk = info.done();
  const w = new ByteWriter(44 + dataBytes + infoChunk.length + 8);
  w.str("RIFF").u32le(36 + dataBytes + (infoChunk.length ? infoChunk.length + 8 : 0)).str("WAVE");
  w.str("fmt ").u32le(16).u16le(1).u16le(nch).u32le(rate).u32le(rate * nch * 2).u16le(nch * 2).u16le(16);
  if (infoChunk.length) w.str("LIST").u32le(infoChunk.length).bytes(infoChunk);
  w.str("data").u32le(dataBytes);
  for (let i = 0; i < len; i++)
    for (let c = 0; c < nch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c]![i] ?? 0));
      w.i16le(Math.round(v * 32767));
    }
  return w.done();
}

/** Parses a PCM16 WAV back into float channels (tests / solver bots). */
export function decodeWav(buf: Uint8Array): { rate: number; channels: Samples[]; info: Record<string, string> } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 12;
  let rate = 0;
  let nch = 1;
  const info: Record<string, string> = {};
  let channels: Samples[] = [];
  while (o + 8 <= buf.length) {
    const id = Buffer.from(buf.subarray(o, o + 4)).toString("latin1");
    const size = dv.getUint32(o + 4, true);
    if (id === "fmt ") {
      nch = dv.getUint16(o + 10, true);
      rate = dv.getUint32(o + 12, true);
    } else if (id === "LIST") {
      let p = o + 12;
      while (p < o + 8 + size) {
        const k = Buffer.from(buf.subarray(p, p + 4)).toString("latin1");
        const n = dv.getUint32(p + 4, true);
        info[k] = Buffer.from(buf.subarray(p + 8, p + 8 + n)).toString("latin1").replace(/\0+$/, "");
        p += 8 + n + (n & 1);
      }
    } else if (id === "data") {
      const frames = size / (2 * nch);
      channels = Array.from({ length: nch }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i++) for (let c = 0; c < nch; c++) channels[c]![i] = dv.getInt16(o + 8 + (i * nch + c) * 2, true) / 32767;
    }
    o += 8 + size + (size & 1);
  }
  return { rate, channels, info };
}

/** Energy-envelope Morse decoder (used by tests to prove the audio really carries the code). */
export function decodeMorse(s: Samples, rate: number): string {
  const win = Math.round(rate * 0.005);
  const on: boolean[] = [];
  let peak = 0;
  const env: number[] = [];
  for (let i = 0; i < s.length; i += win) {
    let e = 0;
    for (let k = i; k < Math.min(s.length, i + win); k++) e += s[k]! * s[k]!;
    env.push(Math.sqrt(e / win));
    peak = Math.max(peak, env.at(-1)!);
  }
  for (const e of env) on.push(e > peak * 0.35);
  const runs: { on: boolean; n: number }[] = [];
  for (const b of on) {
    if (runs.length && runs.at(-1)!.on === b) runs.at(-1)!.n++;
    else runs.push({ on: b, n: 1 });
  }
  const marks = runs.filter((r) => r.on).map((r) => r.n);
  if (!marks.length) return "";
  const unit = Math.min(...marks);
  const rev = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
  let out = "";
  let sym = "";
  for (const r of runs) {
    if (r.on) sym += r.n > unit * 2 ? "-" : ".";
    else if (r.n > unit * 5) {
      if (sym) out += rev[sym] ?? "?";
      sym = "";
      out += " ";
    } else if (r.n > unit * 2) {
      if (sym) out += rev[sym] ?? "?";
      sym = "";
    }
  }
  if (sym) out += rev[sym] ?? "?";
  return out.trim();
}
