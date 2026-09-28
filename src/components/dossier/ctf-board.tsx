"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ChallengeView } from "@/server/engine/play";
import { ChallengeCard } from "./challenge-card";
import { EmptyState } from "./primitives";
import { useFresh } from "./use-fresh";

interface Category {
  id: string;
  name: string;
  description: string;
}

/**
 * CTF board: category strip (with per-category progress), search, and an
 * "unsolved only" toggle. Filtering is client-side over data the server already
 * scoped to what this team may see.
 */
export function CtfBoard({ eventId, challenges, categories }: { eventId: string; challenges: ChallengeView[]; categories: Category[] }) {
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [unsolved, setUnsolved] = useState(false);
  const openIds = useMemo(() => challenges.filter((c) => c.state === "open" || c.state === "solved").map((c) => c.id), [challenges]);
  const fresh = useFresh(`${eventId}.ctf`, openIds);
  const titles = useMemo(() => new Map(challenges.filter((c) => "title" in c).map((c) => [c.id, (c as { title: string }).title])), [challenges]);

  const stats = useMemo(() => {
    const m = new Map<string, { total: number; solved: number }>();
    for (const c of challenges) {
      const k = c.category ?? "other";
      const s = m.get(k) ?? { total: 0, solved: 0 };
      s.total += 1;
      if (c.state === "solved") s.solved += 1;
      m.set(k, s);
    }
    return m;
  }, [challenges]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return challenges.filter((c) => {
      if (cat && c.category !== cat) return false;
      if (unsolved && c.state === "solved") return false;
      if (term) {
        const hay = `${"title" in c ? c.title : ""} ${c.category ?? ""} ${"tags" in c ? c.tags.join(" ") : ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [challenges, cat, q, unsolved]);

  const grouped = useMemo(() => {
    const order = categories.map((c) => c.id);
    const g = new Map<string, ChallengeView[]>();
    for (const c of filtered) {
      const k = c.category ?? "other";
      g.set(k, [...(g.get(k) ?? []), c]);
    }
    return [...g.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [filtered, categories]);

  const total = challenges.length;
  const solvedTotal = challenges.filter((c) => c.state === "solved").length;

  return (
    <div className="space-y-5">
      {/* Category strip */}
      <div role="toolbar" aria-label="Filter by category" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <CategoryChip active={cat === null} onClick={() => setCat(null)} label="All" solved={solvedTotal} total={total} />
        {categories.map((c) => {
          const s = stats.get(c.id) ?? { total: 0, solved: 0 };
          return <CategoryChip key={c.id} active={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)} label={c.name} solved={s.solved} total={s.total} title={c.description} />;
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mute" aria-hidden="true" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search challenges, tags…" aria-label="Search challenges" className="pl-9" />
          {q ? (
            <button type="button" onClick={() => setQ("")} className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center text-mute hover:text-ink" aria-label="Clear search">
              <X className="size-4" />
            </button>
          ) : null}
        </div>
        <label className="flex h-10 cursor-pointer items-center gap-3 rounded-sm border border-line px-3 font-mono text-[0.7rem] uppercase tracking-[0.1em] text-mute">
          <Switch checked={unsolved} onCheckedChange={setUnsolved} aria-label="Show unsolved only" />
          Unsolved only
        </label>
      </div>

      {grouped.length === 0 ? (
        <EmptyState title="No matches" compact>
          Nothing on the board matches that filter. Clear the search or show solved challenges.
        </EmptyState>
      ) : (
        grouped.map(([k, list]) => {
          const meta = categories.find((c) => c.id === k);
          const s = stats.get(k);
          return (
            <section key={k} aria-labelledby={`cat-${k}`}>
              <div className="mb-3 flex items-center gap-3">
                <h2 id={`cat-${k}`} className="font-mono text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-ink">
                  {meta?.name ?? k}
                </h2>
                <span aria-hidden="true" className="h-px flex-1 bg-line" />
                <span className="label-mono">
                  {s?.solved ?? 0}/{s?.total ?? 0}
                </span>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => (
                  <li key={c.id} className="flex">
                    <div className="flex w-full flex-col [&>*]:flex-1">
                      <ChallengeCard c={c} fresh={fresh.has(c.id)} depTitles={titles} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function CategoryChip({ active, onClick, label, solved, total, title }: { active: boolean; onClick: () => void; label: string; solved: number; total: number; title?: string }) {
  const pct = total ? solved / total : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "pressable relative flex h-11 min-w-28 shrink-0 flex-col justify-center overflow-hidden rounded-sm border px-3 text-left",
        active ? "border-[var(--accent)] bg-raised text-ink" : "border-line bg-surface text-mute hover:border-line-strong hover:text-ink",
      )}
    >
      <span className="font-mono text-[0.72rem] font-semibold uppercase tracking-[0.1em]">{label}</span>
      <span className="num text-[0.65rem] text-faint">
        {solved}/{total}
      </span>
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-line">
        <span className="block h-full bg-signal transition-[width] duration-500" style={{ width: `${pct * 100}%` }} />
      </span>
    </button>
  );
}
