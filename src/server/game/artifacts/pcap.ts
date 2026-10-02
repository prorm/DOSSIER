import { ByteWriter, concat, utf8 } from "./bytes";

/**
 * libpcap writer with real Ethernet/IPv4/UDP/TCP framing, correct checksums,
 * DNS messages and TCP-reassemblable HTTP sessions. Opens in Wireshark and
 * tshark with no warnings.
 */

export interface Packet {
  ts: number; // epoch seconds (float)
  frame: Uint8Array;
}

function ipChecksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i += 2) sum += (data[i]! << 8) | (data[i + 1] ?? 0);
  while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
  return ~sum & 0xffff;
}

const ipBytes = (ip: string) => Uint8Array.from(ip.split(".").map(Number));
const macBytes = (mac: string) => Uint8Array.from(mac.split(":").map((h) => parseInt(h, 16)));

export function macFor(ip: string): string {
  const p = ip.split(".").map(Number);
  return ["02", "42", ...p.map((x) => x.toString(16).padStart(2, "0"))].join(":");
}

function ipv4(src: string, dst: string, proto: number, payload: Uint8Array, id: number, ttl = 64): Uint8Array {
  const h = new ByteWriter(20);
  h.u8(0x45).u8(0).u16be(20 + payload.length).u16be(id & 0xffff).u16be(0x4000).u8(ttl).u8(proto).u16be(0).bytes(ipBytes(src)).bytes(ipBytes(dst));
  const hdr = h.done();
  const c = ipChecksum(hdr);
  hdr[10] = c >> 8;
  hdr[11] = c & 0xff;
  return concat([hdr, payload]);
}

function pseudo(src: string, dst: string, proto: number, len: number) {
  const w = new ByteWriter(12);
  w.bytes(ipBytes(src)).bytes(ipBytes(dst)).u8(0).u8(proto).u16be(len);
  return w.done();
}

function ether(srcIp: string, dstIp: string, ip: Uint8Array) {
  const w = new ByteWriter(14 + ip.length);
  w.bytes(macBytes(macFor(dstIp))).bytes(macBytes(macFor(srcIp))).u16be(0x0800).bytes(ip);
  return w.done();
}

export function udpFrame(src: string, sport: number, dst: string, dport: number, payload: Uint8Array, id = 1): Uint8Array {
  const len = 8 + payload.length;
  const w = new ByteWriter(len);
  w.u16be(sport).u16be(dport).u16be(len).u16be(0).bytes(payload);
  const seg = w.done();
  let c = ipChecksum(concat([pseudo(src, dst, 17, len), seg]));
  if (c === 0) c = 0xffff;
  seg[6] = c >> 8;
  seg[7] = c & 0xff;
  return ether(src, dst, ipv4(src, dst, 17, seg, id));
}

export const TCP = { FIN: 0x01, SYN: 0x02, RST: 0x04, PSH: 0x08, ACK: 0x10 };

export function tcpFrame(src: string, sport: number, dst: string, dport: number, seq: number, ack: number, flags: number, payload: Uint8Array = new Uint8Array(0), id = 1): Uint8Array {
  const len = 20 + payload.length;
  const w = new ByteWriter(len);
  w.u16be(sport).u16be(dport).u32be(seq).u32be(ack).u8(0x50).u8(flags).u16be(64240).u16be(0).u16be(0).bytes(payload);
  const seg = w.done();
  const c = ipChecksum(concat([pseudo(src, dst, 6, len), seg]));
  seg[16] = c >> 8;
  seg[17] = c & 0xff;
  return ether(src, dst, ipv4(src, dst, 6, seg, id));
}

/* ─── DNS ─── */

function qname(name: string) {
  const w = new ByteWriter();
  for (const label of name.replace(/\.$/, "").split(".")) {
    const b = utf8(label);
    if (b.length > 63) throw new Error(`DNS label too long: ${label}`);
    w.u8(b.length).bytes(b);
  }
  w.u8(0);
  return w.done();
}

export const DNS_TYPES: Record<string, number> = { A: 1, CNAME: 5, TXT: 16, AAAA: 28, MX: 15 };

export function dnsQuery(id: number, name: string, type = "A"): Uint8Array {
  const w = new ByteWriter();
  w.u16be(id).u16be(0x0100).u16be(1).u16be(0).u16be(0).u16be(0).bytes(qname(name)).u16be(DNS_TYPES[type] ?? 1).u16be(1);
  return w.done();
}

export function dnsResponse(id: number, name: string, type: string, answer: string | null, ttl = 60): Uint8Array {
  const w = new ByteWriter();
  const rcode = answer === null ? 3 : 0; // NXDOMAIN when no answer
  w.u16be(id).u16be(0x8180 | rcode).u16be(1).u16be(answer === null ? 0 : 1).u16be(0).u16be(0).bytes(qname(name)).u16be(DNS_TYPES[type] ?? 1).u16be(1);
  if (answer !== null) {
    w.u16be(0xc00c).u16be(DNS_TYPES[type] ?? 1).u16be(1).u32be(ttl);
    if (type === "TXT") {
      const t = utf8(answer).subarray(0, 255);
      w.u16be(t.length + 1).u8(t.length).bytes(t);
    } else if (type === "CNAME") {
      const q = qname(answer);
      w.u16be(q.length).bytes(q);
    } else {
      w.u16be(4).bytes(ipBytes(answer));
    }
  }
  return w.done();
}

/* ─── Capture assembly ─── */

