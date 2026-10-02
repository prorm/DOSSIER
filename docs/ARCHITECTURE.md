# DOSSIER Architecture

This document has two halves: the assessment of the pre-refactor codebase
(kept because it explains *why* the engine looks the way it does now) and the
architecture that replaced it.

---

## Part A — Assessment of the v1 codebase

### What was solid and is reused unchanged or nearly unchanged

| System | Where | Verdict |
| --- | --- | --- |
| Dual-runtime DB (PGlite in-process / Postgres) + checked-in SQL migrations | `src/server/db/*` | Kept. Also reused as the per-team **SQL sandbox** runtime. |
| Append-only triggers on ledgers | `drizzle/0001_*` | Kept, extended to the new state journal. |
| Sessions, CSRF, same-origin checks, the `route()` wrapper | `src/server/auth`, `src/server/http.ts` | Kept; event resolution changed so playtest teams play draft events. |
| Rate limiting (fixed window + exponential backoff) | `src/server/security/ratelimit.ts` | Kept, applied to every primitive action. |
| HMAC purpose-bound tokens | `src/server/security/crypto.ts` | Kept; now also signs site, artifact and team-scoped checkpoint tokens. |
| QR checkpoints, badges, volunteer stations | `src/server/engine/live.ts` | Kept and upgraded (claim limits, expiry, team-scoped QR, journal hooks). |
| SSE bus + polling fallback | `src/server/realtime`, `components/dossier/realtime.tsx` | Kept. |
| Leaderboard derivation from the ledger, freeze, caching | `src/server/engine/leaderboard.ts`, `scoring.ts` | Kept; breakdown generalised from 4 hard-coded modes to families. |
| YAML loader with line-accurate errors | `src/server/packs/load.ts` | Kept for v1 packs; v2 packs reuse its YAML/issue machinery. |
| Evidence-board op model + corkboard UI | `src/lib/board.ts`, `evidence-board.tsx` | Kept; links now carry a relation vocabulary and are validated server-side. |
| Design system, React Bits components | `src/app/globals.css`, `components/reactbits` | Kept. |

### What was hard-coded

* **The four modes were the architecture.** `hunt | ctf | inquest | live` was a
  closed union in the DB column type, the TypeScript types, the scoring
  breakdown, the navigation and every page. Adding a new kind of challenge meant
  touching all of them.
* **A challenge was a text body plus a static answer.** Every team saw
  identical content and identical answers; there was no concept of an instance.
* **One story per event with one global solution**, stored as a blob
  (`events.story`), used only by the inquest pages.
* **Difficulty was a label** (`easy|medium|hard|insane`) displayed and never used.
* **Hints were flat** (cost + text), bought in order; no levels, no economy.
* **Assets were static files** in the pack folder.

### What pretended to be dynamic but was static

* The "branching DAG" was `requires: {all, any}` over solved challenge ids plus
  `available_from`. No evidence, state, score, checkpoint or narrative gates.
* The evidence board was cosmetic: nothing validated links and nothing in the
  game depended on it.
* "Intercept logs", "CCTV stills", etc. were identical SVG/text files for every
  team; nothing required a tool beyond reading.
* Accusation options, evidence and timeline were identical for every team.

### Where answers reached (or could reach) the client

* Answers themselves were HMAC-hashed on import — good. But because answers
  were **identical across teams**, the answer *was* effectively public the
  moment one team shared it; the "shared wrong answer" signal could not detect
  shared *correct* answers.
* The accusation solution lived in plaintext in `events.story` (server-only,
  but still a raw solution at rest).
* Locked challenge views exposed prerequisite ids (structure leak, minor).
* Pack YAML files in the repo contain plaintext answers (inherent to static
  packs).

### Architectural problems that blocked "platform"

1. No per-team instance concept → no procedural generation, no anti-sharing.
2. The `GameMode` plugin contract covered availability and scoring only: no
   actions, no state, no artifacts, no generated content.
3. No game state beyond solves / hints / evidence reveals / board layout.
4. A single "active event" was assumed everywhere, which made drafts and
   organizer playtesting impossible.
5. Content could only be authored by editing YAML; no compiler, no validation
   of solution paths, no difficulty model.

---

## Part B — The engine

```
Organization → Event → Story/World → Acts → Rounds → Challenge graph
            → Challenge instances (per team, seeded) → State transitions (journal)
```

### B.1 Blueprint (the authored event)

`src/server/game/core/blueprint.ts` — one validated document per event
(`events.blueprint`, versioned). It holds event meta, the story model, world
facts, acts, rounds, nodes (challenges), evidence catalog, synthetic sites,
checkpoints, board relation truth, red herrings, hint economy and difficulty
curve. Studio edits a draft copy (`events.draft`); publishing compiles,
validates and materialises it into relational tables (`narrative_acts`,
`rounds`, `challenges`, `challenge_dependencies`, `characters`, `locations`,
`artifacts`, `evidence`, `hints`, `timeline_events`, `suspects`,
`checkpoints`) for querying and analytics. The runtime reads the compiled
blueprint (cached per `blueprint_version`).

