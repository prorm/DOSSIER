import type { BlueprintInput } from "../game/core/blueprint";
import type { Gate } from "../game/core/gates";
import type { ChallengeDef, PackDef } from "./schema";

/**
 * v1 packs (hunt / ctf / inquest / live) → v2 blueprint. The old modes become
 * what they always should have been: rounds of a given family, nodes using the
 * `static-answer` primitive, an evidence catalogue with reveal gates, a
 * `final-reconstruction` node for the accusation, and standalone checkpoints.
 */

const FAMILY: Record<ChallengeDef["mode"], "cryptic" | "ctf" | "inquest"> = { hunt: "cryptic", ctf: "ctf", inquest: "inquest" };

export function defaultNormalize(c: ChallengeDef): "loose" | "standard" | "exact" {
  if (c.answer.normalize) return c.answer.normalize;
  if (c.answer.type === "flag") return "exact";
  return c.mode === "hunt" ? "loose" : "standard";
}

function gateFor(c: ChallengeDef): Gate | undefined {
  const parts: Gate[] = [];
  if (c.requires?.all.length) parts.push(...c.requires.all.map((id) => ({ node: id })));
  if (c.requires?.any.length) parts.push(c.requires.any.length === 1 ? { node: c.requires.any[0]! } : { any: c.requires.any.map((id) => ({ node: id })) });
  if (c.available_from) parts.push({ after: c.available_from });
  return parts.length === 0 ? undefined : parts.length === 1 ? parts[0] : { all: parts };
}

export function blueprintFromV1(pack: PackDef): BlueprintInput {
  const e = pack.event;
  const story = pack.story;
  const modes = [...new Set(pack.challenges.map((c) => c.mode))].sort((a, b) => ["hunt", "ctf", "inquest"].indexOf(a) - ["hunt", "ctf", "inquest"].indexOf(b));
  const rounds: NonNullable<BlueprintInput["rounds"]> = modes.map((m) => ({
    id: m,
    act: "main",
    title: m === "hunt" ? e.hunt.title : m === "ctf" ? "Capture the Flag" : "Criminal Inquest",
    family: FAMILY[m],
    tier: "intermediate",
    intro: m === "hunt" ? e.hunt.intro_md : "",
  }));
  const nodes: NonNullable<BlueprintInput["nodes"]> = pack.challenges.map((c) => ({
    id: c.id,
    round: c.mode,
    title: c.title,
    primitive: "static-answer",
    briefing: c.body,
    config: {
      answer: { type: c.answer.type, normalize: defaultNormalize(c), accept: c.answer.accept.length ? c.answer.accept : undefined, hashes: c.answer.accept_hashes },
      ...(c.assets.length ? { files: c.assets } : {}),
      // v1 content predates leak auditing: classic text puzzles encode their answer in the briefing on purpose.
      intentional: ["plain", "caesar", "rot13", "atbash", "reverse", "b64", "hex", "morse", "base32"],
    },
    gate: gateFor(c),
    scoring:
      c.scoring.type === "dynamic"
        ? { points: c.scoring.initial, firstBloodBonus: c.first_blood_bonus, dynamic: { minimum: c.scoring.minimum, decay: c.scoring.decay } }
        : { points: c.points, firstBloodBonus: c.first_blood_bonus },
    hints: c.hints.map((h) => ({ level: "nudge" as const, cost: h.cost, text: h.text })),
    rewards: { evidence: c.reveals, flags: {}, resources: {}, timeline: [], locations: [] },
    family: c.mode,
    category: c.category,
    position: c.position,
    tags: c.tags,
    estimatedMinutes: 15,
  }));

  if (story) {
    const acc = story.accusation;
    rounds.push({ id: "verdict", act: "main", title: "Verdict", family: "final", tier: "final", intro: "" });
    nodes.push({
      id: "verdict",
      round: "verdict",
      title: "File the accusation",
      primitive: "final-reconstruction",
      briefing: story.briefing,
      config: {
        prompt: "Name the culprit and support it.",
        maxAttempts: acc.max_attempts,
        penalties: acc.penalties,
        coherenceBonus: 0,
        fields: acc.fields.map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          options:
            f.type === "suspect"
              ? story.suspects.map((s) => ({ id: s.id, label: s.name }))
              : f.type === "location"
                ? story.locations.map((l) => ({ id: l.id, label: l.name }))
                : f.type === "choice"
                  ? f.options
                  : [],
          answer: [acc.solution[f.id]!],
          points: f.points,
        })),
      },
      scoring: { points: 0, firstBloodBonus: 0 },
      family: "inquest",
      estimatedMinutes: 20,
    });
  }

  return {
    schema: "dossier/v2",
    event: {
      id: e.id,
      title: e.name,
      tagline: e.tagline,
      organizer: e.organizer,
      codename: e.theme.codename ?? "",
      logo: e.theme.logo,
      theme: { accent: e.theme.accent, secondary: e.theme.secondary },
      timezone: e.timezone,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      freezeAt: e.scoring.freeze_at,
      registration: { open: e.registration.open, code: e.registration.code },
      teamSize: { min: e.registration.min_members, max: e.registration.max_members },
      rules: e.rules_md,
      stuckAfterMinutes: e.scoring.stuck_after_minutes,
      bootLines: e.theme.boot_lines,
    },
    story: story
      ? {
          title: story.case.title,
          codename: story.case.codename,
          premise: story.case.summary,
          briefing: story.briefing,
          characters: [
            { id: "victim", name: story.victim.name, role: "victim", bio: story.victim.body, suspect: false },
            ...story.suspects.map((s) => ({ id: s.id, name: s.name, role: s.role, bio: s.body, suspect: true })),
          ],
          locations: story.locations.map((l) => ({ id: l.id, name: l.name, description: l.body })),
          timeline: story.timeline.map((t, i) => ({ id: `t${i + 1}`, at: t.at, title: t.title, body: t.body, public: !t.requires_evidence, requiresEvidence: t.requires_evidence })),
          truth: { culprit: story.suspects.some((x) => x.id === story.accusation.solution["culprit"]) ? story.accusation.solution["culprit"] : undefined, explanation: story.accusation.solution_md },
        }
      : { title: e.name },
    acts: [{ id: "main", title: e.name }],
    rounds: rounds.length ? rounds : [{ id: "field", act: "main", title: "Field", family: "physical", tier: "intermediate" }],
    nodes: nodes.length
      ? nodes
      : [{ id: "briefing", round: rounds[0]?.id ?? "field", title: "Briefing", primitive: "qr-checkpoint", config: { checkpoint: pack.checkpoints[0]?.id ?? "none" }, scoring: { points: 0, firstBloodBonus: 0 } }],
    evidence: (story?.evidence ?? []).map((x) => ({
      id: x.id,
      title: x.title,
      kind: x.kind,
      summary: x.summary,
      body: x.body,
      about: { characters: x.suspects, locations: x.location ? [x.location] : [], timeline: [] },
      gate: "at_start" in x.reveal ? { always: true as const } : "visible_from" in x.reveal ? { after: x.reveal.visible_from } : { node: x.reveal.after_challenge },
      image: x.image,
    })),
    checkpoints: pack.checkpoints.map((c) => ({ id: c.id, name: c.name, kind: "qr" as const, location: c.location, instructions: c.instructions, points: c.points, requiresApproval: c.requires_approval, pin: c.pin })),
    standaloneCheckpoints: true,
  };
}
