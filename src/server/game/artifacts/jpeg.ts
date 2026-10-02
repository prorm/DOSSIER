import { ByteWriter, ascii, concat } from "./bytes";
import type { Raster } from "./raster";

/**
 * Baseline JPEG encoder (YCbCr 4:4:4, standard quantisation, one shared set of
 * standard luminance Huffman tables) plus an EXIF (APP1/TIFF) writer and
 * reader. Output opens in every viewer and is readable by exiftool.
 */

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22,
  15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];

const Q_LUM = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103,
  77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const Q_CHR = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, ...new Array(32).fill(99),
];

const DC_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42,
  0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35,
  0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67,
  0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
  0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7,
  0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4,
  0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
];

function huffCodes(bits: number[], vals: number[]) {
  const table = new Map<number, [number, number]>();
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < bits[len - 1]!; i++) table.set(vals[k++]!, [code++, len]);
    code <<= 1;
  }
  return table;
}
const DC = huffCodes(DC_BITS, DC_VALS);
const AC = huffCodes(AC_BITS, AC_VALS);

function scaleQ(base: number[], quality: number) {
  const q = Math.max(1, Math.min(100, quality));
  const s = q < 50 ? 5000 / q : 200 - q * 2;
  return base.map((b) => Math.max(1, Math.min(255, Math.floor((b * s + 50) / 100))));
}

const COS = Array.from({ length: 8 }, (_, x) => Array.from({ length: 8 }, (_, u) => Math.cos(((2 * x + 1) * u * Math.PI) / 16)));
const C = (u: number) => (u === 0 ? Math.SQRT1_2 : 1);

function fdct(block: Float64Array): Float64Array {
  const tmp = new Float64Array(64);
  const out = new Float64Array(64);
  for (let y = 0; y < 8; y++)
    for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let x = 0; x < 8; x++) s += block[y * 8 + x]! * COS[x]![u]!;
      tmp[y * 8 + u] = s * C(u) * 0.5;
    }
  for (let u = 0; u < 8; u++)
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let y = 0; y < 8; y++) s += tmp[y * 8 + u]! * COS[y]![v]!;
      out[v * 8 + u] = s * C(v) * 0.5;
    }
  return out;
}

class BitWriter {
  private w = new ByteWriter(64 * 1024);
  private acc = 0;
  private n = 0;
  write(code: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | ((code >> i) & 1);
      this.n++;
      if (this.n === 8) {
        this.w.u8(this.acc);
        if (this.acc === 0xff) this.w.u8(0);
        this.acc = 0;
        this.n = 0;
      }
    }
  }
  flush() {
    if (this.n > 0) this.write((1 << (8 - this.n)) - 1, 8 - this.n);
    return this.w.done();
  }
}

function category(v: number) {
  let a = Math.abs(v);
  let c = 0;
  while (a) {
    c++;
    a >>= 1;
  }
  return c;
}

function encodeBlock(bw: BitWriter, block: Float64Array, q: number[], prevDc: number): number {
  const d = fdct(block);
  const zz = new Int32Array(64);
  for (let k = 0; k < 64; k++) zz[k] = Math.round(d[ZIGZAG[k]!]! / q[ZIGZAG[k]!]!);
  const diff = zz[0]! - prevDc;
  const dcCat = category(diff);
  const [dcCode, dcLen] = DC.get(dcCat)!;
  bw.write(dcCode, dcLen);
  if (dcCat) bw.write(diff < 0 ? diff + (1 << dcCat) - 1 : diff, dcCat);
  let run = 0;
  for (let k = 1; k < 64; k++) {
    const v = zz[k]!;
    if (v === 0) {
      run++;
      continue;
    }
    while (run > 15) {
      const [c, l] = AC.get(0xf0)!;
      bw.write(c, l);
      run -= 16;
    }
    const cat = category(v);
    const [c, l] = AC.get((run << 4) | cat)!;
    bw.write(c, l);
    bw.write(v < 0 ? v + (1 << cat) - 1 : v, cat);
    run = 0;
  }
  if (run > 0) {
    const [c, l] = AC.get(0x00)!;
    bw.write(c, l);
  }
  return zz[0]!;
}

function segment(marker: number, data: Uint8Array): Uint8Array {
  const w = new ByteWriter(data.length + 4);
  w.u8(0xff).u8(marker).u16be(data.length + 2).bytes(data);
  return w.done();
}

function dht(cls: number, id: number, bits: number[], vals: number[]) {
  const w = new ByteWriter();
  w.u8((cls << 4) | id).bytes(bits).bytes(vals);
  return w.done();
}

