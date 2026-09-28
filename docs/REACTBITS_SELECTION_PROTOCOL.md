# React Bits Selection Protocol & Component Audit

> Technical selection log documenting every React Bits component integrated into **DOSSIER**, evaluating semantic roles, catalog candidates, performance weight, accessibility audits, and mobile fallbacks.

---

## 1. SpotlightCard

- **Semantic Role**: Primary interactive challenge card, evidence card, and suspect dossier card.
- **Intended Visual Behavior**: High-density container casting a subtle radial cursor-following spotlight gradient across its surface on hover.
- **Catalog Candidates Considered**: `SpotlightCard`, `PixelCard`, `DecayCard`, `ReflectiveCard`.
- **Final Choice**: `SpotlightCard`.
- **Why it fits DOSSIER**: Provides an immediate sense of tactile focal depth without distracting from text readability. Gives physical card presence in feature grids and bento boxes.
- **Dependency & Performance**: Pure CSS/DOM calculation based on pointer events; lightweight ($<1\text{ms}$ frame time), zero GPU overhead.
- **Mobile & Reduced-Motion Behavior**:
  - Touch: Degrades to static card with crisp border highlight on active tap.
  - Reduced Motion: Retains static card styling; eliminates spotlight transition.
- **Integration**: Wrapped around shadcn `Card`, `CardHeader`, and `CardContent` with custom DOSSIER badge headers and status footers.

---

## 2. DecryptedText

- **Semantic Role**: Cipher decoding station, classified challenge titles, breach alert announcements.
- **Intended Visual Behavior**: Fast-cycling randomized glyph matrix that progressively locks into plain text character-by-character.
- **Catalog Candidates Considered**: `DecryptedText`, `GlitchText`, `Shuffle`, `ScrambledText`.
- **Final Choice**: `DecryptedText`.
- **Why it fits DOSSIER**: Directly reinforces the intelligence / espionage / cryptanalysis atmosphere when revealing solved challenges or newly unlocked clues.
- **Dependency & Performance**: Vanilla JavaScript interval timer modifying character strings; lightweight.
- **Mobile & Reduced-Motion Behavior**:
  - Touch: Activates on mount or tap.
  - Reduced Motion: Renders text immediately in cleartext without scrambling cycle.
  - Accessibility: Plain text is mirrored in DOM / `aria-label` so screen readers are never presented with shifting ciphertext.
- **Integration**: Placed in `src/components/dossier/challenge-card.tsx` and `src/components/dossier/case-components.tsx`.

---

## 3. CountUp

- **Semantic Role**: Live scoreboards, telemetry metrics, point counter tickers, time counters.
- **Intended Visual Behavior**: High-speed numeric roll with spring-loaded deceleration settling precisely on final point totals.
- **Catalog Candidates Considered**: `CountUp`, `TextPressure`, `SplitFlapText`.
- **Final Choice**: `CountUp`.
- **Why it fits DOSSIER**: Provides immediate satisfaction when points are awarded after solving a flag or verifying a live checkpoint.
- **Dependency & Performance**: Minimal requestAnimationFrame loop. Zero re-render cascades.
- **Mobile & Reduced-Motion Behavior**: Fully responsive; displays static final number when reduced motion is preferred.
- **Integration**: Integrated into HUD score displays (`hud-score.tsx`) and admin dashboard statistics.

---

## 4. ElectricBorder

- **Semantic Role**: Quarantined challenges, first-blood alerts, active live checkpoint perimeter cards.
- **Intended Visual Behavior**: Jittery electric discharge and neon boundary arcs tracing the perimeter of high-priority containers.
- **Catalog Candidates Considered**: `ElectricBorder`, `BorderGlow`, `StarBorder`.
- **Final Choice**: `ElectricBorder`.
- **Why it fits DOSSIER**: Instantly differentiates critical tasks or live threats from standard passive cards.
- **Dependency & Performance**: CSS keyframe stroke-dashoffset animation. Moderate CPU usage; isolated to key high-value cards.
- **Mobile & Reduced-Motion Behavior**: Reverts to a static high-contrast border on mobile battery-saver mode or reduced-motion.
- **Integration**: Wrapped around special-case challenge detail cards and live check-in cards.

---

## 5. FaultyTerminal

