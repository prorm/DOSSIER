import { json, readJson, route, setCookieHeader } from "@/server/http";
import { loginStation, StationLoginInput } from "@/server/auth/accounts";
import { cookieName, cookieOptions, destroySession } from "@/server/auth/session";

export const POST = route({ auth: "none", event: true }, async ({ req, db, ip, event, cookies }) => {
  const input = await readJson(req, StationLoginInput);
  const { checkpoint, token, ttlMs } = await loginStation(db, event!, input, ip);
  await destroySession(db, cookies[cookieName("staff")]);
  const opts = cookieOptions(ttlMs);
  return json(
    { ok: true, checkpoint: { id: checkpoint.id, name: checkpoint.name } },
    { headers: { "set-cookie": setCookieHeader(cookieName("staff"), token, { maxAge: opts.maxAge, secure: opts.secure }) } },
  );
});
