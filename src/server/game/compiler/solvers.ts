import type { BlueprintT, NodeDef } from "../core/blueprint";
import { naiveDecodings } from "../core/ciphers";
import { evaluateGate } from "../core/gates";
import { emptyState, reduceAll, type GameState, type StateEvent, type StateEventBody } from "../core/state";
import { printableStrings } from "../artifacts/bytes";
import { readExif } from "../artifacts/jpeg";
import { pngTextChunks } from "../artifacts/png";
import { readZip } from "../artifacts/zip";
import { answerMatches, type PrimitiveRuntime, type SiteRequest } from "../primitives/types";
import { buildSite } from "../sites/runtime";
import { renderText, type NodeInstance, type TeamWorld } from "../world";

/**
 * Synthetic solver bots for event-quality testing. They estimate how much of a
 * challenge falls to shortcuts — reading the text, crawling a site, running
 * `strings`/exiftool — instead of the intended investigation. They are not a
 * claim that anything is "AI-proof".
 */

export interface SolverReport {
  text: { solved: boolean; how: string | null };
  browser: { applicable: boolean; answerExposed: boolean; fragmentsFound: number; fragmentsTotal: number };
  forensic: { applicable: boolean; solved: boolean; how: string | null };
}

const tokens = (s: string) => [...new Set(s.match(/[A-Za-z0-9+/=._:\-]{3,}|"[^"]{3,80}"|`[^`]{3,120}`/g) ?? [])].map((t) => t.replace(/^["`]|["`]$/g, ""));

/** Reads only the node's text (briefing + public view) and tries every cheap decoding. */
export function textSolver(ni: NodeInstance, world: TeamWorld): SolverReport["text"] {
  const answer = ni.instance.outputs.answer;
  if (!answer) return { solved: false, how: null };
  const view = JSON.stringify(ni.primitive.view(ni.instance, undefined, emptyState("x", "x")) ?? {});
  const text = `${renderText(ni.node.briefing, world.facts)}\n${view}`;
  if (answer.length >= 3 && text.toLowerCase().includes(answer.toLowerCase())) return { solved: true, how: "answer appears in the text" };
  for (const tok of tokens(text)) {
    for (const d of naiveDecodings(tok)) if (answerMatches(d, answer, "loose")) return { solved: true, how: `decodes from "${tok.slice(0, 40)}"` };
  }
  // Whole-line decodings (multi-word ciphertexts).
  for (const line of text.split(/\\n|\n/)) for (const d of naiveDecodings(line.trim())) if (d.length < 200 && answerMatches(d.replace(/^.*:\s*/, ""), answer, "loose")) return { solved: true, how: "a line decodes to the answer" };
  return { solved: false, how: null };
}

function crawl(built: ReturnType<typeof buildSite>): string {
  const base = "/x/bot/";
  const req = (path: string, query = ""): SiteRequest => ({ method: "GET", path, query: new URLSearchParams(query), headers: new Headers(), cookies: {}, body: "" });
  const out: string[] = [];
  const seen = new Set<string>();
  const queue = ["", "directory", "about", "api/status", "api/bootstrap?page=home", "assets/app.min.js", "assets/app.min.js.map"];
  while (queue.length && seen.size < 60) {
    const raw = queue.shift()!;
    if (seen.has(raw)) continue;
    seen.add(raw);
    const [p, q] = raw.split("?");
    const { res } = built.handle(req(p!, q ?? ""), base);
    const body = typeof res.body === "string" ? res.body : "";
    out.push(body, JSON.stringify(res.headers ?? {}));
    for (const m of body.matchAll(/href="([a-z0-9][a-z0-9-/]{0,60})"/g)) if (!seen.has(m[1]!)) queue.push(m[1]!);
    for (const m of body.matchAll(/data-page="([a-z0-9-/]+)"/g)) queue.push(`api/bootstrap?page=${m[1]}`);
  }
  return out.join("\n");
}