- **Semantic Role**: Incident lockscreen, compromised host inspection console, and terminal shell background.
- **Intended Visual Behavior**: Retro green-screen CRT monitor aesthetic with subtle scanlines, dropped sync pulses, and horizontal jitter.
- **Catalog Candidates Considered**: `FaultyTerminal`, `CRTWarp`, `LetterGlitch`, `AcidSquares`.
- **Final Choice**: `FaultyTerminal`.
- **Why it fits DOSSIER**: Perfect backdrop for "out of bounds", "quarantine", or "event paused" states.
- **Dependency & Performance**: Canvas 2D render loop. Throttled to 30fps to avoid taxing participant laptops.
- **Mobile & Reduced-Motion Behavior**: Hidden or disabled on low-power mobile viewports; static scanline texture fallback.
- **Integration**: Used in `/c/[token]` and emergency broadcast display views.

---

## 6. GlitchText

- **Semantic Role**: Malware analysis titles, compromised server headers, anomaly callouts.
- **Intended Visual Behavior**: RGB chromatic aberration split with horizontal displacement slices.
- **Catalog Candidates Considered**: `GlitchText`, `FuzzyText`, `DecryptedText`.
- **Final Choice**: `GlitchText`.
- **Why it fits DOSSIER**: Signals corrupted intelligence data or intercepted adversary comms in Inquest mode.
- **Dependency & Performance**: CSS clip-path keyframe animations; lightweight.
- **Mobile & Reduced-Motion Behavior**: Reverts to crisp monochrome text when reduced motion is active.
- **Integration**: Used on Inquest suspect profile cards and incident timeline headers.

---

## 7. HalftoneReveal

- **Semantic Role**: Unmasking classified evidence photos, surveillance capture inspection.
- **Intended Visual Behavior**: Dot-matrix halftone screen that dissolves into sharp full-color imagery upon inspection.
- **Catalog Candidates Considered**: `HalftoneReveal`, `DitherVeil`, `PixelSwap`.
- **Final Choice**: `HalftoneReveal`.
- **Why it fits DOSSIER**: Evokes vintage newspaper and classified espionage dossiers.
- **Dependency & Performance**: Canvas/CSS SVG filter. Moderate weight; instantiated only on user click.
- **Mobile & Reduced-Motion Behavior**: Touch-tap reveal; static high-contrast image for screen readers.
- **Integration**: Integrated in evidence item detail viewer (`evidence-client.tsx`).

---

## 8. SplitFlapText

- **Semantic Role**: Competition timer countdown, flight-style mission schedules, schedule boards.
- **Intended Visual Behavior**: Mechanical split-flap departure board stepping through numerals with authentic clatter.
- **Catalog Candidates Considered**: `SplitFlapText`, `CountUp`, `TextType`.
- **Final Choice**: `SplitFlapText`.
- **Why it fits DOSSIER**: Gives competition countdowns an authentic tactical command center presence.
- **Dependency & Performance**: CSS 3D perspective transforms; optimized font sizing for mobile viewports ($28\text{px}$ on small screens).
- **Mobile & Reduced-Motion Behavior**: Font scale clamped for 360px widths to prevent layout overflow; instantaneous state changes for reduced motion.
- **Integration**: Highlighted in `/dev/ui` and `/display` live countdown panels.

---

## 9. CodeSlots

- **Semantic Role**: 2FA token station, clearance PIN code entry, live checkpoint verification.
- **Intended Visual Behavior**: Mechanical tumbler slot reels spinning into place as characters are validated.
- **Catalog Candidates Considered**: `CodeSlots`, `TextType`, `CountUp`.
- **Final Choice**: `CodeSlots`.
- **Why it fits DOSSIER**: Turns manual credential entry into an immersive, game-like authorization action.
- **Dependency & Performance**: CSS transform transitions; lightweight.
- **Mobile & Reduced-Motion Behavior**: Native numeric keypad support; instant character lock without reel spin when motion is reduced.
- **Integration**: Used in live checkpoint check-in forms.

---

## 10. LatticeLoader & StatusMark

- **Semantic Role**: Asynchronous tool-call spinners, verification stamps, live checkpoint approvals.
- **Intended Visual Behavior**: Isometric pulse grid calculating background queries; clean circular status verification mark.
- **Catalog Candidates Considered**: `LatticeLoader`, `StatusMark`, `CallChip`.
- **Final Choice**: `LatticeLoader` (async wait states) + `StatusMark` (receipt stamps).
- **Why it fits DOSSIER**: Avoids generic spinning circles; reinforces technical data processing.
- **Dependency & Performance**: Lightweight SVG keyframes.
- **Integration**: Used throughout submission modals and volunteer decision queues.
