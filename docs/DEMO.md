# The 90-second demo

One continuous story: **what DOSSIER is → watch it build a game → watch the same game change worlds →
play it → see it run.** Every number on screen in this walkthrough is real (read from the draft, the
build receipt, the team journals). Nothing is mocked.

## Before you present (5 minutes)

1. Fresh data, so the event clock reads "about two and a half hours in":
   `DATABASE_URL=pglite://.data/pglite-exp pnpm demo` (or your demo database).
2. `.env` has `DEV_UI=true` (showcase front door, theme previews, demo traffic) and
   `DEMO_TRAFFIC_SPARE=Null Pointers` (the team you will play as is never touched by demo traffic).
3. Start the server: `DATABASE_URL=pglite://.data/pglite-exp pnpm dev`, and open four browser windows:
   - **A — the front door**, signed out: `http://localhost:3000/`
   - **B — Studio**, signed in as `admin@dossier.local` / `dossier-demo-pass`: `/studio`
   - **C — a team**, a fresh profile (so the opening plays): `/login` as `Null Pointers` / `demo-password`
   - **D — the Control Room**, signed in as staff: `/admin` → **Demo traffic** on. Leave it running; the
     demo teams keep playing the live case through the real engine, and the room labels it.
4. Optional for projectors: `?fx=high` forces the full 3D tier on a laptop GPU.

## The run

| Time | Window | Do | Say |
| --- | --- | --- | --- |
| 0:00 | A | Land on `/`. | "DOSSIER: write the story, it builds the game. That case on the right is live right now, built this way." |
| 0:08 | B | **Create new event** → title → **Create event**. | "An organiser starts from nothing." |
| 0:14 | B | **Try a sample story**. | "A Markdown whodunit. People, places, timeline and the truth are read out of it." |
| 0:22 | B | **World** → **Generate**. The build theatre takes the screen. | "Watch the line: story, world, challenges, logic. Every file is generated per team, in the order it can be solved." |
| 0:34 | B | The theatre lands on **This is the world you just created.** Click **Fly through it** if time allows. | "Twenty-odd files, seven acts, every team gets different facts and different answers. It compiled in milliseconds; we slowed the receipt down to watch it." |
| 0:40 | B | **Dress it** → **Show all four**. | "Same files, same gates, same answers. Navigation, map, type, the board, the opening — all change." |
| 0:56 | B | **Play the opening** (Esc to leave). | "Each world opens the case its own way." |
| 1:00 | C | Sign in as Null Pointers. The opening plays, then the console. | "Now a player. This is CASE 017, live, two and a half hours in." |
| 1:08 | C | **Case file** → open an exhibit. | "Evidence is an object on a table: where it came from, who it concerns, what you've already tied to it." |
| 1:14 | C | **Board** → drag from one pin to another → pick a relation. | "A theory is typed strings. The wall can tell you a pairing makes no sense — never which string is true." |
| 1:22 | D | The Control Room. | "And the organiser sees every team on the same map: where they are, what they're stuck on, every solve as it lands." |
| 1:30 | | | |

## If something misbehaves

* **No 3D?** The flat map is the fallback (reduced motion, no WebGL, `?fx=off`). Everything still works.
* **The theatre feels slow on a weak laptop?** `?replay=2` plays builds twice as fast; **Esc** leaves it.
* **The room is quiet?** Demo traffic only plays open files that need no human (QR checkpoints and the
  board deduction are left alone). Give it a minute, or answer something wrong in window C.
* **Opening doesn't play in C?** It plays once per team per browser: team menu → **Replay the opening**.
