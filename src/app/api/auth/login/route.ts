import { json, readJson, route, setCookieHeader } from "@/server/http";
import { LoginInput, loginTeam, startTeamSession } from "@/server/auth/accounts";
import { cookieName, cookieOptions, destroySession } from "@/server/auth/session";

export const POST = route({ auth: "none", event: true }, async ({ req, db, ip, event, cookies }) => {
  const input = await readJson(req, LoginInput);
  const team = await loginTeam(db, event!, input, ip);
  // Rotate: any previous session cookie on this browser is discarded (session fixation).
  await destroySession(db, cookies[cookieName("team")]);
  const { token, ttlMs } = await startTeamSession(db, team.id, ip, req.headers.get("user-agent"));
  const opts = cookieOptions(ttlMs);
  return json(
    { ok: true, team: { id: team.id, name: team.name } },
    { headers: { "set-cookie": setCookieHeader(cookieName("team"), token, { maxAge: opts.maxAge, secure: opts.secure }) } },
  );
});
