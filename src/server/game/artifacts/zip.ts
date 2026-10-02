import { deflateRawSync, inflateRawSync } from "node:zlib";
import { ByteWriter, crc32, crc32Update, utf8 } from "./bytes";
import type { Rng } from "../core/rng";

/**
 * ZIP writer (STORE / DEFLATE) with optional traditional PKWARE ("ZipCrypto")
 * encryption, so `unzip -P`, 7-Zip and every OS archive tool can open it
 * with a password found elsewhere in the investigation.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array | string;
  /** DOS timestamp source. */
  date?: Date;
  comment?: string;
  store?: boolean;
}

function dosTime(d: Date) {
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, date };
}

class ZipCrypto {
  k0 = 0x12345678;
  k1 = 0x23456789;
  k2 = 0x34567890;
  constructor(password: string) {
    for (const b of Buffer.from(password, "utf8")) this.update(b);
  }
  update(b: number) {
    this.k0 = crc32Update(this.k0, b);
    this.k1 = (this.k1 + (this.k0 & 0xff)) >>> 0;
    this.k1 = (Math.imul(this.k1, 134775813) + 1) >>> 0;
    this.k2 = crc32Update(this.k2, this.k1 >>> 24);
  }
  stream() {
    const t = (this.k2 | 2) & 0xffff;
    return (Math.imul(t, t ^ 1) >>> 8) & 0xff;
  }
  encrypt(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const c = data[i]!;
      out[i] = c ^ this.stream();
      this.update(c);
    }
    return out;
  }
  decrypt(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const p = data[i]! ^ this.stream();
      out[i] = p;
      this.update(p);
    }
    return out;
  }
}

export function buildZip(entries: ZipEntry[], opts: { password?: string; rng?: Rng; comment?: string } = {}): Uint8Array {
  const out = new ByteWriter(64 * 1024);
  const central = new ByteWriter(4096);
  let count = 0;
  for (const e of entries) {
    const name = utf8(e.name);
    const raw = typeof e.data === "string" ? utf8(e.data) : e.data;
    const crc = crc32(raw);
    const method = e.store || raw.length < 64 ? 0 : 8;
    let payload = method === 8 ? new Uint8Array(deflateRawSync(Buffer.from(raw))) : raw;
    let flags = 0x0800; // UTF-8 names
    const { time, date } = dosTime(e.date ?? new Date(Date.UTC(2026, 2, 14, 3, 14, 0)));
    if (opts.password) {
      flags |= 1;
      const zc = new ZipCrypto(opts.password);
      const header = opts.rng ? opts.rng.bytes(12) : crypto.getRandomValues(new Uint8Array(12));
      header[11] = (crc >>> 24) & 0xff;
      const enc = zc.encrypt(new Uint8Array([...header, ...payload]));
      payload = enc;
    }
    const offset = out.length;
    out.u32le(0x04034b50).u16le(20).u16le(flags).u16le(method).u16le(time).u16le(date).u32le(crc).u32le(payload.length).u32le(raw.length).u16le(name.length).u16le(0);
    out.bytes(name).bytes(payload);
    const comment = utf8(e.comment ?? "");
    central
      .u32le(0x02014b50)
      .u16le(0x0314)
      .u16le(20)
      .u16le(flags)
      .u16le(method)
      .u16le(time)
      .u16le(date)
      .u32le(crc)
      .u32le(payload.length)
      .u32le(raw.length)
      .u16le(name.length)
      .u16le(0)
      .u16le(comment.length)
      .u16le(0)
      .u16le(0)
      .u32le((0o100644 << 16) >>> 0)
      .u32le(offset)
      .bytes(name)
      .bytes(comment);
    count++;
  }
  const cd = central.done();
  const cdOffset = out.length;
  out.bytes(cd);
  const zc = utf8(opts.comment ?? "");
  out.u32le(0x06054b50).u16le(0).u16le(0).u16le(count).u16le(count).u32le(cd.length).u32le(cdOffset).u16le(zc.length).bytes(zc);
  return out.done();
}

/** Reads (and optionally decrypts) a ZIP produced by buildZip. For tests and solver bots. */
export function readZip(buf: Uint8Array, password?: string): { name: string; data: Uint8Array | null; encrypted: boolean; comment: string }[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = buf.length - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip");
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: { name: string; data: Uint8Array | null; encrypted: boolean; comment: string }[] = [];
  for (let i = 0; i < n; i++) {
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = Buffer.from(buf.subarray(p + 46, p + 46 + nlen)).toString("utf8");
    const comment = Buffer.from(buf.subarray(p + 46 + nlen + xlen, p + 46 + nlen + xlen + clen)).toString("utf8");
    const lnlen = dv.getUint16(lho + 26, true);
    const lxlen = dv.getUint16(lho + 28, true);
    let data: Uint8Array | null = buf.subarray(lho + 30 + lnlen + lxlen, lho + 30 + lnlen + lxlen + csize);
    const encrypted = Boolean(flags & 1);
    if (encrypted) {
      if (!password) data = null;
      else data = new ZipCrypto(password).decrypt(data).subarray(12);
    }
    if (data && method === 8) data = new Uint8Array(inflateRawSync(Buffer.from(data)));
    out.push({ name, data, encrypted, comment });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
