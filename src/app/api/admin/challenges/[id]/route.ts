import { readJson, route } from "@/server/http";
import { ChallengeEditInput, editChallenge } from "@/server/engine/admin";

export const PUT = route<"staff", { id: string }>({ auth: "staff", role: "admin", event: true }, async ({ req, db, event, actor }, { id }) => {
  const input = await readJson(req, ChallengeEditInput);
  await editChallenge(db, event!, id, input, actor);
  return { ok: true };
});
