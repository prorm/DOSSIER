import type { Executor } from "../db/client";
import { audit, SYSTEM_ACTOR, type Actor } from "../audit";
import { recomputeLeaderboard } from "../engine/leaderboard";
import { prepareBlueprint, publishBlueprint, saveStorySources } from "../game/compile";
import { validateBlueprint, type ValidationReport } from "../game/compiler/validate";
import { blueprintFromV1 } from "./adapter";
import type { AnyPack } from "./schema";

export interface ImportSummary {
  eventId: string;
  challenges: number;
  checkpoints: number;
  activated: boolean;
  version: number;
  validation: Pick<ValidationReport, "ok" | "errors" | "warnings">;
}

/**
 * Imports (or re-imports) a pack. v1 packs are converted to a blueprint; every
 * pack then goes through the same path as a Studio event: prepare (hash static
 * answers — plaintext never reaches the database), compile-time validation,
 * publish (versioned) and materialisation. Re-importing a running event never
 * deletes history: removed nodes are hidden, the ledger is untouched.
 */
export async function importPack(db: Executor, pack: AnyPack, opts: { activate?: boolean; actor?: Actor; skipValidation?: boolean } = {}): Promise<ImportSummary> {
  const input = pack.format === "v2" ? pack.blueprint : blueprintFromV1(pack);
  const prepared = prepareBlueprint(input);
  const report = opts.skipValidation ? { ok: true, errors: [], warnings: [] } : await validateBlueprint(prepared.blueprint, { plaintext: prepared.plaintext, samples: 2 });
  if (!report.ok) {
    const first = report.errors.slice(0, 5).map((e) => `${e.node ? `[${e.node}] ` : ""}${e.message}`).join("; ");
    throw new Error(`pack ${pack.slug} failed compiler validation: ${first}`);
  }
  const activate = opts.activate ?? true;
  const { eventId, version } = await publishBlueprint(db, prepared.blueprint, { kind: "pack", activate, packHash: pack.hash });
  if (pack.format === "v2" && pack.sources.length) await saveStorySources(db, eventId, pack.sources, prepared.blueprint.story);
  await audit(db, opts.actor ?? SYSTEM_ACTOR, "pack.import", {
    eventId,
    target: pack.slug,
    details: { hash: pack.hash, format: pack.format, version, nodes: prepared.blueprint.nodes.length, warnings: report.warnings.length },
  });
  await recomputeLeaderboard(db, eventId);
  return {
    eventId,
    challenges: prepared.blueprint.nodes.length,
    checkpoints: prepared.blueprint.checkpoints.length,
    activated: activate,
    version,
    validation: { ok: report.ok, errors: report.errors, warnings: report.warnings },
  };
}
