import { describe, expect, it } from "vitest";
import { summarisePcap } from "../../src/lib/experience/pcap";

/** Builds a minimal little-endian pcap (magic d4c3b2a1) of given packets. */
function pcap(packets: { t: number; len: number }[], nano = false): ArrayBuffer {
  const size = 24 + packets.reduce((s, p) => s + 16 + p.len, 0);
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  dv.setUint32(0, nano ? 0x4d3cb2a1 : 0xd4c3b2a1, false);
  dv.setUint16(4, 2, true);
  dv.setUint16(6, 4, true);
  dv.setUint32(16, 65535, true);
  dv.setUint32(20, 1, true);
  let off = 24;
  for (const p of packets) {
    dv.setUint32(off, Math.floor(p.t), true);
    dv.setUint32(off + 4, Math.round((p.t % 1) * (nano ? 1e9 : 1e6)), true);
    dv.setUint32(off + 8, p.len, true);
    dv.setUint32(off + 12, p.len, true);
    off += 16 + p.len;
  }
  return buf;
}

describe("capture summary (properties only)", () => {
  it("counts packets, bytes and duration from record headers", () => {
    const s = summarisePcap(pcap([{ t: 1000, len: 60 }, { t: 1001.5, len: 120 }, { t: 1003, len: 90 }]), 6)!;
    expect(s.packets).toBe(3);
    expect(s.bytes).toBe(270);
    expect(s.durationSec).toBeCloseTo(3, 3);
    expect([s.minLen, s.maxLen]).toEqual([60, 90 + 30]);
    expect(s.bins.reduce((a, b) => a + b, 0)).toBe(270);
    expect(s.linkType).toBe(1);
  });

  it("understands nanosecond captures and rejects non-pcap bytes", () => {
    expect(summarisePcap(pcap([{ t: 5, len: 10 }, { t: 6, len: 10 }], true))!.durationSec).toBeCloseTo(1, 3);
    expect(summarisePcap(new ArrayBuffer(64))).toBeNull();
    expect(summarisePcap(new ArrayBuffer(4))).toBeNull();
  });

  it("stops at a truncated record instead of reading past the end", () => {
    const good = pcap([{ t: 1, len: 40 }, { t: 2, len: 40 }]);
    const cut = good.slice(0, good.byteLength - 10);
    expect(summarisePcap(cut)!.packets).toBe(1);
  });
});
