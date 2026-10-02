import { z } from "zod";
import { profile } from "../core/difficulty";
import { base32 } from "../core/ciphers";
import { render } from "../core/template";
import { Rng } from "../core/rng";
import { Capture } from "../artifacts/pcap";
import { utf8 } from "../artifacts/bytes";
import type { ArtifactSpec, ChallengePrimitive } from "./types";
import { AnswerAction, AnswerBlock, answerOutputs, checkAnswerTransition, resolveAnswer, type AnswerActionT, type AnswerSecret } from "./common";

/**
 * Network trace analysis on a synthetic capture of a fictional lab network.
 * Story device: a field unit reports status as sequence-numbered DNS lookups
 * (a common low-bandwidth telemetry pattern). The capture also carries
 * ordinary background traffic (web requests, NTP, unrelated lookups) and
 * decoy beacons from other devices. Players find the right device, order its
 * lookups by sequence number, decode the labels and read the message.
 * Optionally ships the resolver's query log as a second artifact.
 */
const Config = z
  .object({
    ...AnswerBlock,
    filename: z.string().regex(/^[A-Za-z0-9._-]{1,60}$/).default("capture.pcap"),
    start: z.string().max(80).default("2026-03-13T21:10:00Z"),
    resolver: z.string().regex(/^\d+\.\d+\.\d+\.\d+$/).default("10.14.0.2"),
    beacon: z
      .object({
        host: z.string().max(80),
        domain: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/),
        message: z.string().min(1).max(400),
        chunk: z.number().int().min(4).max(30).default(10),
        encoding: z.enum(["base32", "hex"]).default("base32"),
        offsetSec: z.number().int().min(0).max(86_400).default(600),
        intervalSec: z.number().int().min(1).max(600).default(9),
      })
      .strict(),
    decoys: z.array(z.object({ host: z.string().max(80), domain: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/), count: z.number().int().min(1).max(40).default(8) }).strict()).max(6).default([]),
    web: z.array(z.object({ offsetSec: z.number().int().min(0).max(86_400), client: z.string().max(80), server: z.string().max(80), host: z.string().max(120), path: z.string().max(300), status: z.number().int().default(200), body: z.string().max(4000).default("ok") }).strict()).max(20).default([]),
    noise: z.object({ lookups: z.number().int().min(0).max(400).default(40), ntp: z.number().int().min(0).max(40).default(6), clients: z.number().int().min(1).max(40).default(8) }).strict().default({ lookups: 40, ntp: 6, clients: 8 }),
    resolverLog: z.object({ filename: z.string().regex(/^[A-Za-z0-9._-]{1,60}$/) }).strict().optional(),
  })
  .strict();
type C = z.infer<typeof Config>;

const BENIGN = ["time.campus.example", "updates.distro.example", "mail.campus.example", "portal.campus.example", "cdn.fonts.example", "library.campus.example", "weather.api.example"];

export interface Lookup {
  ts: number;
  client: string;
  name: string;
  type: string;
  answer: string | null;
}

export function planCapture(c: C, rng: Rng): { lookups: Lookup[]; labels: string[] } {
  const t0 = Date.parse(c.start) / 1000;
  const enc = c.beacon.encoding === "base32" ? base32(c.beacon.message).toLowerCase() : Buffer.from(c.beacon.message, "utf8").toString("hex");
  const labels: string[] = [];
  for (let i = 0; i < enc.length; i += c.beacon.chunk) labels.push(enc.slice(i, i + c.beacon.chunk));
  const lookups: Lookup[] = [];
  // Beacons go out with jitter, so capture order ≠ sequence order for a few of them.
  labels.forEach((l, i) => {
    const jitter = rng.int(-Math.floor(c.beacon.intervalSec * 0.9), Math.floor(c.beacon.intervalSec * 0.9));
    lookups.push({ ts: t0 + c.beacon.offsetSec + i * c.beacon.intervalSec + jitter + rng.next(), client: c.beacon.host, name: `${String(i).padStart(2, "0")}-${l}.${c.beacon.domain}`, type: "A", answer: null });
  });
  for (const d of c.decoys)
    for (let i = 0; i < d.count; i++) {
      const junk = c.beacon.encoding === "base32" ? base32(rng.bytes(6)).toLowerCase() : rng.hex(6);
      lookups.push({ ts: t0 + rng.int(0, c.beacon.offsetSec * 2 + 600) + rng.next(), client: d.host, name: `${String(i).padStart(2, "0")}-${junk}.${d.domain}`, type: "A", answer: `198.51.100.${rng.int(2, 250)}` });
    }
  const clients = Array.from({ length: c.noise.clients }, () => `10.14.${rng.int(1, 9)}.${rng.int(10, 240)}`);
  for (let i = 0; i < c.noise.lookups; i++) {
    lookups.push({ ts: t0 + rng.int(0, c.beacon.offsetSec * 2 + 900) + rng.next(), client: rng.pick(clients), name: rng.pick(BENIGN), type: rng.chance(0.8) ? "A" : "AAAA", answer: rng.chance(0.8) ? `203.0.113.${rng.int(2, 250)}` : null });
  }
  lookups.sort((a, b) => a.ts - b.ts);
  return { lookups, labels };
}

