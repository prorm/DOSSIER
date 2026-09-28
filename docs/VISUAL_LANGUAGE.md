# DOSSIER Visual Language & Cyber-Terminal Philosophy

> Design philosophy and visual rationale for the DOSSIER user interface.

---

## 1. Aesthetic Rationale: Why "Cyber Terminal"?

Most competition platforms fall into one of two failure modes:
1. **Generic Gray SaaS**: Bland bootstrap/shadcn default tables that feel like an invoice manager.
2. **Over-decorated Hacker Theater**: Unusable neon overload, blinding green matrix rain behind body copy, slow typewriter animations that waste competitive minutes.

**DOSSIER adopts a third way: The Operative Console.**
It looks and feels like proprietary forensic software used by a modern cyber-defense operations center or field intelligence team:
- Utilitarian high-contrast backgrounds prevent eye strain over 12-hour hackathons.
- Grid boundaries and technical crosshairs communicate architectural precision.
- Interactive components reveal depth only on direct inspection.

---

## 2. Key Visual Pillars

### I. High Information Density with Visual Breathing Room
- We avoid bulky margins on dashboard screens so that 8–12 challenge cards fit in view on a standard 1080p display.
- Every card uses a structured anatomical hierarchy:
  `[Badge / Category] -> [Title & Score] -> [Description Excerpt] -> [Action / State Tag]`.

### II. Functional, Directional Glow
- Glow is strictly an active emitter:
  - Cyan spotlights follow the cursor to show targeted focal points (`SpotlightCard`).
  - Pulsing electric borders isolate quarantined challenges or live first-blood threats (`ElectricBorder`).
  - Terminal scanlines only exist within terminal simulation windows (`FaultyTerminal`, `CRTWarp`).

### III. Micro-Interactions that Confirm Action
- Submitting a flag triggers immediate tactile response:
  - Correct: Crisp green wipe, numeric count roll (`CountUp`), and audio/haptic pulse.
  - Miss: Shake displacement and red status flash with clear cooldown countdown.
- Purchasing a hint flips a split-flap lockup or decrypts in-place rather than reloading the page.

### IV. Cross-Device Integrity
- The entire cyber terminal language survives on a 360px mobile smartphone.
- Bottom action bars replace complex hover states.
- Hover spotlights gracefully degrade to static borders with crisp active taps.
