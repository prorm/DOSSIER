import type { BlueprintT, FactSpec, NodeDef } from "./core/blueprint";
import { Rng, instanceSeed } from "./core/rng";
import { render, renderString, shiftTime, templateRefs, type Facts } from "./core/template";
import { getPrimitive } from "./primitives/registry";
import type { ChallengePrimitive, Instance, InstanceContext } from "./primitives/types";

/**
 * The team world: world facts generated from the team seed, plus every node
 * instantiated in fact-dependency order so that one node's outputs (a password,
 * a badge id, a timestamp) become the next node's inputs. This is what makes
 * multi-hop chains coherent and per-team.
 */

export interface NodeInstance {
  node: NodeDef;
  primitive: ChallengePrimitive;
  config: unknown;
  instance: Instance;
  ctx: InstanceContext;
}

export interface TeamWorld {
  eventId: string;
  teamId: string;
  facts: Facts;
  nodes: Map<string, NodeInstance>;
  /** Node ids whose instantiation failed (validator reports these; the engine refuses to serve them). */
  errors: Map<string, string>;
}

function ipInCidr(cidr: string, rng: Rng): string {
  const [base, bits] = cidr.split("/");
  const b = base!.split(".").map(Number);
  const n = ((b[0]! << 24) >>> 0) + (b[1]! << 16) + (b[2]! << 8) + b[3]!;
  const hostBits = 32 - Number(bits);
  const size = hostBits >= 31 ? 2 : 2 ** hostBits;
  const host = hostBits >= 31 ? 0 : rng.int(2, Math.max(2, size - 2));
  const v = ((n & ~(size - 1)) + host) >>> 0;
  return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join(".");
}

export function generateFact(spec: FactSpec, rng: Rng, facts: Facts): string {
  switch (spec.gen) {
    case "const":
      return spec.value;
    case "word":
      return rng.pick(spec.from);
    case "code":
      return rng.code(spec.pattern);
    case "int":
      return String(rng.int(spec.min, spec.max));
    case "hex":
      return rng.hex(spec.bytes);
    case "ipv4":
      return ipInCidr(spec.cidr, rng);
    case "time":
      return shiftTime(spec.base, spec.jitterMinutes ? rng.int(-spec.jitterMinutes, spec.jitterMinutes) : 0);
    case "pick":
      return rng.pick(spec.options);
    case "derive":
      return renderString(spec.template, facts);
  }
}

/** World facts only (no node outputs), in declaration order with derived facts last. */
export function worldFacts(bp: BlueprintT, secret: string, eventId: string, teamId: string): Facts {
  const facts: Facts = {};
  const rng = new Rng(instanceSeed(secret, eventId, teamId, "world"));
  const entries = Object.entries(bp.world.facts);
  for (const [k, spec] of entries) if (spec.gen !== "derive") facts[k] = generateFact(spec, rng.fork(k), facts);
  // Derived facts may depend on each other; resolve in passes.
  let pending = entries.filter(([, s]) => s.gen === "derive");
  for (let pass = 0; pending.length && pass < pending.length + 1; pass++) {
    pending = pending.filter(([k, spec]) => {
      try {
        facts[k] = generateFact(spec, rng.fork(k), facts);
        return false;
      } catch {
        return true;
      }
    });
  }
  if (pending.length) throw new Error(`world facts cannot be derived: ${pending.map(([k]) => k).join(", ")}`);
  return facts;
}

export interface FactGraph {
  /** alias or "node.output" → producing node id */
  producers: Map<string, string>;
  /** node id → node ids it consumes facts from */
  consumes: Map<string, Set<string>>;
  /** node id → fact refs it uses that nobody provides */
  missing: Map<string, string[]>;
  order: string[];
  cycle: string[] | null;
}

