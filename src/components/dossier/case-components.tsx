"use client";

import { Fingerprint } from "lucide-react";
import Link from "next/link";

import SpotlightCard from "@/components/reactbits/SpotlightCard";
import { Badge } from "@/components/ui/badge";
import { EVIDENCE_ICON } from "@/lib/evidence";
import { cn } from "@/lib/utils";
import type { EvidenceView, PersonView } from "@/server/engine/inquest";
import { Markdown } from "./markdown-client";

/** Evidence card: a tagged exhibit. Unseen exhibits carry a NEW tag (text, not just colour). */
export function EvidenceCard({ e, index }: { e: EvidenceView; index: number }) {
  const Icon = EVIDENCE_ICON[e.kind] ?? Fingerprint;
  return (
    <SpotlightCard className={cn("panel pressable h-full hover:border-line-strong", e.isNew && "border-[color-mix(in_srgb,var(--accent-2)_45%,var(--color-line))]")} spotlightColor="color-mix(in srgb, var(--accent-2) 12%, transparent)">
      <Link href={`/play/inquest/evidence/${e.id}`} className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="label-mono flex items-center gap-1.5">
            <Icon className="size-3.5" aria-hidden="true" /> Exhibit {String(index + 1).padStart(2, "0")} · {e.kind}
          </span>
          {e.isNew ? <Badge variant="info">New</Badge> : null}
        </div>
        <h3 className="font-mono text-[0.95rem] font-semibold leading-snug">{e.title}</h3>
        {e.summary ? <p className="line-clamp-2 text-sm text-ink-dim">{e.summary}</p> : null}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {e.location ? <Badge variant="outline">{e.location.name}</Badge> : null}
          {e.suspects.map((s) => (
            <Badge key={s.id} variant="secondary">
              {s.name}
            </Badge>
          ))}
        </div>
      </Link>
    </SpotlightCard>
  );
}

/** Suspect dossier: portrait, role, key facts, background. */
export function SuspectDossier({ p, code }: { p: PersonView; code: string }) {
  return (
    <article className="panel brackets flex h-full flex-col overflow-hidden sm:flex-row">
      <div className="relative shrink-0 border-b border-line bg-bg sm:w-40 sm:border-r sm:border-b-0">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt={`Portrait of ${p.name}`} className="aspect-[4/5] w-full object-cover grayscale-[35%] sm:h-full" loading="lazy" />
        ) : (
          <div className="grid aspect-[4/5] w-full place-items-center text-faint sm:h-full" aria-hidden="true">
            <Fingerprint className="size-10" />
          </div>
        )}
        <span className="absolute top-2 left-2 rounded-xs bg-bg/85 px-1.5 py-0.5 font-mono text-[0.6rem] tracking-[0.14em] text-signal-2">{code}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="font-mono text-base font-semibold uppercase tracking-[0.04em]">{p.name}</h3>
          {p.role ? <p className="text-sm text-mute">{p.role}</p> : null}
        </div>
        {p.details.length ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
            {p.details.map((d) => (
              <div key={d.label} className="contents">
                <dt className="uppercase tracking-[0.1em] text-faint">{d.label}</dt>
                <dd className="text-ink-dim">{d.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {p.bodyMd ? <Markdown className="text-sm">{p.bodyMd}</Markdown> : null}
      </div>
    </article>
  );
}

/** Vertical timeline rail. Sealed entries are counted, never shown. */
export function Timeline({ items, hidden }: { items: { at: string; title: string; body: string }[]; hidden: number }) {
  return (
    <div>
      <ol className="relative ml-2 border-l border-line-strong">
        {items.map((t, i) => (
          <li key={i} className="relative pb-5 pl-6 last:pb-0">
            <span aria-hidden="true" className="absolute top-1.5 -left-[5px] size-2.5 rounded-full border-2 border-[var(--accent-2)] bg-bg" />
            <p className="num text-xs text-signal-2">{t.at}</p>
            <p className="font-mono text-sm font-semibold">{t.title}</p>
            {t.body ? <p className="mt-0.5 text-sm text-ink-dim">{t.body}</p> : null}
          </li>
        ))}
      </ol>
      {hidden > 0 ? (
        <p className="mt-4 ml-8 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-faint">
          ▓▓▓ {hidden} {hidden === 1 ? "entry" : "entries"} sealed — uncover more evidence
        </p>
      ) : null}
    </div>
  );
}