export function encodeJpeg(r: Raster, opts: { quality?: number; exif?: Uint8Array; comment?: string } = {}): Uint8Array {
  const qY = scaleQ(Q_LUM, opts.quality ?? 85);
  const qC = scaleQ(Q_CHR, opts.quality ?? 85);
  const W = r.width;
  const H = r.height;
  const planes = [new Float64Array(W * H), new Float64Array(W * H), new Float64Array(W * H)];
  for (let i = 0; i < W * H; i++) {
    const R = r.data[i * 3]!;
    const Gc = r.data[i * 3 + 1]!;
    const B = r.data[i * 3 + 2]!;
    planes[0]![i] = 0.299 * R + 0.587 * Gc + 0.114 * B - 128;
    planes[1]![i] = -0.168736 * R - 0.331264 * Gc + 0.5 * B;
    planes[2]![i] = 0.5 * R - 0.418688 * Gc - 0.081312 * B;
  }
  const bw = new BitWriter();
  const prev = [0, 0, 0];
  const block = new Float64Array(64);
  for (let by = 0; by < H; by += 8)
    for (let bx = 0; bx < W; bx += 8)
      for (let c = 0; c < 3; c++) {
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            const sx = Math.min(W - 1, bx + x);
            const sy = Math.min(H - 1, by + y);
            block[y * 8 + x] = planes[c]![sy * W + sx]!;
          }
        prev[c] = encodeBlock(bw, block, c === 0 ? qY : qC, prev[c]!);
      }
  const scan = bw.flush();

  const dqt = new ByteWriter();
  dqt.u8(0x00).bytes(ZIGZAG.map((i) => qY[i]!));
  dqt.u8(0x01).bytes(ZIGZAG.map((i) => qC[i]!));
  const sof = new ByteWriter();
  sof.u8(8).u16be(H).u16be(W).u8(3).bytes([1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const sos = new ByteWriter();
  sos.u8(3).bytes([1, 0x00, 2, 0x00, 3, 0x00]).bytes([0, 63, 0]);

  const parts: Uint8Array[] = [Uint8Array.of(0xff, 0xd8)];
  if (opts.exif) parts.push(segment(0xe1, concat([ascii("Exif\0\0"), opts.exif])));
  else parts.push(segment(0xe0, concat([ascii("JFIF\0"), Uint8Array.of(1, 1, 0, 0, 1, 0, 1, 0, 0)])));
  if (opts.comment) parts.push(segment(0xfe, ascii(opts.comment)));
  parts.push(segment(0xdb, dqt.done()));
  parts.push(segment(0xc0, sof.done()));
  parts.push(segment(0xc4, concat([dht(0, 0, DC_BITS, DC_VALS), dht(1, 0, AC_BITS, AC_VALS)])));
  parts.push(segment(0xda, sos.done()));
  parts.push(scan, Uint8Array.of(0xff, 0xd9));
  return concat(parts);
}

/* ─────────────────────────── EXIF / TIFF ─────────────────────────── */

type TagValue = { type: 1 | 7; value: Uint8Array } | { type: 2; value: string } | { type: 3 | 4; value: number[] } | { type: 5; value: [number, number][] };
export type ExifTag = { tag: number } & TagValue;

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };

function valueBytes(t: ExifTag): { count: number; bytes: Uint8Array } {
  const w = new ByteWriter(16);
  switch (t.type) {
    case 1:
    case 7:
      w.bytes(t.value);
      return { count: t.value.length, bytes: w.done() };
    case 2:
      w.str(t.value).u8(0);
      return { count: t.value.length + 1, bytes: w.done() };
    case 3:
      t.value.forEach((v) => w.u16le(v));
      return { count: t.value.length, bytes: w.done() };
    case 4:
      t.value.forEach((v) => w.u32le(v));
      return { count: t.value.length, bytes: w.done() };
    case 5:
      t.value.forEach(([n, d]) => w.u32le(n).u32le(d));
      return { count: t.value.length, bytes: w.done() };
  }
}

function ifdSize(tags: ExifTag[]) {
  let data = 0;
  for (const t of tags) {
    const { bytes } = valueBytes(t);
    if (bytes.length > 4) data += bytes.length + (bytes.length & 1);
  }
  return 2 + tags.length * 12 + 4 + data;
}

function writeIfd(w: ByteWriter, tags: ExifTag[], start: number) {
  const sorted = [...tags].sort((a, b) => a.tag - b.tag);
  let dataOff = start + 2 + sorted.length * 12 + 4;
  const data = new ByteWriter();
  w.u16le(sorted.length);
  for (const t of sorted) {
    const { count, bytes } = valueBytes(t);
    w.u16le(t.tag).u16le(t.type).u32le(count);
    if (bytes.length <= 4) {
      const pad = new Uint8Array(4);
      pad.set(bytes);
      w.bytes(pad);
    } else {
      w.u32le(dataOff);
      data.bytes(bytes);
      if (bytes.length & 1) data.u8(0);
      dataOff += bytes.length + (bytes.length & 1);
    }
  }
  w.u32le(0);
  w.bytes(data.done());
}

