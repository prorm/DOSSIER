import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChallengeEditor } from "@/components/dossier/challenge-editor";
import { EmptyState, PageHeader } from "@/components/dossier/primitives";
import { challenges } from "@/server/db/schema";
import { challengeConfig } from "@/server/engine/types";
import { requireStaffPage } from "@/server/page-auth";

export const metadata = { title: "Edit challenge" };

export default async function EditChallenge({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, event } = await requireStaffPage("admin");
  if (!event) return <EmptyState title="No active event" />;
  const [c] = await db.select().from(challenges).where(and(eq(challenges.eventId, event.id), eq(challenges.id, id))).limit(1);
  if (!c) notFound();
  const cfg = challengeConfig(c);
  return (
    <>
      <Link href="/admin/challenges" className="mb-4 inline-flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-mute hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden="true" /> Challenges
      </Link>
      <PageHeader eyebrow={`${c.mode} · ${c.id} · ${c.sourceFile ?? "edited in admin"}`} title={c.title} />
      <ChallengeEditor
        initial={{
          id: c.id,
          mode: c.mode,
          title: c.title,
          bodyMd: c.bodyMd,
          category: c.category,
          points: cfg.points,
          firstBloodBonus: cfg.first_blood_bonus,
          hidden: c.hidden,
          hints: cfg.hints,
          availableFrom: cfg.available_from ?? null,
          answerType: c.answerType,
          normalize: c.normalize,
          answerCount: c.answerHashes.length,
          dynamic: cfg.scoring.type === "dynamic",
        }}
      />
    </>
  );
}
