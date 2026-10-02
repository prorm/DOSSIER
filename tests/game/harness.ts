import { createHash } from "node:crypto";
import { Blueprint, type BlueprintT } from "../../src/server/game/core/blueprint";
import { CODEWORDS } from "../../src/server/game/core/pools";
import { Rng, instanceSeed } from "../../src/server/game/core/rng";
import { emptyState, type GameState, type NodeState } from "../../src/server/game/core/state";
import type { Facts } from "../../src/server/game/core/template";
import type { ChallengePrimitive, Instance, InstanceContext, PrimitiveRuntime } from "../../src/server/game/primitives/types";

/** A minimal valid blueprint wrapping a single node — enough context for primitive tests. */
export function blueprintFor(primitive: string, config: Record<string, unknown>): BlueprintT {
  return Blueprint.parse({
    event: { id: "harness", title: "Harness" },
    story: { title: "Harness story" },
    acts: [{ id: "a1", title: "Act" }],
    rounds: [{ id: "r1", act: "a1", title: "Round", family: "forensics" }],
    nodes: [{ id: "n1", round: "r1", title: "Node", primitive, config }],
  });
}

/** Deterministic per-team facts, standing in for the world builder. */
export function teamFacts(teamId: string): Facts {
  const rng = new Rng(instanceSeed("harness-secret", "harness", teamId, "world"));
  const h = rng.int(1, 4);
  return {
    codeword: rng.pick(CODEWORDS),
    badgeId: rng.code("KR-####"),
    photoTime: `${String(20 + (h % 3)).padStart(2, "0")}:${String(rng.int(10, 59)).padStart(2, "0")}`,
    wipeTime: `02:${String(rng.int(30, 55)).padStart(2, "0")}`,
    zipPassword: rng.code("????-####"),
    keyFragment: rng.code("xxxx-xxxx"),
  };
}

export function ctxFor(teamId: string, primitive: string, config: Record<string, unknown>, facts = teamFacts(teamId)): InstanceContext {
  const bp = blueprintFor(primitive, config);
  return { eventId: "harness", teamId, nodeId: "n1", node: bp.nodes[0]!, blueprint: bp, facts, rng: new Rng(instanceSeed("harness-secret", "harness", teamId, "node:n1")) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors the registry's heterogeneous primitive type
export async function instantiate<C, P, S, A extends { type: string } = any>(p: ChallengePrimitive<C, P, S, A>, teamId: string, config: Record<string, unknown>, facts?: Facts) {
  const parsed = p.schema.parse(config);
  const ctx = ctxFor(teamId, p.id, config, facts);
  const inst: Instance<P, S> = await p.createInstance(parsed, ctx);
  return { inst, ctx, config: parsed };
}

export const RT: PrimitiveRuntime = { now: new Date("2026-03-14T00:00:00Z"), playtest: false, facts: {} };

export function state(): GameState {
  return emptyState("harness", "team");
}

/** Runs the intended solution through validate → apply and reports whether the node ends solved. */
export async function solveWithIntended(p: ChallengePrimitive, inst: Instance): Promise<boolean> {
  let node: NodeState | undefined = { status: "unlocked", unlockedAt: "t", steps: {}, hints: [] };
  for (const action of p.intendedSolution(inst, state())) {
    const parsed = p.actionSchema.parse(action);
    const v = p.validateAction(parsed, inst, node, state());
    if (!v.ok) return false;
    const t = await p.applyAction(parsed, inst, node, state(), RT);
    for (const e of t.events) if (e.type === "node.step") node = { ...node!, steps: { ...node!.steps, [e.key]: e.value } };
    if (t.solved) return true;
  }
  return false;
}

export async function buildAll(p: ChallengePrimitive, inst: Instance, ctx: InstanceContext) {
  const specs = p.artifacts?.(inst, ctx) ?? [];
  return Promise.all(specs.map(async (s) => ({ ...s, data: await s.build() })));
}

export const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
