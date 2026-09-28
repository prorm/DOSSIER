import { route } from "@/server/http";
import { searchSubmissions, SubmissionQuery } from "@/server/engine/admin";

export const GET = route({ auth: "staff", role: "admin", event: true }, async ({ req, db, event }) => {
  const q = SubmissionQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await searchSubmissions(db, event!, q);
  return { rows: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })), next: rows.length === q.limit ? rows.at(-1)!.id : null };
});