/** Crawls the synthetic site like a scraper (no DevTools reasoning, no request replay). */
export function browserSolver(ni: NodeInstance, world: TeamWorld, bp: BlueprintT): SolverReport["browser"] {
  const contrib = ni.primitive.site?.(ni.instance, ni.ctx);
  if (!contrib) return { applicable: false, answerExposed: false, fragmentsFound: 0, fragmentsTotal: 0 };
  const def = bp.sites.find((s) => s.id === contrib.site);
  if (!def) return { applicable: true, answerExposed: false, fragmentsFound: 0, fragmentsTotal: 0 };
  const all = [...world.nodes.values()].map((x) => ({ node: x.node.id, item: x.primitive.site?.(x.instance, x.ctx) })).filter((x): x is { node: string; item: NonNullable<typeof x.item> } => Boolean(x.item) && x.item!.site === def.id);
  const text = crawl(buildSite(def, all));
  const answer = (ni.instance.intentional ?? []).includes("plain") ? "" : (ni.instance.outputs.answer ?? "");
  const frags = Object.entries(ni.instance.outputs).filter(([k]) => k.startsWith("frag_")).map(([, v]) => v);
  return { applicable: true, answerExposed: answer.length >= 4 && text.includes(answer), fragmentsFound: frags.filter((f) => text.includes(f)).length, fragmentsTotal: frags.length };
}

/** Runs the reflexive tools (`strings`, exiftool, PNG text, unzip without password) over the node's artifacts. */
export async function forensicSolver(ni: NodeInstance): Promise<SolverReport["forensic"]> {
  const specs = ni.primitive.artifacts?.(ni.instance, ni.ctx) ?? [];
  if (!specs.length) return { applicable: false, solved: false, how: null };
  const answer = ni.instance.outputs.answer;
  if (!answer || answer.length < 4 || (ni.instance.intentional ?? []).includes("plain")) return { applicable: true, solved: false, how: null };
  for (const s of specs) {
    const data = await s.build();
    const found: string[] = [...printableStrings(data, 4)];
    if (s.mime === "image/jpeg") found.push(...Object.values(readExif(data)));
    if (s.mime === "image/png") found.push(...Object.values(pngTextChunks(data)));
    if (s.mime === "application/zip") {
      try {
        for (const e of readZip(data)) if (e.data) found.push(...printableStrings(e.data, 4));
      } catch {
        /* not readable without a password */
      }
    }
    const hay = found.join("\n");
    if (hay.includes(answer)) return { applicable: true, solved: true, how: `\`strings\`/metadata on ${s.name} shows the answer directly` };
  }
  return { applicable: true, solved: false, how: null };
}

/* ─────────────────────────── GraphStateSolver ─────────────────────────── */

export interface Playthrough {
  state: GameState;
  solvedOrder: string[];
  unlockedNever: string[];
  stuck: { node: string; reason: string }[];
  steps: number;
}

/**
 * Plays the whole event with perfect knowledge: unlocks via gates, applies each
 * primitive's intended solution, grants rewards, confirms checkpoints, builds
 * the ideal evidence board. What it cannot reach is unreachable; what it
 * reaches but cannot solve has no working intended solution.
 */