### B.2 World facts and per-team instances

`seed = HMAC(ANSWER_SECRET, eventId | teamId | scope)` — the secret matters:
generators are open source, so an unkeyed seed would let players compute
their own answers.

`src/server/game/world.ts` builds a **team world**:

1. World facts (`blueprint.world.facts`) are generated from the team seed
   (codes, words, IPs, times …).
2. Nodes are instantiated in fact-dependency order. A node's config may use
   templates (`{{maintPass}}`, `{{photoTime | caesar:3}}`); its instance
   `outputs` become facts for downstream nodes.

This is what makes multi-hop chains real: the ZIP password in Act III is the
Morse word from the WAV; the DNS exfil in the PCAP is encoded with the scheme
found in the Git history; the final code is assembled from outputs of three
acts. `dependencyDepth` is computed from this fact graph plus gates.

### B.3 Primitives

`src/server/game/primitives/*` — trusted runtime code. Authored/generated
content is *configuration* validated by each primitive's Zod schema; nothing
authored is ever executed.

```ts
interface ChallengePrimitive {
  id, version, family, schema, actionSchema,
  createInstance(config, ctx)          // deterministic from ctx.rng
  view(instance, nodeState, state)     // the public representation
  validateAction(action, instance, nodeState, state)
  applyAction(action, instance, nodeState, state, runtime) → Transition
  intendedSolution(instance)           // used by the test harness & validator
  artifacts?(instance), site?          // real files, synthetic web mechanics
  difficulty(config), describe(config), harden?(config)
}
```

### B.4 Game state

`game_state_events` is an append-only journal (DB trigger enforced).
`GameState` is a pure fold over it (`core/state.ts`); `game_states` is a
rebuildable snapshot cache. The score ledger (`event_log`, exposed as the
`scores` view) receives the point consequences of journal events in the same
transaction.

```
ACTION → schema parse → availability → rate limit → primitive.validateAction
       → primitive.applyAction → Transition → (tx) journal + ledger + submissions
       → settle(): gates re-evaluated to a fixpoint → unlocks / evidence grants
       → snapshot → leaderboard recompute → SSE signal
```

### B.5 Gates (the challenge graph)

`core/gates.ts`: `node`, `all`, `any`, `atLeast`, `evidence`, `flag`,
`score`, `resource`, `checkpoint`, `after`, `before`, `phase`, `links`,
`discovery`, `hidden`. Evidence items can also carry gates (auto-grant).
Gates are introspectable: the Studio graph, the validator and the synthetic
GraphStateSolver all walk the same structure.

### B.6 Compiler

`src/server/game/compiler/*` — story Markdown → structured story model;
concept → mechanic mapping; event planner (rounds + curve → node graph with
facts, red herrings, hints, estimated times); "make it harder" structural
transforms; authoring copilot (intent → schema-level patch); publish
validation; synthetic solvers; leak scanner.

### B.7 Isolation

* Synthetic websites are served under `/x/<signed-token>/…` (or a separate
  `SANDBOX_URL` origin) with their own CSP, path-scoped synthetic cookies and a
  service-worker scope limited to the site. They never see real credentials.
* SQL challenges run in a per-team PGlite instance inside a worker thread with
  a hard timeout, read-only transactions and a statement guard.
* Artifacts are generated on demand from the seed and served through signed,
  team-bound URLs.
* On a shared origin, sandbox-site JavaScript can read the app's non-httpOnly
  cookies (only the cosmetic `dossier_boot` flag; session cookies are httpOnly)
  and shares storage quotas with the app. Production deployments should set
  `SANDBOX_URL` to a separate hostname.

### B.8 Studio

`src/server/game/studio.ts` keeps an authoring draft on the event row (meta,
story sources, extracted story, round plan, blueprint, copilot proposal,
last validation, history). Every Studio operation (`/api/studio/[id]`,
`POST { op }`) is a pure transform of that draft followed by a save; publish
validates and writes a new blueprint version. "Play as team" creates or reuses
an organiser-owned `playtest` team: team sessions resolve to the team's own
event, so a playtest team can play an unactivated draft, and playtest teams are
excluded from leaderboards and the Control Room.

### B.9 Control Room

`src/server/game/control-room.ts` derives operations analytics from the same
data that drives play: snapshots (per-node unlock/solve times, hints),
the journal (activity feed, last activity), submissions (failure rates) and
checkpoint scans. Warnings are rules over those numbers (majority stuck beyond
1.5× estimate, attempts without solves, median solve time far above estimate,
critical-path nodes unreached late in the event, pending scan backlog).
