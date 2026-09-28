import { z } from "zod";
import { readJson, route } from "@/server/http";
import { createStaff } from "@/server/auth/accounts";
import { listStaff, setStaffDisabled } from "@/server/engine/admin";

export const GET = route({ auth: "staff", role: "owner" }, async ({ db }) => ({ staff: await listStaff(db) }));

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    email: z.email().max(120),
    name: z.string().trim().min(1).max(60),
    role: z.enum(["owner", "admin", "volunteer"]),
    password: z.string().min(10, "Staff passwords need at least 10 characters").max(128),
  }),
  z.object({ action: z.literal("disable"), id: z.uuid(), disabled: z.boolean() }),
]);

export const POST = route({ auth: "staff", role: "owner" }, async ({ req, db, actor }) => {
  const body = await readJson(req, Body);
  if (body.action === "create") {
    const s = await createStaff(db, body, actor);
    return { id: s.id };
  }
  await setStaffDisabled(db, body.id, body.disabled, actor);
  return { ok: true };
});
