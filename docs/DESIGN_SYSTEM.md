# DOSSIER Design System & Technical Tokens

> The official design system and token specification for **DOSSIER**, a cyber-terminal competition and forensic investigation platform for tech fests.

---

## 1. Core Principles

1. **Information-Dense, Technically Crisp**: Built for rapid competitive triage under time pressure. Spacing is comfortable but compact; padding never pushes critical status information offscreen.
2. **Signal Over Decoration**: Glow, color shifts, and micro-motion are functional signifiers—indicating state transitions (unlocked, solved, under attack, first blood), never passive wallpaper.
3. **Physical Tactility**: Cards and interactive elements respond with spring inertia, subtle elevation, and tactile border reactions.
4. **Resilient Under Competition Constraints**: Tested for sub-millisecond layout passes, zero horizontal overflow at 360px mobile width, and strict accessibility fallbacks for screen readers and reduced motion.

---

## 2. Color Palette & Theming (HSL Tailored)

The platform operates in an uncompromising dark terminal mode with high-contrast foregrounds and specialized tactical signals.

### Surface Tones
- **Canvas Base (`--background`)**: `hsl(224, 71%, 4%)` (`#030712` deep space terminal black)
- **Card Surface (`--card`)**: `hsl(222, 47%, 7%)` (subtle dark slate backing)
- **Elevated Modals / Popovers (`--popover`)**: `hsl(222, 47%, 9%)` (elevated surface)
- **Muted Backing (`--muted`)**: `hsl(217, 33%, 17%)` (secondary containers, table stripes)

### Technical Accent Signals
- **Terminal Phosphor Green (`--terminal-green`)**: `hsl(142, 76%, 45%)` / `#22c55e` (Solved, Verified, Success, First Blood bonus)
- **Cyan Intercept (`--terminal-cyan`)**: `hsl(187, 92%, 49%)` / `#06b6d4` (Active selections, cursor tracks, decrypted text)
- **Amber Warning (`--terminal-amber`)**: `hsl(38, 92%, 50%)` / `#f59e0b` (Hints, pending checkpoints, cooldown backoff)
- **Red Alert (`--terminal-red`)**: `hsl(0, 84%, 60%)` / `#ef4444` (Incorrect answers, penalties, compromised hosts, disqualification)
- **Electric Violet (`--terminal-purple`)**: `hsl(263, 70%, 50%)` / `#8b5cf6` (Forensic evidence, confidential dossier files)

### Borders & Dividing Grids
- **Technical Border (`--border`)**: `hsl(217, 33%, 20%)` (1px crisp dividers)
- **Active Focus Ring (`--ring`)**: `hsl(187, 92%, 49%)` (high-visibility cyan focus indicator)

---

## 3. Typography Hierarchy

The type system pairs a razor-sharp monospace face for data, telemetry, codes, and ciphers with a clean modern sans-serif for long-form narrative.

| Role | Font Family | Size | Weight | Tracking | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Headline Display** | JetBrains Mono / Space Mono | 24px–32px | 700 Bold | `tracking-tight` | Screen titles, H1 banners, hero callouts |
| **Subheader / Section** | Inter / Roboto | 16px–20px | 600 SemiBold | `tracking-normal` | Category strips, card headers |
| **Body Copy** | Inter / System Sans | 14px | 400 Regular | `tracking-normal` | Challenge descriptions, briefing narrative |
| **Data / Telemetry** | JetBrains Mono / Monospace | 12px–13px | 500 Medium | `tracking-wide` | Flag inputs, score counts, timestamps, hashes |
| **Micro Labels** | JetBrains Mono / Monospace | 10px–11px | 600 Bold | `tracking-wider` (uppercase) | Status tags, clearance levels, mode badges |

---

## 4. Depth & Elevation

- **Level 0 (Flat Ground)**: Base layout canvases, background grid matrices.
- **Level 1 (Subtle 2.5D)**: Interactive challenge cards (`SpotlightCard`), evidence summaries, table rows with `border border-border/80`.
- **Level 2 (Active Focus)**: Hovered cards with cursor spotlight projection, active modals, command palettes with backdrop glassmorphism (`backdrop-blur-md bg-card/90`).
- **Level 3 (Overlay & Tooltips)**: Fullscreen image inspectors, floating evidence board sticky notes, QR scanner viewports.

---

## 5. Motion Budget & Performance Constraints

- **Frame Budget**: 60fps on desktop and modern mobile devices; no continuous canvas redraw unless in dedicated visualizers.
- **Hover Micro-Animations**: $\le 150\text{ms}$ duration with `ease-out` timing curves.
- **Card Expansion / Modal Entrance**: $200\text{ms}$ spring dynamics with critical damping ($\zeta \approx 0.85$) to prevent disorienting bounce during speed-solving.
- **Reduced Motion**: All animations strictly check `@media (prefers-reduced-motion: reduce)`. Decorative particle fields degrade to static geometric grids; text reveals settle instantly.
