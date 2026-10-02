import { deflateSync, inflateSync } from "node:zlib";
import { ByteWriter, crc32, concat, ascii, utf8 } from "./bytes";
import type { Raster } from "./raster";

/**
 * Real PNG encoder (RGB8, filter 0) with support for the things forensic
 * challenges hide in PNGs: tEXt / zTXt / iTXt chunks, private ancillary
 * chunks, data after IEND, and LSB steganography in the pixel data.
 */

const SIG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type: string, data: Uint8Array): Uint8Array {
  const w = new ByteWriter(data.length + 12);
  w.u32be(data.length);
  const td = concat([ascii(type), data]);
  w.bytes(td);
  w.u32be(crc32(td));
  return w.done();
}

export interface PngOptions {
  text?: { keyword: string; text: string }[];
  ztext?: { keyword: string; text: string }[];
  itext?: { keyword: string; text: string }[];
  /** Private ancillary chunks: 4-letter type, lowercase first letter (e.g. "dsSr"). */
  custom?: { type: string; data: Uint8Array }[];
  /** Bytes appended after IEND (ignored by viewers, visible to binwalk / hexdump). */
  trailer?: Uint8Array;
  /** Hide text in the least-significant bits of R,G,B (row-major, MSB-first bytes, NUL-terminated). */
  lsb?: string;
}

/** Writes `message` into the LSB of each channel, in the order zsteg's `b1,rgb,lsb,xy` reads it. */
export function embedLsb(r: Raster, message: string) {
  const bytes = concat([utf8(message), Uint8Array.of(0)]);
  const bits = bytes.length * 8;
  if (bits > r.data.length) throw new Error("image too small for LSB payload");
  for (let i = 0; i < bits; i++) {
    const bit = (bytes[i >> 3]! >> (7 - (i & 7))) & 1;
    r.data[i] = (r.data[i]! & 0xfe) | bit;
  }
}

export function extractLsb(pixels: Uint8Array, maxBytes = 4096): string {
  const out: number[] = [];
  for (let i = 0; i + 8 <= pixels.length && out.length < maxBytes; i += 8) {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | (pixels[i + k]! & 1);
    if (b === 0) break;
    out.push(b);
  }
  return Buffer.from(out).toString("utf8");
}

export function encodePng(r: Raster, opts: PngOptions = {}): Uint8Array {
  if (opts.lsb) embedLsb(r, opts.lsb);
  const ihdr = new ByteWriter(13);
  ihdr.u32be(r.width).u32be(r.height).u8(8).u8(2).u8(0).u8(0).u8(0);
  const raw = new Uint8Array((r.width * 3 + 1) * r.height);
  for (let y = 0; y < r.height; y++) {
    raw[y * (r.width * 3 + 1)] = 0;
    raw.set(r.data.subarray(y * r.width * 3, (y + 1) * r.width * 3), y * (r.width * 3 + 1) + 1);
  }
  const parts: Uint8Array[] = [SIG, chunk("IHDR", ihdr.done())];
  for (const t of opts.text ?? []) parts.push(chunk("tEXt", concat([ascii(t.keyword), Uint8Array.of(0), ascii(t.text)])));
  for (const t of opts.ztext ?? []) parts.push(chunk("zTXt", concat([ascii(t.keyword), Uint8Array.of(0, 0), new Uint8Array(deflateSync(Buffer.from(t.text, "latin1")))])));
  for (const t of opts.itext ?? []) parts.push(chunk("iTXt", concat([ascii(t.keyword), Uint8Array.of(0, 0, 0, 0, 0), utf8(t.text)])));
  for (const c of opts.custom ?? []) parts.push(chunk(c.type, c.data));
  parts.push(chunk("IDAT", new Uint8Array(deflateSync(Buffer.from(raw), { level: 6 }))));
  parts.push(chunk("IEND", new Uint8Array(0)));
  if (opts.trailer) parts.push(opts.trailer);
  return concat(parts);
}

export interface PngChunk {
  type: string;
  data: Uint8Array;
  crcOk: boolean;
}

/** Minimal PNG reader (for tests and the forensic solver bot). */
export function readPngChunks(buf: Uint8Array): { chunks: PngChunk[]; trailer: Uint8Array } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error("not a PNG");
  const chunks: PngChunk[] = [];
  let o = 8;
  while (o + 12 <= buf.length) {
    const len = dv.getUint32(o);
    const type = Buffer.from(buf.subarray(o + 4, o + 8)).toString("latin1");
    const data = buf.subarray(o + 8, o + 8 + len);
    const crc = dv.getUint32(o + 8 + len);
    chunks.push({ type, data, crcOk: crc === crc32(buf.subarray(o + 4, o + 8 + len)) });
    o += 12 + len;
    if (type === "IEND") break;
  }
  return { chunks, trailer: buf.subarray(o) };
}

export function decodePngPixels(buf: Uint8Array): { width: number; height: number; pixels: Uint8Array } {
  const { chunks } = readPngChunks(buf);
  const ihdr = chunks.find((c) => c.type === "IHDR")!;
  const dv = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength);
  const width = dv.getUint32(0);
  const height = dv.getUint32(4);
  const idat = concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data));
  const raw = new Uint8Array(inflateSync(Buffer.from(idat)));
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) pixels.set(raw.subarray(y * (width * 3 + 1) + 1, (y + 1) * (width * 3 + 1)), y * width * 3);
  return { width, height, pixels };
}

export function pngTextChunks(buf: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of readPngChunks(buf).chunks) {
    if (c.type === "tEXt") {
      const i = c.data.indexOf(0);
      out[Buffer.from(c.data.subarray(0, i)).toString("latin1")] = Buffer.from(c.data.subarray(i + 1)).toString("latin1");
    } else if (c.type === "zTXt") {
      const i = c.data.indexOf(0);
      out[Buffer.from(c.data.subarray(0, i)).toString("latin1")] = inflateSync(Buffer.from(c.data.subarray(i + 2))).toString("latin1");
    } else if (c.type === "iTXt") {
      const i = c.data.indexOf(0);
      out[Buffer.from(c.data.subarray(0, i)).toString("latin1")] = Buffer.from(c.data.subarray(i + 5)).toString("utf8");
    }
  }
  return out;
}
