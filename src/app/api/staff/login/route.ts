import { json, readJson, route, setCookieHeader } from "@/server/http";
import { loginStaff, StaffLoginInput } from "@/server/auth/accounts";
import { cookieName, cookieOptions, destroySession } from "@/server/auth/session";

export const POST = route({ auth: "none" }, async ({ req, db, ip, cookies }) => {
  const input = await readJson(req, StaffLoginInput);
  const { staff, token, ttlMs } = await loginStaff(db, input, ip);
  await destroySession(db, cookies[cookieName("staff")]);
  const opts = cookieOptions(ttlMs);
  return json(
    { ok: true, role: staff.role, redirect: staff.role === "volunteer" ? "/volunteer" : "/admin" },
    { headers: { "set-cookie": setCookieHeader(cookieName("staff"), token, { maxAge: opts.maxAge, secure: opts.secure }) } },
  );
});
