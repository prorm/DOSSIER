import { createHmac } from "node:crypto";
import { z } from "zod";
import { profile } from "../core/difficulty";
import { renderString } from "../core/template";
import type { ChallengePrimitive, Instance, SiteContribution, SiteRequest, Transition } from "./types";
import { answerMatches, attempts, escapeHtml } from "./types";

/**
 * Cookie & session investigation on the synthetic site. The portal sets
 * several cookies; only one carries meaningful session state. A records page
 * is refused until the session is granted "records" clearance. The clearance
 * request is an in-fiction endpoint that only appears in network traffic, and
 * it requires a case code discovered in an earlier node. The session cookie is
 * HMAC-signed server-side, so editing it achieves nothing: the path forward is
 * investigation (find the endpoint, find the code, replay the request), which
 * transitions the synthetic session and reveals the record.
 *
 * Entirely synthetic: the cookies are path-scoped to the challenge site and
 * are unrelated to DOSSIER's own session.
 */
const Config = z
  .object({
    site: z.string().min(1).max(63),
    /** Code the team must present (usually an upstream node's output, e.g. `{{maintPass}}`). */
    code: z.string().min(1).max(200),
    header: z.string().regex(/^X-[A-Za-z-]{2,40}$/).default("X-Case-Code"),
    recordTitle: z.string().max(120).default("Door controller export"),
    /** Rows of the protected record; templated. One column holds the answer. */
    columns: z.array(z.string().max(40)).min(2).max(8).default(["time", "door", "badge", "result"]),
    rows: z.array(z.array(z.string().max(120))).min(1).max(40),
    answer: z.string().min(1).max(200),
    question: z.string().max(300).default("Which badge opened the door?"),
    decoyCookies: z.number().int().min(1).max(6).default(3),
  })
  .strict();
type C = z.infer<typeof Config>;

const Action = z.object({ type: z.literal("answer"), value: z.string().min(1).max(200) }).strict();
type A = z.infer<typeof Action>;

interface Pub {
  site: string;
  question: string;
}
interface Sec {
  code: string;
  key: string;
  answer: string;
  rows: string[][];
  config: C;
  visitorId: string;
  analytics: string;
}

function sign(key: string, payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url").slice(0, 22)}`;
}