/** Static analysis of which node's config consumes which node's outputs. */
export function factGraph(bp: BlueprintT): FactGraph {
  const worldKeys = new Set(Object.keys(bp.world.facts));
  const nodeIds = new Set(bp.nodes.map((n) => n.id));
  const producers = new Map<string, string>();
  for (const n of bp.nodes) for (const alias of Object.keys(n.exports)) producers.set(alias, n.id);
  const consumes = new Map<string, Set<string>>();
  const missing = new Map<string, string[]>();
  for (const n of bp.nodes) {
    const deps = new Set<string>();
    const miss: string[] = [];
    for (const ref of templateRefs({ config: n.config, hints: n.hints.map((h) => h.text) })) {
      if (worldKeys.has(ref)) continue;
      const dot = ref.indexOf(".");
      if (dot > 0 && nodeIds.has(ref.slice(0, dot))) deps.add(ref.slice(0, dot));
      else if (producers.has(ref)) deps.add(producers.get(ref)!);
      else miss.push(ref);
    }
    deps.delete(n.id);
    consumes.set(n.id, deps);
    if (miss.length) missing.set(n.id, miss);
  }
  // Kahn topological order (stable by blueprint order).
  const order: string[] = [];
  const indeg = new Map(bp.nodes.map((n) => [n.id, consumes.get(n.id)!.size]));
  const done = new Set<string>();
  let progress = true;
  while (progress) {
    progress = false;
    for (const n of bp.nodes) {
      if (done.has(n.id) || indeg.get(n.id)! > 0) continue;
      done.add(n.id);
      order.push(n.id);
      progress = true;
      for (const m of bp.nodes) if (consumes.get(m.id)!.has(n.id)) indeg.set(m.id, indeg.get(m.id)! - 1);
    }
  }
  const cycle = order.length === bp.nodes.length ? null : bp.nodes.filter((n) => !done.has(n.id)).map((n) => n.id);
  return { producers, consumes, missing, order, cycle };
}

export async function buildWorld(bp: BlueprintT, opts: { secret: string; eventId: string; teamId: string; only?: Set<string> }): Promise<TeamWorld> {
  const facts = worldFacts(bp, opts.secret, opts.eventId, opts.teamId);
  const graph = factGraph(bp);
  const nodes = new Map<string, NodeInstance>();
  const errors = new Map<string, string>();
  const byId = new Map(bp.nodes.map((n) => [n.id, n]));
  const order = graph.cycle ? [...graph.order, ...graph.cycle] : graph.order;
  for (const id of order) {
    const node = byId.get(id)!;
    const primitive = getPrimitive(node.primitive);
    if (!primitive) {
      errors.set(id, `unknown primitive "${node.primitive}"`);
      continue;
    }
    if ([...(graph.consumes.get(id) ?? [])].some((d) => errors.has(d) || !nodes.has(d))) {
      errors.set(id, "an upstream node failed to instantiate");
      continue;
    }
    try {
      const config = primitive.schema.parse(node.config);
      const ctx: InstanceContext = { eventId: opts.eventId, teamId: opts.teamId, nodeId: id, node, blueprint: bp, facts: { ...facts }, rng: new Rng(instanceSeed(opts.secret, opts.eventId, opts.teamId, `node:${id}`)) };
      const instance = await primitive.createInstance(config, ctx);
      nodes.set(id, { node, primitive, config, instance, ctx });
      for (const [k, v] of Object.entries(instance.outputs)) facts[`${id}.${k}`] = v;
      for (const [alias, output] of Object.entries(node.exports)) {
        if (instance.outputs[output] === undefined) throw new Error(`exports "${alias}" → output "${output}" does not exist`);
        facts[alias] = instance.outputs[output]!;
      }
    } catch (e) {
      errors.set(id, e instanceof Error ? e.message : String(e));
    }
  }
  return { eventId: opts.eventId, teamId: opts.teamId, facts, nodes, errors };
}

/** Renders node-level text (briefing, hints, evidence bodies) against the team's facts. Unknown refs render as a visible marker instead of throwing. */
export function renderText(text: string, facts: Facts): string {
  try {
    return renderString(text, facts);
  } catch {
    return text.replace(/\{\{[^}]*\}\}/g, "[redacted]");
  }
}

export { render };

/* ─── Cache ─── */

const g = globalThis as unknown as { __dossierWorlds?: Map<string, Promise<TeamWorld>> };
const cache = (g.__dossierWorlds ??= new Map());
const MAX = Number(process.env.WORLD_CACHE_MAX ?? 300);

export function cachedWorld(key: string, make: () => Promise<TeamWorld>): Promise<TeamWorld> {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const p = make().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, p);
  while (cache.size > MAX) cache.delete(cache.keys().next().value!);
  return p;
}

export function clearWorldCache(eventId?: string) {
  for (const k of [...cache.keys()]) if (!eventId || k.startsWith(`${eventId}:`)) cache.delete(k);
}
