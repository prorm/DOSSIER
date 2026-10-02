# The experience layer

DOSSIER's engine decides what is true: deterministic per-team state, an event-sourced journal, a
challenge graph with gates, a story compiler, a planner. **The experience layer decides how that truth
is shown.** It adds no facts, changes no rule, no score and no answer — and it is built so it *cannot*:

```
GAME STATE (authoritative journal, per team)
      │  server projection — player-safe: what this team is allowed to know
      ▼
UniverseInput ─────────────►  buildUniverse()  ─►  UniverseModel  ─►  R3F scene │ SVG twin │ DOM HUD
(src/server/game/presentation.ts)   (pure, deterministic, tested)
      ▲
      │ cosmetic only
presentationFingerprint = HMAC(ANSWER_SECRET, "pres:event:team")[0..16]   →  teamDressing()
```

| Piece | Where | What it is |
| --- | --- | --- |
| Themes | `src/lib/experience/themes.ts`, `src/app/themes.css` | Four registries of tokens + structure. CSS variables are generated from the TS, so the stylesheet and the 3D scene cannot drift. |
| Universe | `src/lib/experience/universe.ts`, `src/components/experience/universe/*` | The challenge graph as a place. Pure layout + presentation states; WebGL scene; flat SVG twin; keyboard/AT list. |
| Variation | `src/lib/experience/variation.ts` | Per-team dressing: rotation of the layout, callsign, dossier number, exhibit tags, ambient noise. Cosmetic. |
| Opening | `src/lib/experience/cinematic.ts`, `src/components/experience/cinematic/*` | A cinematic as **data**: beats on a timeline that a GSAP player interprets. |
| Rooms | `src/components/experience/stages/*`, `rooms.css` | One workstation per primitive family. The primitive contract is untouched. |
| Board | `src/components/experience/board/*`, `board.css`, `src/lib/experience/board-geometry.ts` | A 2.5D wall: physical exhibits, typed strings, pin-drag tying, measured-footprint geometry, case breaks, the theory desk. |
| Case file | `src/components/experience/case/*`, `case.css`, `exam.css` | The same objects, on a table; one exhibit at a time on the examination table. |
| Studio | `src/components/experience/studio/*`, `src/lib/experience/{pipeline,author,replay}.ts` | The production line, the construction stage, the build receipt, the build theatre and the theme theatre. |
| War Room | `src/components/experience/ops/*`, `src/lib/experience/ops.ts`, `src/server/game/demo-traffic.ts` | The Control Room as an operations center. |
| Front door | `src/components/experience/front/*` | The event's landing; in showcase deployments, what DOSSIER is, proven by the live case. |

## The universe, per theme

* **BLACKSITE — strata.** Acts are layers receding in depth; each layer is named at its corner.
* **NEURAL ARCHIVE — constellations.** Rounds orbit on a golden-angle sphere; act names hang over them in the display serif.
* **COLD CASE — the wall.** Acts are columns of index cards under typed manila header strips (name and real progress).
  Column height is chosen so the wall comes out screen-shaped. Each card carries its file's typed face from a canvas atlas
  (code, title, family, points; redaction bars for classified files — the title is not in the payload — and a CLOSED stamp).
  Strings run pin to pin, heavier for the lead you can pull now. Cards cast shadows on the cork.
* **SIGNAL — the tunnel.** On the console the camera sits *inside* the tunnel just behind the nearest open file, looking
  down it; carrier rings stream past; files shrink away as they pass the lens. The map pulls back to the whole helix.

Overview framing fits the real extents (cards, header strips) to the part of the screen a side panel leaves free.

## Privacy is a property of the projection

`universeView()` returns, for one team: every file's real state, a title **only** where the team may
know it, the requirement lines the engine already shows that team, and only the `gate` / `checkpoint`
edges leading *from* a file the team already knows. Fact-flow between files is the puzzle and is never
drawn. `tests/integration/presentation.test.ts` asserts all of it: no hidden title anywhere in the
payload, no guarded answer material, no fact edges, the same game for two teams with different worlds
to look at. The public front door uses `teaserUniverse()` — silhouettes with no titles, points,
timings or gates.

## Themes

A theme is not a recolour. Each one sets, together:

* **Palette & signals**, type (display / sans / mono), corner language (`--r-ctl/chip/panel`), surface
  (`slab` · `glass` · `paper` · `console`), density and motion (durations, easing, intensity).
* **Navigation** — `rail` (BLACKSITE), `dock` (NEURAL ARCHIVE), `tabs` (COLD CASE), `tuner` (SIGNAL).
* **The universe** — layout (`strata` · `organic` · `wall` · `tunnel`), backdrop, node shape, thread style,
  fog/bloom/grain, camera feel.
* **The board material** (holo · glass · cork · scope), the **opening**, the **sound profile**.

Organisers choose one in Studio (Presentation station); `event.presentation` travels in the blueprint.
For development, `?fx=`/`dossier_theme` (needs `DEV_UI=true`) override it. Staff surfaces always wear
BLACKSITE. To add a theme: add a `ThemeDef`, its `ThemeOpening` in `cinematic.ts`, and a structural
block in `themes.css`; `tests/presentation/themes.test.ts` checks contrast and completeness.

