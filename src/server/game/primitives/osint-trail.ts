import { z } from "zod";
import { profile } from "../core/difficulty";
import { render } from "../core/template";
import type { ChallengePrimitive, SiteContribution } from "./types";
import { escapeHtml } from "./types";
import { AnswerAction, AnswerBlock, answerOutputs, checkAnswerTransition, resolveAnswer, type AnswerActionT, type AnswerSecret } from "./common";

/**
 * OSINT trail on a synthetic "public web": profiles, posts, a club roster,
 * a news item — intentionally public, entirely fictional, served inside the
 * DOSSIER sandbox. The answer requires correlating details across pages
 * (an alias on one page, a date on another, a roster on a third); no page
 * states it outright and nothing points outside the sandbox.
 */
const Page = z
  .object({
    path: z.string().regex(/^[a-z0-9][a-z0-9-/]{0,60}$/),
    title: z.string().min(1).max(120),
    kind: z.enum(["profile", "post", "page", "roster", "news"]).default("page"),
    author: z.string().max(80).optional(),
    date: z.string().max(40).optional(),
    body: z.string().max(6000),
    /** Table rows for roster pages. */
    table: z.object({ columns: z.array(z.string().max(40)).min(1).max(8), rows: z.array(z.array(z.string().max(120))).max(60) }).strict().optional(),
    nav: z.boolean().default(false),
  })
  .strict();

const Config = z
  .object({
    ...AnswerBlock,
    site: z.string().min(1).max(63),
    start: z.string().max(61),
    pages: z.array(Page).min(2).max(20),
  })
  .strict()
  .superRefine((c, ctx) => {
    const paths = new Set(c.pages.map((p) => p.path));
    if (!paths.has(c.start)) ctx.addIssue({ code: "custom", path: ["start"], message: `start page "${c.start}" is not defined` });
    c.pages.forEach((p, i) => {
      for (const m of p.body.matchAll(/\]\(([^)]+)\)/g)) if (!paths.has(m[1]!)) ctx.addIssue({ code: "custom", path: ["pages", i, "body"], message: `link to unknown page "${m[1]}"` });
    });
  });
type C = z.infer<typeof Config>;

/** Tiny, safe markup: paragraphs, **bold**, and [text](internal-path) links. Everything else is escaped. */
export function miniMarkup(src: string): string {
  return src
    .split(/\n{2,}/)
    .map((para) => {
      let h = escapeHtml(para.trim());
      h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      h = h.replace(/\[([^\]]+)\]\(([a-z0-9][a-z0-9-/]{0,60})\)/g, '<a href="$2">$1</a>');
      return `<p>${h.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

function pageHtml(p: z.infer<typeof Page>): string {
  const meta = [p.author ? `<span class="byline">${escapeHtml(p.author)}</span>` : "", p.date ? `<time>${escapeHtml(p.date)}</time>` : ""].filter(Boolean).join(" · ");
  const table = p.table
    ? `<table class="data"><thead><tr>${p.table.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${p.table.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : "";
  return `<article class="osint ${p.kind}"><h1>${escapeHtml(p.title)}</h1>${meta ? `<p class="muted small">${meta}</p>` : ""}${miniMarkup(p.body)}${table}</article>`;
}

export const osintTrail: ChallengePrimitive<C, { question: string; answerFormat: string; site: string; start: string }, AnswerSecret & { rendered: C }, AnswerActionT> = {
  id: "osint-trail",
  version: "1.0.0",
  family: "osint",
  label: "OSINT trail",
  summary: "A self-contained fictional public web (profiles, posts, rosters, news). The answer needs correlation across pages.",
  schema: Config,
  actionSchema: AnswerAction,
  example: () => ({
    question: "Which call sign belongs to the person who posted the observatory photo?",
    answer: "VU2-{{codeword}}",
    site: "public",
    start: "forum/thread-88",
    pages: [
      { path: "forum/thread-88", title: "Anyone else see lights at the old dome?", kind: "post", author: "nightowl_17", body: "Took this at 3am. Profile has my rig: [nightowl_17](u/nightowl-17)" },
      { path: "u/nightowl-17", title: "nightowl_17", kind: "profile", body: "Ham radio, telescopes. Member of the campus radio club." },
    ],
  }),
  createInstance(config, ctx) {
    const rendered = render(config, ctx.facts);
    const secret = { ...resolveAnswer(config, ctx.facts), rendered };
    return { public: { question: rendered.question, answerFormat: rendered.answerFormat, site: rendered.site, start: rendered.start }, secret, ...answerOutputs(secret), intentional: ["plain"] };
  },
  view: (inst) => ({ kind: "site", question: inst.public.question, answerFormat: inst.public.answerFormat, site: inst.public.site, start: inst.public.start }),
  validateAction: () => ({ ok: true }),
  applyAction: (a, inst, node) => checkAnswerTransition(a.value, inst.secret, node),
  intendedSolution: (inst) => [{ type: "answer", value: inst.secret.accept[0]! }],
  isAttempt: () => true,
  site(inst): SiteContribution {
    const c = inst.secret.rendered;
    return { site: c.site, pages: c.pages.map((p) => ({ path: p.path, title: p.title, nav: p.nav, html: pageHtml(p) })) };
  },
  difficulty: (c) => profile({ knowledgeDifficulty: 3, reasoningDifficulty: 4 + Math.min(5, c.pages.length / 2), interactionDepth: 3 + Math.min(5, c.pages.length / 2), crossModalComplexity: 3, redHerringDensity: Math.max(0, c.pages.length - 4), instanceUniqueness: JSON.stringify(c.pages).includes("{{") ? 7 : 1 }),
  describe: () => ({ skills: ["open-source research", "cross-referencing"], tools: ["a browser"], interaction: { channels: ["browser", "text"], textExposure: 0.15 } }),
};
