import { z } from "zod";
import { profile } from "../core/difficulty";
import { renderString } from "../core/template";
import type { ChallengePrimitive, Instance, SiteContribution, Transition } from "./types";
import { answerMatches, attempts, escapeHtml } from "./types";

/**
 * Browser-investigation on a synthetic website. Evidence is distributed across
 * places only visible with developer tools. Two modes:
 *
 *  - fragments: N fragments live in N different channels (headers, IndexedDB,
 *    comments…); the assembly order is stated only in the original source
 *    exposed through the source map (or another configured channel).
 *  - chain: storage entries reference each other (localStorage cursor →
 *    IndexedDB record → Cache Storage entry) among decoys; the answer sits at
 *    the end of the chain.
 *
 * The assembled answer never exists anywhere on the client.
 */

export const CHANNELS = [
  "response-header",
  "server-timing",
  "json-field",
  "html-comment",
  "hidden-element",
  "dom-inserted",
  "local-storage",
  "session-storage",
  "indexeddb",
  "cache-storage",
  "console",
  "query-param",
] as const;
export type Channel = (typeof CHANNELS)[number];

const CHANNEL_TOOLS: Record<Channel, string> = {
  "response-header": "Network → Headers",
  "server-timing": "Network → Timing",
  "json-field": "Network → Response",
  "html-comment": "Elements / view-source",
  "hidden-element": "Elements",
  "dom-inserted": "Elements (live DOM)",
  "local-storage": "Application → Local Storage",
  "session-storage": "Application → Session Storage",
  indexeddb: "Application → IndexedDB",
  "cache-storage": "Application → Cache Storage",
  console: "Console (verbose)",
  "query-param": "Network + request replay",
};

const Config = z
  .object({
    site: z.string().min(1).max(63),
    mode: z.enum(["fragments", "chain"]).default("fragments"),
    channels: z.array(z.enum(CHANNELS)).min(1).max(6).default(["response-header", "indexeddb", "html-comment"]),
    labels: z.array(z.string().regex(/^[a-z][a-z0-9-]{0,20}$/)).max(6).default(["trace", "draft", "memo", "relay", "vault", "shard"]),
    orderChannel: z.enum(["sourcemap", "console", "html-comment"]).default("sourcemap"),
    joiner: z.string().max(3).default("-"),
    fragmentPattern: z.string().max(20).default("??##"),
    decoys: z.number().int().min(0).max(8).default(2),
    /** Narrative wrapper for the final answer ("maintenance passphrase"). */
    secretName: z.string().max(80).default("maintenance passphrase"),
    /** For chain mode: the text of the final note (may use world facts); `%ANSWER%` is replaced by the generated answer. */
    chainNote: z.string().max(2000).default("If you are reading this, the passphrase is %ANSWER%."),
    /** Optional fixed answer template (chain mode) instead of a generated code. */
    answer: z.string().max(200).optional(),
    page: z.string().regex(/^[a-z0-9-]{1,40}$/).default("directory"),
  })
  .strict();
type C = z.infer<typeof Config>;

const Action = z.object({ type: z.literal("answer"), value: z.string().min(1).max(300) }).strict();
type A = z.infer<typeof Action>;

interface Frag {
  label: string;
  value: string;
  channel: Channel;
}
interface Pub {
  site: string;
  channels: Channel[];
  secretName: string;
  mode: "fragments" | "chain";
}
interface Sec {
  answer: string;
  fragments: Frag[];
  decoys: Frag[];
  order: string[];
  chain?: { cursor: string; cacheUrl: string; decoyCursors: string[]; note: string };
  config: C;
}

