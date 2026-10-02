import { eq } from "drizzle-orm";
import { stringify } from "yaml";
import type { Executor } from "../db/client";
import { stories } from "../db/schema";
import { buildZip } from "../game/artifacts/zip";
import type { EventRow } from "../engine/types";

/**
 * Exports an event as a v2 pack: dossier.yaml (the published blueprint) plus
 * the story Markdown it was compiled from. Static answers are exported as
 * salted HMAC hashes, so the export re-imports only on a server that shares
 * the same ANSWER_SECRET. Station PINs are never exported. Generated
 * primitives need no answers at all: they are derived per team from the seed.
 */
export async function exportPack(db: Executor, event: EventRow): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const header = `# ${event.name} — exported from DOSSIER on ${new Date().toISOString()}\n# Blueprint v${event.blueprintVersion}. Validate with: pnpm pack:validate ${event.id}\n`;
  const bp = structuredClone((event.blueprint ?? event.draft ?? {}) as { checkpoints?: { pin?: string }[] });
  for (const cp of bp.checkpoints ?? []) delete cp.pin;
  files["dossier.yaml"] = header + stringify(bp, { lineWidth: 120 });
  const [story] = await db.select().from(stories).where(eq(stories.eventId, event.id)).limit(1);
  for (const s of story?.sources ?? []) files[`story/${s.name.replace(/[^A-Za-z0-9._-]/g, "_")}`] = s.markdown;
  return files;
}

export function zipFiles(files: Record<string, string | Uint8Array>): Uint8Array {
  return buildZip(Object.entries(files).map(([name, data]) => ({ name, data, store: true })));
}
