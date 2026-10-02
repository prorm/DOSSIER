/**
 * Capture *properties*, not capture *contents*: packet count, timing and sizes
 * read from the libpcap record headers – what `capinfos` prints. Payloads are
 * never touched, so the incident is still yours to reassemble.
 */
export interface PcapSummary {
  packets: number;
  bytes: number;
  durationSec: number;
  minLen: number;
  maxLen: number;
  /** Bytes per time bin across the capture. */
  bins: number[];
  linkType: number;
}

export function summarisePcap(buf: ArrayBuffer, bins = 96): PcapSummary | null {
  if (buf.byteLength < 24) return null;
  const dv = new DataView(buf);
  const magic = dv.getUint32(0, false);
  let little: boolean;
  let nano = false;
  if (magic === 0xa1b2c3d4) little = false;
  else if (magic === 0xd4c3b2a1) little = true;
  else if (magic === 0xa1b23c4d) {
    little = false;
    nano = true;
  } else if (magic === 0x4d3cb2a1) {
    little = true;
    nano = true;
  } else return null;
  const linkType = dv.getUint32(20, little);
  const recs: { t: number; len: number }[] = [];
  let off = 24;
  while (off + 16 <= buf.byteLength && recs.length < 200_000) {
    const sec = dv.getUint32(off, little);
    const frac = dv.getUint32(off + 4, little);
    const incl = dv.getUint32(off + 8, little);
    const orig = dv.getUint32(off + 12, little);
    if (incl > 0x40000 || off + 16 + incl > buf.byteLength) break;
    recs.push({ t: sec + frac / (nano ? 1e9 : 1e6), len: orig });
    off += 16 + incl;
  }
  if (!recs.length) return { packets: 0, bytes: 0, durationSec: 0, minLen: 0, maxLen: 0, bins: Array(bins).fill(0), linkType };
  const t0 = recs[0]!.t;
  const t1 = recs[recs.length - 1]!.t;
  const span = Math.max(1e-6, t1 - t0);
  const out = Array<number>(bins).fill(0);
  let bytes = 0;
  let min = Infinity;
  let max = 0;
  for (const r of recs) {
    bytes += r.len;
    min = Math.min(min, r.len);
    max = Math.max(max, r.len);
    out[Math.min(bins - 1, Math.floor(((r.t - t0) / span) * bins))]! += r.len;
  }
  return { packets: recs.length, bytes, durationSec: t1 - t0, minLen: min, maxLen: max, bins: out, linkType };
}
