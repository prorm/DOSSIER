# DOSSIER UI Composition Recipes

> Reusable component composition recipes for DOSSIER surfaces, establishing consistent layouts, micro-interactions, and state transitions.

---

## 1. App Shell
- **Structure**: Sticky technical header + responsive navigation dock/tabs + main workspace container + live toast provider.
- **Tokens**: `border-b border-border/80 bg-background/95 backdrop-blur-md`.
- **Key Elements**: Active event title with `DecryptedText`, team status badge, live points counter (`CountUp`), command palette trigger (`Cmd+K`).
- **File Reference**: `src/components/dossier/play-shell.tsx`.

---

## 2. Command Palette (Cmd+K)
- **Structure**: Modal overlay with dark backdrop blur, search input with instant fuzzy filtering, grouped results (`Challenges`, `Evidence`, `Navigation`, `Actions`).
- **Tokens**: `border-border/90 bg-card/95 backdrop-blur-lg shadow-2xl`.
- **Key Elements**: Keyboard navigation with Tab/Arrow keys, score shortcut indicators, instant jump to challenge details.
- **File Reference**: `src/components/dossier/command-palette.tsx`.

---

## 3. Challenge Card
- **Structure**: `SpotlightCard` container with category badge, challenge title, dynamic point tag, solver count, and status footer.
- **States**: `unlocked` (cyan border on hover), `solved` (phosphor green border + checkmark), `locked` (muted opacity + padlock icon), `scheduled` (countdown timer).
- **File Reference**: `src/components/dossier/challenge-card.tsx`.

---

## 4. Challenge Detail & Answer Submission
- **Structure**: 2-column or stacked modal layout: Left pane for challenge briefing markdown and asset downloads; right pane for hint purchases, rate-limit warnings, and submission form.
- **Interaction**: Input field with uppercase flag auto-formatting, submit button with loading state (`LatticeLoader`), error shake feedback with exponential cooldown countdown timer.
- **File Reference**: `src/components/dossier/answer-form.tsx`.

---

## 5. Solved / Locked Card
- **Structure**: Compact visual indicator. When solved: shows solve timestamp, solver rank (e.g. `First Blood 🩸`), and points earned. When locked: shows list of prerequisite challenges required to open.
- **Tokens**: Solved: `border-emerald-500/40 bg-emerald-950/10`. Locked: `border-border/40 bg-muted/20 opacity-60`.

---

## 6. Score Display (HUD)
- **Structure**: Fixed or header-anchored HUD pill containing current rank, total points, and live point delta popups (`+100 pts`).
- **Interaction**: Points animate with `CountUp` component on each verified solve.
- **File Reference**: `src/components/dossier/hud-score.tsx`.

---

## 7. Hint Purchase Panel
- **Structure**: Collapsible accordion item displaying hint tier, cost in points, confirmation modal (`Are you sure? This will deduct X points from your score`), and revealed hint content with copy-to-clipboard.
- **File Reference**: `src/components/dossier/hint-panel.tsx`.

---

## 8. Hunt Progress Node
- **Structure**: Node-graph representation of Treasure Hunt mode: circular or hexagonal node with connecting SVG lines indicating unlock paths (`all-of` or `any-of` dependencies).
- **States**: Active (pulsing ring), Completed (solid green dot), Locked (gray dashed outline).
- **File Reference**: `src/components/dossier/hunt-map.tsx`.

---

## 9. CTF Category Strip
- **Structure**: Horizontal scrollable pill list of categories (`Crypto`, `Web`, `Forensics`, `Reverse`, `Pwn`, `OSINT`) with challenge count chips and category-level solve completion percentages.
- **Tokens**: Active category: `bg-primary text-primary-foreground font-mono`.

---

## 10. Evidence Card & Detail Viewer
- **Structure**: Classified dossier card with file number (`EVID-04`), evidence type (`Audio`, `Document`, `Photo`, `CCTV`), thumbnail/waveform preview, and chain-of-custody metadata.
- **Interaction**: Click opens full-screen evidence viewer with `HalftoneReveal` inspection.
- **File Reference**: `src/components/dossier/case-components.tsx`, `evidence-client.tsx`.

---

## 11. Evidence Reveal Pipeline
- **Structure**: Auto-updating notification and case file banner indicating newly decrypted or scheduled evidence unlocked based on challenge solves or event elapsed time.

---

## 12. Suspect Dossier
- **Structure**: Personnel profile file with suspect mugshot, alias, known affiliations, motive notes, alibi breakdown, and direct link to pin to the evidence board.
- **File Reference**: `src/components/dossier/case-components.tsx`.

---

## 13. Case Timeline
- **Structure**: Chronological vertical axis connecting incident events with timestamps, evidence citations, and verified alibis.

---

## 14. Evidence Board (Interactive Canvas)
- **Structure**: Virtual corkboard with pannable and zoomable grid, draggable evidence cards, suspect profiles, sticky notes, and red string connection threads between related items.
- **Persistence**: Team-private layout saved automatically to the database on drag/link operations.
- **File Reference**: `src/components/dossier/evidence-board.tsx`.

---

## 15. Checkpoint Status & QR Scanner
- **Structure**: Mobile-first live checkpoint view: displays team single-use QR badge, camera scanner for physical checkpoint signs, and approval queue status.
- **Tokens**: `border-cyan-500/50 bg-card p-4 rounded-lg`.
- **File Reference**: `src/components/dossier/live-client.tsx`.

---

## 16. Leaderboard Row
- **Structure**: High-density table row with Rank (#1–#100), Team Name, Affiliation, Score, Last Solve Timestamp, and Solved Challenge Heatmap dots.
- **Interaction**: Gold/Silver/Bronze highlights for podium teams; `First Blood` badges.
- **File Reference**: `src/components/dossier/leaderboard-view.tsx`.

---

## 17. Announcement Toast
- **Structure**: Real-time push banner dropping from top-center using `SwipeToast` for event-wide announcements, hint broadcasts, and first-blood alerts.
- **File Reference**: `src/components/dossier/announcement-toaster.tsx`.

---

## 18. Admin Stat Card
- **Structure**: High-level metric container with title, big-digit value, delta sparkline, and sub-label (e.g. `Active Teams: 48`, `Submissions / min: 142`, `Accuracy: 64%`).
- **File Reference**: `src/components/dossier/admin-misc.tsx`.

---

## 19. Big-Screen Leaderboard (/display)
- **Structure**: Optimized for 4K and 1080p projectors without scrolling: displays podium leaderboard, rotating marquee announcements, and live event countdown with `SplitFlapText`.
- **File Reference**: `src/components/dossier/display-client.tsx`.

---

## 20. Accusation Submission Flow
- **Structure**: High-stakes forensic verdict interface where players select the culprit (`Who`), motive (`Why`), and key evidence (`How`), featuring confirmation guards and escalating penalty warnings.
- **File Reference**: `src/app/play/inquest/accuse/page.tsx`.