function readSession(key: string, raw: string | undefined): { visitor: string; clearance: string } | null {
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  if (createHmac("sha256", key).update(body).digest("base64url").slice(0, 22) !== sig) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export const sessionState: ChallengePrimitive<C, Pub, Sec, A> = {
  id: "session-state",
  version: "1.0.0",
  family: "browser",
  label: "Cookie & session investigation",
  summary: "Synthetic cookies and a signed session; a hidden clearance request must be replayed with a code found elsewhere.",
  schema: Config,
  actionSchema: Action,
  example: () => ({ site: "portal", code: "{{maintPass}}", rows: [["02:47", "B-114", "{{badgeId}}", "GRANTED"]], answer: "{{badgeId}}" }),
  createInstance(config, ctx): Instance<Pub, Sec> {
    const rng = ctx.rng;
    const code = renderString(config.code, ctx.facts);
    const answer = renderString(config.answer, ctx.facts);
    return {
      public: { site: config.site, question: config.question },
      secret: {
        code,
        key: rng.hex(16),
        answer,
        rows: config.rows.map((r) => r.map((cell) => renderString(cell, ctx.facts))),
        config,
        visitorId: `v-${rng.hex(4)}`,
        analytics: `GA1.2.${rng.int(100000000, 999999999)}.${rng.int(1700000000, 1790000000)}`,
      },
      outputs: { answer },
      guarded: [answer],
    };
  },
  view: (inst, node) => ({ kind: "site", site: inst.public.site, question: inst.public.question, attempts: attempts(node) }),
  validateAction: () => ({ ok: true }),
  applyAction(action, inst, node): Transition {
    const ok = answerMatches(action.value, inst.secret.answer, "loose");
    return {
      events: ok ? [] : [{ type: "node.step", node: "", key: "attempts", value: attempts(node) + 1 }],
      solved: ok,
      correct: ok,
      submission: action.value.slice(0, 120),
      feedback: ok ? { tone: "success", title: "RECORD CONFIRMED" } : { tone: "fail", title: "NO MATCH", message: "That value does not appear where it matters in the protected record." },
    };
  },
  intendedSolution: (inst) => [{ type: "answer", value: inst.secret.answer }],
  isAttempt: () => true,
  site(inst): SiteContribution {
    const s = inst.secret;
    const c = s.config;
    const cookieName = "case_session";
    const visitorSession = sign(s.key, { visitor: s.visitorId, clearance: "public" });
    const decoys = [
      { name: "theme", value: "light" },
      { name: "_pa_id", value: s.analytics },
      { name: "investigator_state", value: "idle" },
      { name: "consent", value: "necessary%2Canalytics" },
      { name: "lang", value: "en-IN" },
      { name: "tz", value: "Asia%2FKolkata" },
    ].slice(0, c.decoyCookies);
    const records = (req: SiteRequest) => {
      const sess = readSession(s.key, req.cookies[cookieName]);
      if (!sess || sess.clearance !== "records") {
        return {
          status: 403,
          contentType: "application/json",
          headers: { "X-Clearance-Endpoint": "api/session/clearance", "X-Clearance-Header": c.header },
          body: JSON.stringify({ error: "clearance_required", required: "records", session: sess ? sess.clearance : "missing" }),
        };
      }
      return {
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ title: c.recordTitle, columns: c.columns, rows: s.rows }),
        discovery: { key: "records", label: `Protected record opened: ${c.recordTitle}` },
      };
    };
    return {
      site: c.site,
      cookies: [{ name: cookieName, value: visitorSession }, ...decoys],
      pages: [
        {
          path: "records",
          title: "Records desk",
          html: `<h1>Records desk</h1><p class="muted">Controlled records are released to sessions with the appropriate clearance.</p><div id="records-panel" class="panel" data-endpoint="api/records"><p>Checking clearance…</p></div>`,
        },
      ],
      endpoints: [
        { method: "GET", path: "api/records", handle: records },
        {
          method: "POST",
          path: "api/session/clearance",
          handle: (req) => {
            const presented = req.headers.get(c.header) ?? "";
            if (!answerMatches(presented, s.code, "loose")) {
              return { status: 401, contentType: "application/json", body: JSON.stringify({ error: "invalid_case_code", header: c.header }) };
            }
            const next = sign(s.key, { visitor: s.visitorId, clearance: "records" });
            return {
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ ok: true, clearance: "records" }),
              setCookies: [`${cookieName}=${next}`],
              discovery: { key: "clearance", label: "Session clearance granted for the records desk" },
            };
          },
        },
      ],
      sourceNotes: [`records panel: GET api/records; 403 responses carry the clearance endpoint in headers (see Network). Clearance is bound to the ${cookieName} cookie.`],
      domInserted: [{ path: "records", html: `<p class="muted small">Session reference: ${escapeHtml(s.visitorId)}</p>` }],
    };
  },
  difficulty: () =>
    profile({ knowledgeDifficulty: 5, reasoningDifficulty: 5, toolRequirement: 7, interactionDepth: 7, statefulness: 8, dependencyDepth: 2, crossModalComplexity: 4, redHerringDensity: 4, instanceUniqueness: 9 }),
  describe: () => ({
    skills: ["HTTP cookies & sessions", "reading request/response headers", "replaying a request"],
    tools: ["Application → Cookies", "Network → Headers", "Console fetch() or 'Copy as fetch'"],
    interaction: { channels: ["browser", "network", "state"], textExposure: 0.02 },
  }),
  harden(c) {
    if (c.decoyCookies >= 6) return null;
    return { config: { ...c, decoyCookies: 6 }, changes: [`Decoy cookies ${c.decoyCookies} → 6: more plausible state to rule out`] };
  },
};
