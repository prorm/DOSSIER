# DOSSIER UI Review & Visual QA Checklist

> Pre-release visual quality assurance rubric for auditing DOSSIER surfaces on desktop, tablet, and mobile viewports.

---

## 1. Cohesion & Brand Identity
- [ ] **Unified Cyber Terminal Language**: Does every screen feel like it belongs to the same military/forensic intelligence suite rather than disparate component demos?
- [ ] **Palette Consistency**: Are status colors used strictly for semantic communication (Green = solved/verified, Cyan = active/interactive, Amber = hint/warning, Red = incorrect/alert)?
- [ ] **No Default UI Artifacts**: Are default unstyled Tailwind or shadcn controls (e.g. rounded generic white dropdowns) completely eliminated in favor of technical borders and dark palettes?

---

## 2. Layout & Responsive Integrity (Desktop & 360px Mobile)
- [ ] **Zero Horizontal Blowout**: Does `document.documentElement.scrollWidth === document.documentElement.clientWidth` hold true across all surfaces at 360px width?
- [ ] **Grid Child Minimum Width**: Do all multi-column CSS grids specify `[&>*]:min-w-0` to prevent preformatted code blocks or long flag previews from expanding parent columns?
- [ ] **Touch Target Ergonomics**: Are all interactive triggers (buttons, tabs, inputs, accordion headers) at least $44\times44\text{px}$ in touch area on mobile screens?
- [ ] **Sticky Mobile Nav**: Does mobile navigation remain accessible without consuming more than 15% of vertical viewport height?

---

## 3. Motion & Performance
- [ ] **Frame Budget**: Does the surface maintain 60fps during scroll, card hover, and modal transitions?
- [ ] **Immediate State Feedback**: Does answer submission give immediate visual feedback within $\le 50\text{ms}$ (loading state, disabled button)?
- [ ] **No Blocking Animations**: Are players able to immediately dismiss modals, type answers, and navigate without waiting for decorative intro sequences?
- [ ] **Reduced Motion Support**: When `@media (prefers-reduced-motion: reduce)` is enabled, do all cycling ciphers, particle fields, and hover spotlights instantly settle into static, accessible layouts?

---

## 4. Accessibility & Legibility
- [ ] **Contrast Compliance**: Does all text meet WCAG 2.1 AA standards ($\ge 4.5:1$ for normal text, $\ge 3:1$ for large text and technical indicators)?
- [ ] **Focus Rings**: Is keyboard focus clearly visible using high-contrast cyan outlines (`focus-visible:ring-2 focus-visible:ring-cyan-500`)?
- [ ] **Screen Reader Parity**: Are decorative text effects (e.g. `DecryptedText`, `GlitchText`, `SplitFlapText`) backed by plain-text DOM elements or `aria-label` tags?
- [ ] **Error Clarity**: Do rate-limit messages clearly display remaining cooldown seconds rather than generic failure notices?

---

## 5. Game State Coverage
- [ ] **Unopened / Scheduled State**: Displays clear opening timestamp or countdown.
- [ ] **Locked State**: Explains exact prerequisite dependencies required to unlock.
- [ ] **Active / In-Progress State**: Primary action button is prominent and clear.
- [ ] **Solved State**: Shows verified checkmark, solver rank, and points earned.
- [ ] **Frozen Leaderboard State**: Clear banner informing players that public scores are frozen for the final competition stretch.
