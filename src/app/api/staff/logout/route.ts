import { json, route, setCookieHeader } from "@/server/http";
import { cookieName, cookieOptions, destroySession } from "@/server/auth/session";

export const POST = route({ auth: "staffOrStation" }, async ({ db, cookies }) => {
  await destroySession(db, cookies[cookieName("staff")]);
  const opts = cookieOptions(0);
  return json({ ok: true }, { headers: { "set-cookie": setCookieHeader(cookieName("staff"), "", { maxAge: 0, secure: opts.secure }) } });
});