/** Builds a little-endian TIFF structure with IFD0 → Exif IFD and GPS IFD. */
export function buildExif(ifd0: ExifTag[], exif: ExifTag[], gps: ExifTag[]): Uint8Array {
  const withPtrs = [...ifd0];
  const ptrExif: ExifTag = { tag: 0x8769, type: 4, value: [0] };
  const ptrGps: ExifTag = { tag: 0x8825, type: 4, value: [0] };
  if (exif.length) withPtrs.push(ptrExif);
  if (gps.length) withPtrs.push(ptrGps);
  const off0 = 8;
  const offExif = off0 + ifdSize(withPtrs);
  const offGps = offExif + (exif.length ? ifdSize(exif) : 0);
  ptrExif.value = [offExif];
  ptrGps.value = [offGps];
  const w = new ByteWriter(4096);
  w.str("II").u16le(42).u32le(off0);
  writeIfd(w, withPtrs, off0);
  if (exif.length) writeIfd(w, exif, offExif);
  if (gps.length) writeIfd(w, gps, offGps);
  return w.done();
}

export const ascii0 = (tag: number, value: string): ExifTag => ({ tag, type: 2, value });

/** Decimal degrees → EXIF [deg, min, sec] rationals. */
export function dms(deg: number): [number, number][] {
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const mFloat = (a - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60 * 1000);
  return [
    [d, 1],
    [m, 1],
    [s, 1000],
  ];
}

export const EXIF_TAGS: Record<number, string> = {
  0x010e: "ImageDescription", 0x010f: "Make", 0x0110: "Model", 0x0112: "Orientation", 0x0131: "Software", 0x0132: "DateTime", 0x013b: "Artist",
  0x8298: "Copyright", 0x9000: "ExifVersion", 0x9003: "DateTimeOriginal", 0x9004: "DateTimeDigitized", 0x9010: "OffsetTime", 0x9011: "OffsetTimeOriginal",
  0x9286: "UserComment", 0xa431: "BodySerialNumber", 0xa434: "LensModel", 0x0000: "GPSVersionID", 0x0001: "GPSLatitudeRef", 0x0002: "GPSLatitude",
  0x0003: "GPSLongitudeRef", 0x0004: "GPSLongitude", 0x0007: "GPSTimeStamp", 0x001d: "GPSDateStamp", 0xa430: "CameraOwnerName",
};

/** Reads EXIF tags back out of a JPEG (APP1). Used by tests and the ForensicToolSolver. */
export function readExif(jpeg: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  let o = 2;
  while (o + 4 < jpeg.length && jpeg[o] === 0xff) {
    const marker = jpeg[o + 1]!;
    const len = (jpeg[o + 2]! << 8) | jpeg[o + 3]!;
    if (marker === 0xe1 && Buffer.from(jpeg.subarray(o + 4, o + 10)).toString("latin1") === "Exif\0\0") {
      const t = jpeg.subarray(o + 10, o + 2 + len);
      const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
      const readIfd = (off: number, gps: boolean) => {
        const n = dv.getUint16(off, true);
        for (let i = 0; i < n; i++) {
          const e = off + 2 + i * 12;
          const tag = dv.getUint16(e, true);
          const type = dv.getUint16(e + 2, true);
          const count = dv.getUint32(e + 4, true);
          const size = (TYPE_SIZE[type] ?? 1) * count;
          const vo = size <= 4 ? e + 8 : dv.getUint32(e + 8, true);
          const name = (gps ? { 0: "GPSVersionID", 1: "GPSLatitudeRef", 2: "GPSLatitude", 3: "GPSLongitudeRef", 4: "GPSLongitude", 7: "GPSTimeStamp", 29: "GPSDateStamp" }[tag] : undefined) ?? EXIF_TAGS[tag] ?? `0x${tag.toString(16)}`;
          if (!gps && (tag === 0x8769 || tag === 0x8825)) {
            readIfd(dv.getUint32(e + 8, true), tag === 0x8825);
            continue;
          }
          let v: string;
          if (type === 2) v = Buffer.from(t.subarray(vo, vo + count)).toString("latin1").replace(/\0+$/, "");
          else if (type === 3) v = Array.from({ length: count }, (_, k) => dv.getUint16(vo + k * 2, true)).join(" ");
          else if (type === 4) v = Array.from({ length: count }, (_, k) => dv.getUint32(vo + k * 4, true)).join(" ");
          else if (type === 5) v = Array.from({ length: count }, (_, k) => dv.getUint32(vo + k * 8, true) / dv.getUint32(vo + k * 8 + 4, true)).join(" ");
          else v = Buffer.from(t.subarray(vo, vo + count)).toString("latin1");
          out[name] = v;
        }
      };
      readIfd(dv.getUint32(4, true), false);
    }
    o += 2 + len;
    if (marker === 0xda) break;
  }
  return out;
}