## Motion, performance and accessibility

* `useMotion()` is the single decision point: reduced motion, the player's effects toggle, a WebGL2
  probe, a GPU **tier** (low/mid/high), tab visibility and a **lean** flag (Save-Data or a 2G/3G
  connection: the ~350 KB 3D stack is not fetched unprompted). `?fx=off|low|mid|high` overrides all of it.
* The 3D scene, its post-processing and the opening scene are separate lazy chunks. Measured cold:
  a page without 3D ships ~180–290 KB gz JavaScript; the scene adds ~235 KB, bloom/vignette/grain a
  further ~105 KB only on mid/high tiers.
* The flat SVG twin is always mounted under the canvas and is the rendering for reduced motion, low
  power and WebGL failure. Every file is also a real link in an offscreen list.
* Every cinematic has **Skip**, a **reduced-motion** still card and a **returning-player** fast path.
  Sound is off until the player turns it on.
* Picking is screen-space (no raycasting); labels are DOM, positioned by a rAF loop; instancing keeps
  the node layer to a handful of draw calls.

## Studio: the production line

`STORY → WORLD → CHALLENGES → LOGIC → PRESENTATION → PLAYTEST → PUBLISH`. Every mark on the line is read
from the draft (`derivePipeline`). Generate, validate and publish each leave a **receipt** — a
`BuildTrace` of stages, each *timed where it really ran* and carrying the counts it really produced
(`validateBlueprint` reports its own phases). The construction stage replays a receipt: files come into
being in dependency order while the playhead crosses the stage that created them, stations light in the
order the stages ran, slow stages hold the screen longer (within bounds). Nothing shown has a value the
trace did not contain; a failing stage stops the line red and later stages stay dark.
`?replay=0.25` slows a replay for demos.

## Studio: the build theatre and the theme theatre

When **Generate** returns, the stage takes the screen and replays the build's receipt at a watchable pace (same stages,
same order, same proportions; the measured total is on screen). Stations light as the stages that produced them run, each
stage's caption carries the counts it produced, the draft's real files tick in in the order they can be solved, and the
theatre resolves to **This is the world you just created** with the draft's numbers and the next steps (fly through it,
dress it, prove it). Esc leaves; the receipt stays readable to assistive tech throughout.

The **Presentation** station is a theme theatre: one player console for *this* case — its files as a fresh team first sees
them (`doorsOpen`: entry files open, the next layer in sight, the rest classified), its exhibits and title — re-dressed by
the chosen theme (navigation form, map, type, surfaces, wall material and exhibit skins), with a transition per theme and
a readout of what changed. **Show all four** cycles through them and returns to the chosen one.

## The evidence board

Geometry runs on measured footprints: the wall frames itself on arrival (and through resizes until the player takes the
controls), new exhibits land in free space, string labels sit where they cover no exhibit, and **Tidy** separates overlaps
the least distance that does it, leaving fixed exhibits alone. A board save reports what it opened (never which string was
right); the wall answers with a **case break** naming the files and exhibits. Where an evidence-board deduction is open,
the wall offers **Submit theory**: the same action, through the same dispatch, as the file's own page, and it stamps the
verdict the deduction returned.

## The examination table

`/play/case/evidence/[id]` lays one exhibit on the theme's table as the object it is — a clipped, stamped sheet; a printout
(green-bar paper on COLD CASE, a screen elsewhere); a photograph with writing on its back; a tape with its transcript — next
to its chain-of-custody tag (source file linked when the team knows it), who and where it concerns, and the strings the
team has already tied to it. Below, a contact sheet of everything held.

## War Room

`controlRoom()` now also returns the shape of the case (`graph`), the last hour in five-minute buckets
(`pulse`) and the hint rate; the client draws the same universe lit by teams reached, amber where
teams are stuck, with a pin per team on the file it is working on. Live `activity` signals (answers,
hints) become feed lines and ripples on the file within a moment; the numbers re-read from the server
at most every six seconds. **Wall mode** fills the screen; Esc leaves it. Files with stuck or active teams carry callouts in space ("3 stuck · 5/12
through · now"); solves arrive as a broadcast lower-third.

**Demo traffic** (showcases only: `DEV_UI=true` or `DEMO_TRAFFIC=1`, admin staff) has the demo teams keep playing the live
case through the real engine — intended solutions, the odd wrong guess, a hint — so a projector shows an event that is
actually moving. Every move is a genuine dispatch (journaled, scored, signalled); the room labels it while it runs, it
spares `DEMO_TRAFFIC_SPARE` (the team you present as) and stops itself after 30 minutes. See `docs/DEMO.md`.

## Adding to it

* **A new stage (room):** a component in `stages/`, registered in `stages/index.tsx` by primitive id.
  It receives the `StageContext` the node page builds; its actions go through `useNodeAction`.
* **A new opening beat:** add a `Beat` kind to `cinematic.ts`, teach `opening-player.tsx` to interpret it.
* **A new relation on the board:** add it to `RELATION_STYLE` (colour, dash, arrow, which kinds of
  thing it may join) — the picker, the string renderer and the plausibility check all read it.
