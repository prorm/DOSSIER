/**
 * A ready-to-compile story for the Studio's "try it with a sample" button.
 *
 * Organisers should be able to see the whole machine — story → world → challenges → playtest →
 * publish — in a couple of minutes without writing a word. This is the same shape a real story
 * takes (headings the importer understands, relationship sentences it can mine), and a complete
 * whodunit whose truth the generated event will be built around.
 */
export const SAMPLE_STORY = {
  name: "midnight-gallery.md",
  markdown: `# The Midnight Gallery

The Aurelian Gallery's prize manuscript vanished during the charity gala. The alarm system logged a
fault at 22:40, the same minute the east wing lights went out. Nobody saw the case open.

## Characters

- **Mira Solberg** — curator. Organised the gala and discovered the empty case.
- **Julian Crane** (suspect) — insurance assessor with a gambling problem. Motive: owed money to a private collector.
- **Priya Nair** (suspect) — night guard who was on shift in the east wing.
- **Oskar Brandt** (suspect) — restorer who argued with Mira about the manuscript's display.
- **Dev Malhotra** — security engineer who installed the alarm system last spring.
- **Ines Ferreira** — private collector who had long wanted the manuscript.

## Background

Mira Solberg hired Oskar Brandt three years ago. Oskar Brandt argued with Mira Solberg about the display case in March.
Julian Crane owed money to Ines Ferreira. Ines Ferreira telephoned Julian Crane twice before the gala.
Priya Nair trusted Dev Malhotra with her key card. Dev Malhotra reported the alarm fault to Priya Nair.
Mira Solberg insured the manuscript through Julian Crane.

## Locations

- **East Wing Vault Room** — where the manuscript was displayed.
- **Sculpture Garden** — outside, by the fountain. (lat 18.5204, lon 73.8567)
- **Security Office** — the camera monitors and the key-card log.
- **Restoration Studio** — Oskar's workshop, cluttered with solvents and tools.

## Timeline

- 21:05 — The gala opens.
- 21:50 — Julian Crane is seen leaving the main hall.
- 22:40 — Alarm fault; east wing lights fail.
- 22:41 — The vault door opens for eleven seconds.
- 23:10 — Mira finds the case empty.
- 23:25 — The police are called.

## Truth

- Culprit: Julian Crane
- Motive: pay off a private collector he owed money to
- Method: used the guard's key card during the lighting fault and swapped the manuscript
- Location: East Wing Vault Room
- Time: 22:41
`,
} as const;