export class Capture {
  readonly packets: Packet[] = [];
  private nextId = 1000;
  private id() {
    return this.nextId++;
  }

  add(ts: number, frame: Uint8Array) {
    this.packets.push({ ts, frame });
  }

  dns(ts: number, client: string, resolver: string, id: number, name: string, type: string, answer: string | null, rtt = 0.012) {
    const sport = 40000 + (id % 20000);
    this.add(ts, udpFrame(client, sport, resolver, 53, dnsQuery(id, name, type), this.id()));
    this.add(ts + rtt, udpFrame(resolver, 53, client, sport, dnsResponse(id, name, type, answer), this.id()));
  }

  /** A complete TCP conversation: handshake, request, response, teardown. */
  http(ts: number, client: string, sport: number, server: string, request: string, response: string, rtt = 0.02) {
    let cseq = 100000 + sport * 7;
    let sseq = 500000 + sport * 13;
    const req = utf8(request);
    const res = utf8(response);
    let t = ts;
    this.add(t, tcpFrame(client, sport, server, 80, cseq, 0, TCP.SYN, undefined, this.id()));
    this.add((t += rtt / 2), tcpFrame(server, 80, client, sport, sseq, cseq + 1, TCP.SYN | TCP.ACK, undefined, this.id()));
    cseq += 1;
    sseq += 1;
    this.add((t += rtt / 2), tcpFrame(client, sport, server, 80, cseq, sseq, TCP.ACK, undefined, this.id()));
    this.add((t += 0.001), tcpFrame(client, sport, server, 80, cseq, sseq, TCP.PSH | TCP.ACK, req, this.id()));
    cseq += req.length;
    this.add((t += rtt / 2), tcpFrame(server, 80, client, sport, sseq, cseq, TCP.ACK, undefined, this.id()));
    // split large responses into ≤1400-byte segments
    for (let o = 0; o < res.length; o += 1400) {
      const part = res.subarray(o, o + 1400);
      this.add((t += 0.002), tcpFrame(server, 80, client, sport, sseq, cseq, TCP.PSH | TCP.ACK, part, this.id()));
      sseq += part.length;
    }
    this.add((t += rtt / 2), tcpFrame(client, sport, server, 80, cseq, sseq, TCP.ACK, undefined, this.id()));
    this.add((t += 0.01), tcpFrame(client, sport, server, 80, cseq, sseq, TCP.FIN | TCP.ACK, undefined, this.id()));
    this.add((t += rtt / 2), tcpFrame(server, 80, client, sport, sseq, cseq + 1, TCP.FIN | TCP.ACK, undefined, this.id()));
    this.add((t += rtt / 2), tcpFrame(client, sport, server, 80, cseq + 1, sseq + 1, TCP.ACK, undefined, this.id()));
  }

  /** NTP client request (background noise). */
  ntp(ts: number, client: string, server: string) {
    const p = new Uint8Array(48);
    p[0] = 0x23;
    this.add(ts, udpFrame(client, 123, server, 123, p, this.id()));
  }

  encode(): Uint8Array {
    const sorted = [...this.packets].sort((a, b) => a.ts - b.ts);
    const w = new ByteWriter(64 * 1024);
    w.u32le(0xa1b2c3d4).u16le(2).u16le(4).u32le(0).u32le(0).u32le(65535).u32le(1);
    for (const p of sorted) {
      const sec = Math.floor(p.ts);
      const usec = Math.round((p.ts - sec) * 1e6) % 1e6;
      w.u32le(sec).u32le(usec).u32le(p.frame.length).u32le(p.frame.length).bytes(p.frame);
    }
    return w.done();
  }
}

/** Minimal pcap reader for tests: returns DNS query names and TCP payloads in order. */
export function readPcap(buf: Uint8Array): { ts: number; src: string; dst: string; proto: "udp" | "tcp"; sport: number; dport: number; payload: Uint8Array; ipOk: boolean }[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0xa1b2c3d4) throw new Error("not a pcap");
  const out: ReturnType<typeof readPcap> = [];
  let o = 24;
  while (o + 16 <= buf.length) {
    const ts = dv.getUint32(o, true) + dv.getUint32(o + 4, true) / 1e6;
    const len = dv.getUint32(o + 8, true);
    const f = buf.subarray(o + 16, o + 16 + len);
    o += 16 + len;
    const ip = f.subarray(14);
    const ihl = (ip[0]! & 0x0f) * 4;
    const ipOk = ipChecksum(ip.subarray(0, ihl)) === 0;
    const proto = ip[9] === 17 ? "udp" : "tcp";
    const src = Array.from(ip.subarray(12, 16)).join(".");
    const dst = Array.from(ip.subarray(16, 20)).join(".");
    const l4 = ip.subarray(ihl);
    const sport = (l4[0]! << 8) | l4[1]!;
    const dport = (l4[2]! << 8) | l4[3]!;
    const payload = proto === "udp" ? l4.subarray(8) : l4.subarray((l4[12]! >> 4) * 4);
    out.push({ ts, src, dst, proto, sport, dport, payload, ipOk });
  }
  return out;
}

export function dnsQueryName(payload: Uint8Array): string {
  const labels: string[] = [];
  let o = 12;
  while (payload[o]) {
    const n = payload[o]!;
    labels.push(Buffer.from(payload.subarray(o + 1, o + 1 + n)).toString("utf8"));
    o += 1 + n;
  }
  return labels.join(".");
}
