import { route } from "@/server/http";
import { listAudit } from "@/server/engine/admin";

export const GET = route({ auth: "staff", role: "admin" }, async ({ req, db, event }) => {
  const before = Number(new URL(req.url).searchParams.get("before") ?? 0) || undefined;
  const rows = await listAudit(db, event?.id ?? null, before);
  return { rows, next: rows.length === 100 ? rows.at(-1)!.id : null };
});
