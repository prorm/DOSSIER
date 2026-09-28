import path from "node:path";
import { z } from "zod";
import { readJson, route } from "@/server/http";
import { env } from "@/server/env";
import { listPacks, loadPack } from "@/server/packs/load";
import { importPack } from "@/server/packs/import";
import { GameError } from "@/server/engine/errors";

/** Lists packs on disk with their validation result. */
export const GET = route({ auth: "staff", role: "admin" }, async () => {
  const dir = path.resolve(env().PACKS_DIR);
  const slugs = await listPacks(dir);
  const packs = await Promise.all(
    slugs.map(async (slug) => {
      const r = await loadPack(dir, slug);
      return {
        slug,
        valid: Boolean(r.pack),
        name: r.pack?.event.name ?? null,
        hash: r.pack?.hash ?? null,
        modes: r.pack?.event.modes ?? [],
        challenges: r.pack?.challenges.length ?? 0,
        issues: r.issues,
      };
    }),
  );
  return { packs };
});

const Body = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/), activate: z.boolean().default(true) });

/** Import (owner only): re-imports are safe on a running event — removed content is hidden, never deleted. */
export const POST = route({ auth: "staff", role: "owner" }, async ({ req, db, actor }) => {
  const body = await readJson(req, Body);
  const r = await loadPack(path.resolve(env().PACKS_DIR), body.slug);
  if (!r.pack) throw new GameError("invalid", "Pack has validation errors.", { issues: r.issues });
  const summary = await importPack(db, r.pack, { activate: body.activate, actor });
  return { summary, warnings: r.issues };
});
