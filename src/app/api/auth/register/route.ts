import { json, readJson, route, setCookieHeader } from "@/server/http";
import { RegisterInput, registerTeam, startTeamSession } from "@/server/auth/accounts";
import { cookieName, cookieOptions } from "@/server/auth/session";

export const POST = route({ auth: "none", event: true }, async ({ req, db, ip, event }) => {
  const input = await readJson(req, RegisterInput);
  const team = await registerTeam(db, event!, input, ip);
  const { token, ttlMs } = await startTeamSession(db, team.id, ip, req.headers.get("user-agent"));
  const opts = cookieOptions(ttlMs);
  return json(
    { ok: true, team: { id: team.id, name: team.name } },
    { status: 201, headers: { "set-cookie": setCookieHeader(cookieName("team"), token, { maxAge: opts.maxAge, secure: opts.secure }) } },
  );
});