export async function playthrough(bp: BlueprintT, world: TeamWorld, opts: { now?: Date } = {}): Promise<Playthrough> {
  const endish = new Date(Math.max(Date.parse(bp.event.endsAt ?? "2100-01-01T00:00:00Z") - 60_000, ...bp.nodes.flatMap((n) => JSON.stringify(n.gate ?? {}).match(/"after":"([^"]+)"/g) ?? []).map((m) => Date.parse(m.slice(9, -1)) + 1000)));
  const now = opts.now ?? endish;
  let seq = 0;
  let s = emptyState(bp.event.id, world.teamId, { phase: bp.acts[0]?.phase ?? "briefing", hintTokens: bp.hintEconomy.startingTokens });
  const apply = (bodies: StateEventBody[]) => {
    const evs = bodies.map((b) => ({ ...b, seq: ++seq, at: new Date(now.getTime() + seq).toISOString() }) as StateEvent);
    s = reduceAll(s, evs);
  };
  const solvedOrder: string[] = [];
  const stuck: { node: string; reason: string }[] = [];
  const failed = new Set<string>();
  const rewards = (n: NodeDef): StateEventBody[] => [
    ...n.rewards.evidence.map((id) => ({ type: "evidence.gained" as const, id, source: `node:${n.id}` })),
    ...Object.entries(n.rewards.flags).map(([key, value]) => ({ type: "flag.set" as const, key, value })),
    ...Object.entries(n.rewards.resources).filter(([, d]) => d).map(([r, d]) => ({ type: "resource.delta" as const, resource: r as "intel", delta: d!, reason: "reward" })),
    ...(n.rewards.phase ? [{ type: "phase.set" as const, phase: n.rewards.phase }] : []),
    ...n.rewards.timeline.map((id) => ({ type: "timeline.learned" as const, id })),
    ...n.rewards.locations.map((id) => ({ type: "location.visited" as const, id })),
  ];
  // The ideal board: every true relationship, drawn once the team could know both ends.
  const idealBoard = bp.relations.map((r) => ({ from: r.from, to: r.to, label: r.kind }));
  let steps = 0;
  for (let round = 0; round < bp.nodes.length * 3 + 10; round++) {
    let progress = false;
    for (const n of bp.nodes) if (!s.nodes[n.id] && evaluateGate(n.gate, s, { now })) {
      apply([{ type: "node.unlocked", node: n.id, round: n.round, reason: "gate" }]);
      progress = true;
    }
    for (const e of bp.evidence) if (e.gate && !s.evidence[e.id] && evaluateGate(e.gate, s, { now })) {
      apply([{ type: "evidence.gained", id: e.id, source: "gate" }]);
      progress = true;
    }
    if (bp.relations.length && s.board.valid < bp.relations.length) {
      apply([{ type: "board.evaluated", valid: bp.relations.length, invalid: 0 }]);
    }
    for (const n of bp.nodes) {
      const ns = s.nodes[n.id];
      if (!ns || ns.status !== "unlocked" || failed.has(n.id)) continue;
      const ni = world.nodes.get(n.id);
      if (!ni) {
        stuck.push({ node: n.id, reason: world.errors.get(n.id) ?? "instance missing" });
        failed.add(n.id);
        continue;
      }
      // Physical checkpoints: the simulated team walks there and a volunteer confirms.
      const cp = (n.config as { checkpoint?: string }).checkpoint;
      if (cp && (n.primitive === "qr-checkpoint" || n.primitive === "gps-checkpoint") && !s.checkpoints[cp]) apply([{ type: "checkpoint.confirmed", id: cp }]);
      const rt: PrimitiveRuntime = { now, playtest: true, facts: world.facts, boardLinks: async () => idealBoard };
      let solved = false;
      let reason = "intended solution did not solve the node";
      const actions = ni.primitive.intendedSolution(ni.instance, s);
      // Static answers imported as hashes only cannot be replayed; assume the author's answer works.
      if (!actions.length && n.primitive === "static-answer") solved = true;
      for (const action of actions) {
        const parsed = ni.primitive.actionSchema.safeParse(action);
        if (!parsed.success) {
          reason = `intended action fails schema: ${parsed.error.issues[0]?.message}`;
          break;
        }
        const v = ni.primitive.validateAction(parsed.data, ni.instance, s.nodes[n.id], s);
        if (!v.ok) {
          reason = `intended action rejected: ${v.message}`;
          break;
        }
        const t = await ni.primitive.applyAction(parsed.data, ni.instance, s.nodes[n.id], s, rt);
        steps++;
        apply(t.events.map((e) => ("node" in e && e.node === "" ? ({ ...e, node: n.id } as StateEventBody) : e)));
        if (t.solved) {
          solved = true;
          break;
        }
      }
      if (solved) {
        apply([{ type: "node.solved", node: n.id, points: n.scoring.points }, ...rewards(n)]);
        solvedOrder.push(n.id);
        progress = true;
      } else if (n.primitive === "interview" || n.primitive === "timeline") {
        // These can depend on evidence that arrives later: retry on the next round, fail at the end.
      } else {
        stuck.push({ node: n.id, reason });
        failed.add(n.id);
      }
    }
    if (!progress) break;
  }
  for (const n of bp.nodes) if (s.nodes[n.id]?.status === "unlocked" && !failed.has(n.id)) stuck.push({ node: n.id, reason: "never became solvable (missing evidence or state)" });
  return { state: s, solvedOrder, unlockedNever: bp.nodes.filter((n) => !s.nodes[n.id]).map((n) => n.id), stuck, steps };
}
