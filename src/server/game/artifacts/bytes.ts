/** Byte-level helpers shared by every artifact encoder. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, seed = 0): number {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function crc32Update(crc: number, byte: number): number {
  return (CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
}

export const utf8 = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));
export const ascii = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));

export function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Growable little/big-endian writer. */
export class ByteWriter {
  private buf: Uint8Array;
  private view: DataView;
  length = 0;

  constructor(initial = 1024) {
    this.buf = new Uint8Array(initial);
    this.view = new DataView(this.buf.buffer);
  }

  private ensure(n: number) {
    if (this.length + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.length + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
    this.view = new DataView(this.buf.buffer);
  }

  u8(v: number) {
    this.ensure(1);
    this.view.setUint8(this.length, v & 0xff);
    this.length += 1;
    return this;
  }
  u16le(v: number) {
    this.ensure(2);
    this.view.setUint16(this.length, v & 0xffff, true);
    this.length += 2;
    return this;
  }
  u16be(v: number) {
    this.ensure(2);
    this.view.setUint16(this.length, v & 0xffff, false);
    this.length += 2;
    return this;
  }
  u32le(v: number) {
    this.ensure(4);
    this.view.setUint32(this.length, v >>> 0, true);
    this.length += 4;
    return this;
  }
  u32be(v: number) {
    this.ensure(4);
    this.view.setUint32(this.length, v >>> 0, false);
    this.length += 4;
    return this;
  }
  i16le(v: number) {
    this.ensure(2);
    this.view.setInt16(this.length, v, true);
    this.length += 2;
    return this;
  }
  bytes(b: Uint8Array | number[]) {
    const arr = b instanceof Uint8Array ? b : Uint8Array.from(b);
    this.ensure(arr.length);
    this.buf.set(arr, this.length);
    this.length += arr.length;
    return this;
  }
  str(s: string, enc: "latin1" | "utf8" = "latin1") {
    return this.bytes(new Uint8Array(Buffer.from(s, enc)));
  }
  /** Overwrite a big-endian u16 at an absolute offset. */
  patchU16be(offset: number, v: number) {
    this.view.setUint16(offset, v & 0xffff, false);
  }
  patchU32le(offset: number, v: number) {
    this.view.setUint32(offset, v >>> 0, true);
  }
  done(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

/** Printable ASCII runs ≥ min — what `strings(1)` would show. */
export function printableStrings(data: Uint8Array, min = 6): string[] {
  const out: string[] = [];
  let cur = "";
  for (const b of data) {
    if (b >= 0x20 && b < 0x7f) cur += String.fromCharCode(b);
    else {
      if (cur.length >= min) out.push(cur);
      cur = "";
    }
  }
  if (cur.length >= min) out.push(cur);
  return out;
}
