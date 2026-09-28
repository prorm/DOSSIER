import { json, route, setCookieHeader } from "@/server/http";
import { cookieName, cookieOptions, destroySession } from "@/server/auth/session";

export const POST = route({ auth: "team" }, async ({ db, cookies }) => {
  await destroySession(db, cookies[cookieName("team")]);
  const opts = cookieOptions(0);
  return json({ ok: true }, { headers: { "set-cookie": setCookieHeader(cookieName("team"), "", { maxAge: 0, secure: opts.secure }) } });
});
