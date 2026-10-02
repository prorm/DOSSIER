"use client";

import { ExternalLink, Globe, MousePointerClick, ScanSearch, Search } from "lucide-react";

import { AnswerForm } from "@/components/dossier/answer-form";
import type { StageContext } from "./types";
import { Chip, Question, Window } from "./window";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** DevTools panes the challenge expects you to reach for, as chips (from the primitive's own description). */
function Instruments({ tools }: { tools: string[] }) {
  if (!tools.length) return null;
  return (
    <div>
      <p className="label-mono mb-2 flex items-center gap-2">
        <ScanSearch className="size-3.5" aria-hidden="true" /> Instruments — open the site, then press <kbd className="rounded-xs border border-line-strong px-1 text-[0.65rem]">F12</kbd>
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {tools.map((t) => (
          <li key={t}>
            <Chip tone="info">{t}</Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A believable window onto a synthetic site. The site itself is a real page
 * served from the sandbox (it only gives up its secrets to real browser
 * tooling); this room frames it: what it is, what to reach for, and what you
 * have already found.
 */
export function WebStage({ ctx, variant }: { ctx: StageContext; variant: "web" | "osint" }) {
  const v = ctx.view as { question?: string; answerFormat?: string; secretName?: string; attempts?: number; start?: string };
  const site = ctx.site;
  const host = site ? (variant === "osint" ? `search.public.web/${slug(site.title)}` : `${slug(site.title)}.intranet`) : "sandbox.local";
  return (
    <div className="space-y-5">
      <Window variant="browser" address={host} title={site?.title ?? "Sandbox"} subtitle={variant === "osint" ? "public trail" : "team-scoped session"} className="web-window">
        <div className="web-preview" aria-hidden="true">
          <div className="web-nav">
            <span className="web-logo" />
            <span />
            <span />
            <span />
            <span className="ml-auto web-pill" />
          </div>
          <div className="web-hero">
            <b>{site?.title ?? "Sandbox site"}</b>
            <i />
            <i style={{ width: "62%" }} />
          </div>
          <div className="web-cards">
            {variant === "osint" ? (
              <>
                <span><em /><em /></span>
                <span><em /><em /></span>
                <span><em /><em /></span>
              </>
            ) : (
              <>
                <span />
                <span />
                <span />
              </>
            )}
          </div>
        </div>
        <div className="web-cta">
          {site ? (
            <a href={site.url} target="_blank" rel="noopener noreferrer" className="u-cta">
              {variant === "osint" ? <Search className="size-4" aria-hidden="true" /> : <Globe className="size-4" aria-hidden="true" />} Open the site <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : (
            <p className="font-mono text-xs text-signal-amber">This site could not be generated for your team.</p>
          )}
          <p className="mt-3 max-w-md text-center text-[0.8rem] text-ink-dim">
            {variant === "osint"
              ? "A fictional public trail: profiles, posts and pages that only make sense together. Nothing here touches real accounts."
              : "A live service inside the DOSSIER sandbox, generated for your team. Your browser's developer tools work on it; nothing there touches real accounts."}
          </p>
        </div>
      </Window>

      <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Instruments tools={ctx.tools} />
          <Question q={v.question} format={v.answerFormat} />
          <AnswerForm nodeId={ctx.nodeId} disabledReason={ctx.disabledReason} label={v.secretName ? `Submit the ${v.secretName}` : "Submit answer"} hint={v.answerFormat} />
        </div>
        <section className="panel p-4" aria-labelledby="findings">
          <p id="findings" className="label-mono mb-3 flex items-center gap-2">
            <MousePointerClick className="size-3.5" aria-hidden="true" /> Findings log
          </p>
          {ctx.discoveries.length ? (
            <ol className="findings">
              {ctx.discoveries.map((d, i) => (
                <li key={d}>
                  <span className="num">{String(i + 1).padStart(2, "0")}</span>
                  <span>{d}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-mute">Nothing logged yet. Discoveries you make inside the site are recorded here as they happen{v.attempts ? ` (${v.attempts} attempts so far)` : ""}.</p>
          )}
        </section>
      </div>
    </div>
  );
}