export const webInvestigation: ChallengePrimitive<C, Pub, Sec, A> = {
  id: "web-investigation",
  version: "1.0.0",
  family: "browser",
  label: "Browser DevTools investigation",
  summary: "A normal-looking website whose evidence lives in headers, storage, IndexedDB, caches, the console and source maps.",
  schema: Config,
  actionSchema: Action,
  example: () => ({ site: "portal", mode: "fragments", channels: ["response-header", "indexeddb", "html-comment"], orderChannel: "sourcemap" }),
  createInstance(config, ctx): Instance<Pub, Sec> {
    const rng = ctx.rng;
    const labels = config.labels.slice(0, Math.max(config.channels.length, 1));
    if (config.mode === "chain") {
      const answer = config.answer ? renderString(config.answer, ctx.facts) : rng.code(config.fragmentPattern + config.joiner + config.fragmentPattern);
      const cursor = `c-${rng.hex(3)}`;
      const decoyCursors = Array.from({ length: config.decoys + 3 }, () => `c-${rng.hex(3)}`);
      const note = renderString(config.chainNote, ctx.facts).replace(/%ANSWER%/g, answer);
      return {
        public: { site: config.site, channels: ["local-storage", "indexeddb", "cache-storage"], secretName: config.secretName, mode: "chain" },
        secret: { answer, fragments: [], decoys: [], order: [], chain: { cursor, cacheUrl: `offline/notes/${rng.hex(4)}.json`, decoyCursors, note }, config },
        outputs: { answer },
        guarded: [answer],
        // The real note and the decoys all carry look-alike references; only the sync chain says which is live.
        intentional: ["plain"],
      };
    }
    const fragments: Frag[] = config.channels.map((channel, i) => ({ label: labels[i] ?? `part${i + 1}`, value: rng.code(config.fragmentPattern), channel }));
    const order = rng.shuffle(fragments.map((f) => f.label));
    const answer = order.map((l) => fragments.find((f) => f.label === l)!.value).join(config.joiner);
    const decoys: Frag[] = Array.from({ length: config.decoys }, (_, i) => ({
      label: `${labels[i % labels.length]}-old`,
      value: rng.code(config.fragmentPattern),
      channel: fragments[i % fragments.length]!.channel,
    }));
    return {
      public: { site: config.site, channels: config.channels, secretName: config.secretName, mode: "fragments" },
      secret: { answer, fragments, decoys, order, config },
      outputs: { answer, ...Object.fromEntries(fragments.map((f) => [`frag_${f.label}`, f.value])) },
      guarded: [answer],
    };
  },
  view: (inst, node) => ({
    kind: "site",
    site: inst.public.site,
    secretName: inst.public.secretName,
    mode: inst.public.mode,
    attempts: attempts(node),
  }),
  validateAction: () => ({ ok: true }),
  applyAction(action, inst, node): Transition {
    const ok = answerMatches(action.value, inst.secret.answer, "loose");
    return {
      events: ok ? [] : [{ type: "node.step", node: "", key: "attempts", value: attempts(node) + 1 }],
      solved: ok,
      correct: ok,
      submission: action.value.slice(0, 120),
      feedback: ok
        ? { tone: "success", title: "ACCESS GRANTED", message: `The ${inst.public.secretName} checks out.` }
        : { tone: "fail", title: "ACCESS DENIED", message: `That is not the ${inst.public.secretName}. Fragments, order and separators all matter.` },
    };
  },
  intendedSolution: (inst) => [{ type: "answer", value: inst.secret.answer }],
  isAttempt: () => true,
  site(inst): SiteContribution {
    const s = inst.secret;
    const c = s.config;
    const out: SiteContribution = { site: c.site, comments: [], hiddenElements: [], storage: [], indexedDb: [], cache: [], console: [], domInserted: [], sourceNotes: [], statusHeaders: {}, statusFields: {}, endpoints: [] };
    if (s.chain) {
      const ch = s.chain;
      out.storage!.push({ kind: "local", key: "portal.sync", value: JSON.stringify({ cursor: ch.cursor, lastSync: "2026-03-14T02:58:11Z", pending: 0 }) });
      out.storage!.push({ kind: "session", key: "portal.nav", value: JSON.stringify({ last: c.page, collapsed: false }) });
      const records = [ch.cursor, ...ch.decoyCursors].map((cur, i) => ({
        key: cur,
        value: cur === ch.cursor ? { cursor: cur, kind: "note", blob: ch.cacheUrl, synced: true } : { cursor: cur, kind: i % 2 ? "draft" : "note", blob: `offline/notes/${cur.slice(2)}.json`, synced: false },
      }));
      out.indexedDb!.push({ db: "portal-offline", store: "sync-index", records });
      out.cache!.push({ cache: "portal-offline-v3", url: ch.cacheUrl, contentType: "application/json", body: JSON.stringify({ title: "unsent note", body: ch.note }) });
      const DECOY_NOTES = [
        "Draft — to Rao: pass schedule attached, please sign off. Ref %REF%.",
        "Draft — to facilities: B-wing UPS alarm is too sensitive again. Ref %REF%.",
        "Draft — to Theo: can you re-run the telemetry export? Ref %REF%.",
        "Draft — to the radio club: thanks for logging the test bursts. Ref %REF%.",
        "Draft — to procurement: two spare antennas, same model. Ref %REF%.",
        "Draft — reminder: calibrate the gimbal before Friday. Ref %REF%.",
      ];
      ch.decoyCursors.forEach((d, i) => {
        const ref = d.slice(2, 4).toUpperCase().replace(/[^A-Z]/g, "Q").padEnd(2, "X") + String(10 + ((d.charCodeAt(3) * 7 + i * 13) % 90));
        out.cache!.push({ cache: "portal-offline-v3", url: `offline/notes/${d.slice(2)}.json`, contentType: "application/json", body: JSON.stringify({ title: "draft", body: DECOY_NOTES[i % DECOY_NOTES.length]!.replace("%REF%", ref) }) });
      });
      out.sourceNotes!.push("offline sync: localStorage 'portal.sync'.cursor → IndexedDB portal-offline/sync-index → cached blob in 'portal-offline-v3'. Only synced records point at live blobs.");
      return out;
    }
    const orderRule = `${c.secretName} = [${s.order.map((l) => `'${l}'`).join(", ")}].map(part).join('${c.joiner}')`;
    if (c.orderChannel === "sourcemap") out.sourceNotes!.push(`TODO(ops): stop assembling the ${orderRule} on the client before the audit.`);
    else if (c.orderChannel === "console") out.console!.push({ level: "debug", message: `[ops] ${orderRule}` });
    else out.comments!.push({ path: "", text: `ops: ${orderRule}` });
    const all = [...s.fragments, ...s.decoys];
    for (const f of all) {
      const tag = `${f.label}:${f.value}`;
      switch (f.channel) {
        case "response-header":
          out.statusHeaders![`X-Portal-${f.label.replace(/(^|-)([a-z])/g, (_, a, b: string) => a + b.toUpperCase())}`] = f.value;
          break;
        case "server-timing":
          out.statusHeaders!["Server-Timing"] = [out.statusHeaders!["Server-Timing"], `${f.label};dur=${(f.value.length * 7) % 90};desc="${f.value}"`].filter(Boolean).join(", ");
          break;
        case "json-field":
          out.statusFields![f.label] = { rev: f.value, stale: f.label.endsWith("-old") };
          break;
        case "html-comment":
          out.comments!.push({ path: c.page, text: tag });
          break;
        case "hidden-element":
          out.hiddenElements!.push({ path: c.page, html: `<span class="sync-marker" data-${escapeHtml(f.label)}="${escapeHtml(f.value)}" hidden></span>` });
          break;
        case "dom-inserted":
          out.domInserted!.push({ path: c.page, html: `<meta name="x-${escapeHtml(f.label)}" content="${escapeHtml(f.value)}">` });
          break;
        case "local-storage":
          out.storage!.push({ kind: "local", key: `portal.${f.label}`, value: JSON.stringify({ v: f.value, at: "2026-03-14T02:5" + (f.value.length % 9) + ":00Z" }) });
          break;
        case "session-storage":
          out.storage!.push({ kind: "session", key: `portal.${f.label}`, value: f.value });
          break;
        case "indexeddb":
          out.indexedDb!.push({ db: "portal-offline", store: "drafts", records: [{ key: `draft-${f.label}`, value: { label: f.label, body: `saved ${f.label}`, token: f.value } }] });
          break;
        case "cache-storage":
          out.cache!.push({ cache: "portal-offline-v3", url: `offline/${f.label}.json`, contentType: "application/json", body: JSON.stringify({ [f.label]: f.value }) });
          break;
        case "console":
          out.console!.push({ level: "debug", message: `[sync] ${tag}` });
          break;
        case "query-param":
          out.sourceNotes!.push(`diagnostics endpoint: GET api/diagnostics?verbose=1 (${f.label})`);
          out.endpoints!.push({
            method: "GET",
            path: "api/diagnostics",
            handle: (req) =>
              req.query.get("verbose") === "1"
                ? { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, [f.label]: f.value }), discovery: { key: `diag-${f.label}`, label: "Verbose diagnostics endpoint answered" } }
                : { status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, error: "verbose flag required" }) },
          });
          break;
      }
    }
    return out;
  },
  difficulty: (c) =>
    profile({
      knowledgeDifficulty: 4,
      reasoningDifficulty: c.mode === "chain" ? 6 : 4 + c.channels.length * 0.5,
      toolRequirement: 7,
      interactionDepth: 5 + c.channels.length * 0.5,
      statefulness: c.mode === "chain" ? 6 : 3,
      crossModalComplexity: 2 + new Set(c.channels.map((x) => CHANNEL_TOOLS[x].split(" ")[0])).size,
      redHerringDensity: Math.min(10, c.decoys * 2),
      instanceUniqueness: 9,
    }),
  describe: (c) => ({
    skills: ["browser developer tools", "HTTP", c.mode === "chain" ? "web storage relationships" : "evidence assembly"],
    tools: [...new Set([...(c.mode === "chain" ? ["Application → Local Storage", "Application → IndexedDB", "Application → Cache Storage"] : c.channels.map((x) => CHANNEL_TOOLS[x])), ...(c.orderChannel === "sourcemap" ? ["Sources (source maps)"] : [])])],
    interaction: { channels: ["browser", "network", "storage"], textExposure: 0.02 },
  }),
  harden(c) {
    if (c.mode === "chain") {
      if (c.decoys >= 8) return null;
      return { config: { ...c, decoys: Math.min(8, c.decoys + 3) }, changes: [`Chain decoys ${c.decoys} → ${Math.min(8, c.decoys + 3)}: more unsynced records and cached blobs look plausible`] };
    }
    if (c.channels.length >= 6) return null;
    const unused = CHANNELS.filter((x) => !c.channels.includes(x));
    const add = (["query-param", "server-timing", "dom-inserted", "cache-storage", "session-storage"] as Channel[]).find((x) => unused.includes(x)) ?? unused[0]!;
    return {
      config: { ...c, channels: [...c.channels, add], decoys: Math.min(8, c.decoys + 1), orderChannel: "sourcemap" },
      changes: [`Evidence split across ${c.channels.length + 1} channels (added ${CHANNEL_TOOLS[add]})`, "Assembly order moved into the original source (source map only)", `Decoy fragments ${c.decoys} → ${Math.min(8, c.decoys + 1)}`],
    };
  },
};