function resolverLogText(c: C, lookups: Lookup[]): string {
  return (
    lookups
      .map((l) => {
        const d = new Date(l.ts * 1000);
        const p = (n: number, w = 2) => String(n).padStart(w, "0");
        const stamp = `${p(d.getUTCDate())}-${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}-${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}`;
        return `${stamp} queries: info: client ${l.client}#${40000 + (Math.floor(l.ts * 1000) % 20000)} (${l.name}): query: ${l.name} IN ${l.type} + (${c.resolver}) ${l.answer ? "NOERROR" : "NXDOMAIN"}`;
      })
      .join("\n") + "\n"
  );
}

export const networkCapture: ChallengePrimitive<C, { question: string; answerFormat: string }, AnswerSecret & { rendered: C; seed: string }, AnswerActionT> = {
  id: "network-capture",
  version: "1.0.0",
  family: "ctf",
  label: "Network trace analysis",
  summary: "A synthetic packet capture (and optional resolver log) of a fictional network; reassemble a device's sequence-numbered status lookups from among background traffic and decoys.",
  schema: Config,
  actionSchema: AnswerAction,
  example: () => ({
    question: "What status code did the field unit report?",
    answer: "{{codeword}}",
    beacon: { host: "10.14.3.77", domain: "status.fieldunit.example", message: "UNIT OK CODE {{codeword}}" },
    decoys: [{ host: "10.14.5.20", domain: "metrics.printer.example" }],
  }),
  createInstance(config, ctx) {
    const rendered = render(config, ctx.facts);
    if (Number.isNaN(Date.parse(rendered.start))) throw new Error("network-capture: start is not ISO-8601 after templating");
    for (const ip of [rendered.beacon.host, ...rendered.decoys.map((d) => d.host), ...rendered.web.flatMap((w) => [w.client, w.server])])
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) throw new Error(`network-capture: "${ip}" is not an IPv4 address after templating`);
    const secret = { ...resolveAnswer(config, ctx.facts), rendered, seed: ctx.rng.seed };
    return { public: { question: rendered.question, answerFormat: rendered.answerFormat }, secret, ...answerOutputs(secret) };
  },
  view: (inst) => ({ kind: "artifact", question: inst.public.question, answerFormat: inst.public.answerFormat }),
  validateAction: () => ({ ok: true }),
  applyAction: (a, inst, node) => checkAnswerTransition(a.value, inst.secret, node),
  intendedSolution: (inst) => [{ type: "answer", value: inst.secret.accept[0]! }],
  isAttempt: () => true,
  artifacts(inst): ArtifactSpec[] {
    const c = inst.secret.rendered;
    const plan = () => planCapture(c, new Rng(`${inst.secret.seed}/capture`));
    const out: ArtifactSpec[] = [
      {
        name: c.filename,
        mime: "application/vnd.tcpdump.pcap",
        description: "Packet capture (libpcap)",
        build: () => {
          const { lookups } = plan();
          const rng = new Rng(`${inst.secret.seed}/ids`);
          const cap = new Capture();
          for (const l of lookups) cap.dns(l.ts, l.client, c.resolver, rng.int(1, 65535), l.name, l.type, l.answer);
          const t0 = Date.parse(c.start) / 1000;
          c.web.forEach((w, i) => {
            const body = w.body;
            cap.http(
              t0 + w.offsetSec,
              w.client,
              50000 + i * 7,
              w.server,
              `GET ${w.path} HTTP/1.1\r\nHost: ${w.host}\r\nUser-Agent: fieldunit/2.3\r\nAccept: */*\r\n\r\n`,
              `HTTP/1.1 ${w.status} ${w.status === 200 ? "OK" : "Status"}\r\nContent-Type: text/plain\r\nContent-Length: ${utf8(body).length}\r\n\r\n${body}`,
            );
          });
          for (let i = 0; i < c.noise.ntp; i++) cap.ntp(t0 + i * 64 + rng.next(), `10.14.${rng.int(1, 9)}.${rng.int(10, 240)}`, "10.14.0.3");
          return cap.encode();
        },
      },
    ];
    if (c.resolverLog) out.push({ name: c.resolverLog.filename, mime: "text/plain", description: "Resolver query log", build: () => utf8(resolverLogText(c, plan().lookups)) });
    return out;
  },
  difficulty: (c) =>
    profile({
      knowledgeDifficulty: 6,
      reasoningDifficulty: 6,
      toolRequirement: 8,
      interactionDepth: 5,
      crossModalComplexity: c.resolverLog ? 5 : 3,
      redHerringDensity: Math.min(10, c.decoys.length * 2 + c.noise.lookups / 80),
      instanceUniqueness: 9,
    }),
  describe: (c) => ({
    skills: ["packet analysis", "DNS", `${c.beacon.encoding} decoding`],
    tools: ["Wireshark / tshark", ...(c.resolverLog ? ["grep"] : []), "CyberChef or Python"],
    interaction: { channels: ["file", "binary", "terminal"], textExposure: 0.01 },
  }),
  harden(c) {
    if (c.decoys.length >= 4) return null;
    const domain = c.beacon.domain.replace(/^[^.]+/, (s) => `${s}-backup`);
    return { config: { ...c, decoys: [...c.decoys, { host: c.beacon.host.replace(/\d+$/, (n) => String((Number(n) + 1) % 250)), domain, count: 10 }] }, changes: [`Added a look-alike beacon (${domain}) from a neighbouring host: players must separate it by source address and sequence integrity`] };
  },
};
