"use client";

import { Archive, ExternalLink, Globe } from "lucide-react";

import { ArtifactBench } from "./forensics";
import type { ArtifactLink } from "./types";
import { Window } from "./window";

/** A finished file stays on the shelf: its site and its exhibits remain reachable for later deductions. */
export function ArchivedRoom({ site, artifacts, fingerprint, solved }: { site: { url: string; title: string } | null; artifacts: ArtifactLink[]; fingerprint: string; solved: boolean }) {
  return (
    <div className="space-y-4">
      <p className="label-mono flex items-center gap-2">
        <Archive className="size-3.5" aria-hidden="true" /> {solved ? "Archived — later deductions often need a second look" : "Sealed — the exhibits are still yours to read"}
      </p>
      {site ? (
        <a href={site.url} target="_blank" rel="noopener noreferrer" className="pressable panel flex items-center gap-3 px-4 py-3 hover:border-line-strong">
          <Globe className="size-5 shrink-0 text-signal-2" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-sm font-semibold">{site.title}</span>
            <span className="block text-xs text-mute">Revisit the sandbox site</span>
          </span>
          <ExternalLink className="size-4 text-mute" aria-hidden="true" />
        </a>
      ) : null}
      {artifacts.length ? (
        <Window variant="lens" title="Evidence bench" subtitle={`${artifacts.length} exhibit${artifacts.length === 1 ? "" : "s"}`} bodyClassName="p-4 sm:p-6">
          <ArtifactBench items={artifacts} fingerprint={fingerprint} />
        </Window>
      ) : null}
    </div>
  );
}
