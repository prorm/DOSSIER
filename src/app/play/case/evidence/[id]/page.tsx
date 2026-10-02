import { ArrowLeft, ArrowRight, MapPin, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LocalTime } from "@/components/dossier/local-time";
import { EvidenceBoardActions, SeenMarker } from "@/components/dossier/evidence-client";
import { sourceLine } from "@/components/experience/case/case-file";
import { ExhibitObject, kindLine, MiniExhibit } from "@/components/experience/case/exhibit-object";
import { RELATION_STYLE, isRelation, type RelationKind } from "@/lib/experience/relations";
import { teamDressing } from "@/lib/experience/variation";
import { nodeHref } from "@/lib/modes";
import { caseFileView, getBoard } from "@/server/game/engine";
import { presentationFingerprint } from "@/server/game/presentation";
import { requireTeamPage } from "@/server/page-auth";

export const metadata = { title: "Exhibit" };

/**
 * The examination table. The exhibit lies in the middle as the object it is;
 * around it, what the team knows *about* it: where it came from (the file that
 * produced it, which the universe still shows), who and where it concerns, and
 * the strings the team has already tied to it on its wall. Below, every other
 * exhibit on the table. Presentation only: no fact here is new to the team.
 */
export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, event, db } = await requireTeamPage(`/play/case/evidence/${id}`);
  const [f, board] = await Promise.all([caseFileView(db, event, session.team.id), getBoard(db, event.id, session.team.id)]);
  const index = f.evidence.findIndex((x) => x.id === id);
  const e = f.evidence[index];
  // Sealed evidence is indistinguishable from nonexistent evidence.
  if (!e) notFound();
  const dress = teamDressing(presentationFingerprint(event.id, session.team.id));
  const prev = f.evidence[index - 1];
  const next = f.evidence[index + 1];
  const number = String(index + 1).padStart(2, "0");
  const tag = dress.exhibitTag(`ev:${e.id}`);
  const custody = `${session.team.name} · ${dress.callsign}`;
  const taken = [...Object.values(board.layout.nodes), ...Object.values(board.layout.notes)].map((p) => ({ x: p.x, y: p.y }));

  // The strings this team has tied to this exhibit, read the way the wall reads them.
  const nameOf = (bid: string): string => {
    const [k, rest = ""] = bid.split(/:(.*)/s);
    if (k === "ev") return f.evidence.find((x) => x.id === rest)?.title ?? "an exhibit";
    if (k === "sus") return f.characters.find((x) => x.id === rest)?.name ?? "a person";
    if (k === "loc") return f.locations.find((x) => x.id === rest)?.name ?? "a place";
    if (k === "tl") return f.timeline.find((x) => x.id === rest)?.title ?? "a moment";
    return board.layout.notes[bid]?.text ? `note: “${board.layout.notes[bid]!.text.slice(0, 40)}”` : "a note";
  };
  const me = `ev:${e.id}`;
  const strings = board.layout.links
    .filter((l) => l.from === me || l.to === me)
    .map((l) => {
      const out = l.from === me;
      const other = nameOf(out ? l.to : l.from);
      const kind = isRelation(l.label) ? (l.label.trim().toLowerCase() as RelationKind) : null;
      const sentence = kind ? (out ? RELATION_STYLE[kind].sentence("This", other) : RELATION_STYLE[kind].sentence(other, "this")) : `${out ? "→" : "←"} ${other}${l.label ? ` (“${l.label}”)` : ""}`;
      return { id: l.id, sentence, tone: kind ? RELATION_STYLE[kind].tone : "ink" };
    });

  return (
    <article className="exam animate-reveal-up">
      <SeenMarker evidenceId={e.id} isNew={e.isNew} />
      <nav className="exam-top" aria-label="Exhibit navigation">
        <Link href="/play/case#exhibits" className="exam-back">
          <ArrowLeft className="size-3.5" aria-hidden="true" /> Case file
        </Link>
        <p className="exam-count">
          Exhibit <b className="num">{number}</b> of {f.evidence.length} · {kindLine(e.kind)}
        </p>
        <span className="exam-step">
          {prev ? (
            <Link href={`/play/case/evidence/${prev.id}`} rel="prev" aria-label={`Previous exhibit: ${prev.title}`}>
              <ArrowLeft className="size-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          {next ? (
            <Link href={`/play/case/evidence/${next.id}`} rel="next" aria-label={`Next exhibit: ${next.title}`}>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
        </span>
      </nav>

      <div className="exam-grid">
        <div className="exam-table" style={{ ["--tilt" as string]: `${((dress.noise(e.id) - 0.5) * 2.2).toFixed(2)}deg` }}>
          <div className="exam-lamp" aria-hidden="true" />
          <div className="exam-object">
            <ExhibitObject e={e} number={number} tag={tag} custody={custody} />
          </div>
        </div>

        <aside className="exam-rail" aria-label="About this exhibit">
          {/* The evidence tag: chain of custody, from the team's own record. */}
          <section className="custody" aria-labelledby="custody-h">
            <span className="custody-hole" aria-hidden="true" />
            <p id="custody-h" className="custody-head">
              Evidence <span>{tag}</span>
            </p>
            <dl className="custody-rows">
              <div>
                <dt>Item</dt>
                <dd>{e.title}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{kindLine(e.kind)}</dd>
              </div>
              <div>
                <dt>Logged</dt>
                <dd>
                  <LocalTime iso={e.at} format="full" />
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>
                  {e.from ? (
                    <Link href={nodeHref(e.from.id)} className="custody-link">
                      <span className="num">{dress.fileCode(e.from.id)}</span> {e.from.title}
                    </Link>
                  ) : (
                    sourceLine(e.source)
                  )}
                </dd>
              </div>
              <div>
                <dt>Held by</dt>
                <dd>{custody}</dd>
              </div>
            </dl>
          </section>

          {e.about.characters.length || e.about.locations.length ? (
            <section className="exam-sec" aria-labelledby="concerns-h">
              <h2 id="concerns-h" className="label-mono">
                It concerns
              </h2>
              <ul className="concerns">
                {e.about.characters.map((c) => (
                  <li key={c.id}>
                    <Link href={`/play/case#person-${c.id}`}>
                      <User className="size-3.5" aria-hidden="true" /> {c.name}
                    </Link>
                  </li>
                ))}
                {e.about.locations.map((l) => (
                  <li key={l.id}>
                    <span>
                      <MapPin className="size-3.5" aria-hidden="true" /> {l.name}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="exam-sec" aria-labelledby="wall-h">
            <h2 id="wall-h" className="label-mono flex items-center justify-between gap-2">
              On your wall
              <Link href="/play/board" className="text-[0.62rem] text-mute hover:text-ink">
                Open the board →
              </Link>
            </h2>
            {strings.length ? (
              <ul className="exam-strings">
                {strings.map((s) => (
                  <li key={s.id} className={`tone-${s.tone}`}>
                    <i aria-hidden="true" />
                    {s.sentence}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-mute">{board.layout.nodes[me] ? "Pinned, but no strings tied to it yet." : "Not on your wall yet."}</p>
            )}
            <div className="mt-3">
              <EvidenceBoardActions evidenceId={e.id} onBoard={Boolean(board.layout.nodes[me])} annotation={board.layout.annotations[me] ?? ""} taken={taken} />
            </div>
          </section>
        </aside>
      </div>

      {/* Everything else on the table: a contact sheet, in the order it was obtained. */}
      <nav className="contact" aria-label="Other exhibits">
        <p className="label-mono mb-2">
          On the table <span className="text-faint">· {f.evidence.length} held{f.sealed ? ` · ${f.sealed} sealed` : ""}</span>
        </p>
        <ol className="contact-strip">
          {f.evidence.map((x, i) => (
            <li key={x.id}>
              <Link href={`/play/case/evidence/${x.id}`} aria-current={x.id === e.id ? "page" : undefined} aria-label={`Exhibit ${i + 1}: ${x.title}`}>
                <MiniExhibit kind={x.kind} title={x.title} active={x.id === e.id} isNew={x.isNew} />
              </Link>
            </li>
          ))}
        </ol>
      </nav>
    </article>
  );
}
