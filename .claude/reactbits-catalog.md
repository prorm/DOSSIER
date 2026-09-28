# React Bits Design & Visual Catalog

> Structured UI/UX composition catalog for Claude Code. Maps React Bits components to visual properties, motion dynamics, interaction models, performance footprints, DOSSIER roles, cyber-terminal compatibility, and composition anti-patterns.

### CLI Installation Conventions
- **shadcn:** `npx shadcn@latest add https://reactbits.dev/r/<ComponentKey>-TS-TW` (replace `TS`/`TW` with `JS`/`CSS` if needed)
- **jsrepo:** `npx jsrepo@latest add https://reactbits.dev/r/<ComponentKey>-TS-TW`

---

## Text Animations (33)

```yaml
ASCIIText:
  visual:
    form: display-text
    effect: animated ascii background matrix behind letterforms
    depth: flat
    texture: ascii
    glow: low
    visual_intensity: 4/5

  motion:
    character: retro-computational
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - terminal-hero-header
    - breach-banner
    - classified-title

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

BlurText:
  visual:
    form: headline-text
    effect: text starts blurred then crisply resolves for a soft-focus
    depth: flat
    texture: glass
    glow: low
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: mount-or-hover
    persistence: trigger-once

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

CircularText:
  visual:
    form: headline-text
    effect: layouts characters around a circle with optional rotation
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

CountUp:
  visual:
    form: counter
    effect: animated tabular numeric counter with decimal precision
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 1/5

  motion:
    character: spring
    trigger: mount
    persistence: trigger-once

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - telemetry-metric-strip
    - threat-level-indicator
    - intercept-counter

  theme_fit:
    cyber_terminal: high

  avoid:
    - frequently-updating-streams
    - unformatted-currency
    - static-labels

CurvedLoop:
  visual:
    form: marquee-text
    effect: flowing looping text path along a customizable curve with
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: drag
    persistence: loop

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: moderate

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

DecryptedText:
  visual:
    form: scramble-text
    effect: cycling glyph decryption matrix resolving to cleartext
    depth: flat
    texture: ascii
    glow: medium
    visual_intensity: 3/5

  motion:
    character: retro-computational
    trigger: mount-or-hover
    persistence: trigger-once

  interaction:
    pointer: moderate
    touch: degrade-to-tap
    keyboard: accessible

  performance:
    weight: light

  placement:
    - cipher-decoder-station
    - classified-title
    - breach-alert-headline

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - long-form-body-copy
    - frequent-re-renders

DepthText:
  visual:
    form: typewriter
    effect: layered extruded type with parallax that shifts against the
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: retro-computational
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-tap
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

EchoText:
  visual:
    form: headline-text
    effect: ghosted copies trail behind the text and settle into a single
    depth: layered-parallax
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: mount
    persistence: trigger-once

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

FallingText:
  visual:
    form: headline-text
    effect: characters fall with gravity + bounce creating a playful entrance
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: spring
    trigger: mount
    persistence: trigger-once

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: low

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

FoldText:
  visual:
    form: headline-text
    effect: lines unfold into place like creased paper opening flat
    depth: subtle-2.5d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: mount
    persistence: trigger-once

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

FuzzyText:
  visual:
    form: headline-text
    effect: vibrating fuzzy text with controllable hover intensity
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: strong
    touch: degrade-to-tap
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

GlitchText:
  visual:
    form: headline-text
    effect: rgb channel split with horizontal jitter and displacement slices
    depth: flat
    texture: clean
    glow: neon
    visual_intensity: 4/5

  motion:
    character: glitchy
    trigger: continuous
    persistence: loop

  interaction:
    pointer: light
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - compromised-host-header
    - malware-analysis-title
    - breach-banner

  theme_fit:
    cyber_terminal: high

  avoid:
    - long-form-body-copy
    - dense-data-table
    - accessible-form-labels

GradientText:
  visual:
    form: headline-text
    effect: animated gradient sweep across live text with speed and color
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

MaskedHeading:
  visual:
    form: headline-text
    effect: a large headline with a drifting colour mesh or image showing
    depth: flat
    texture: mesh
    glow: none
    visual_intensity: 3/5

  motion:
    character: continuous
    trigger: mount
    persistence: trigger-once

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

ParticleText:
  visual:
    form: display-text
    effect: text assembles from drifting particles that scatter and
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 4/5

  motion:
    character: continuous
    trigger: mount
    persistence: trigger-once

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

RotatingText:
  visual:
    form: headline-text
    effect: cycles through multiple phrases with 3d rotate / flip transitions
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

ScrambledText:
  visual:
    form: scramble-text
    effect: detects cursor position and applies a distortion effect to text
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - terminal-hero-header
    - cipher-decoder-station
    - classified-title

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

ScrollFloat:
  visual:
    form: headline-text
    effect: text gently floats / parallax shifts on scroll
    depth: layered-parallax
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: scroll
    persistence: hover-only

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

ScrollReveal:
  visual:
    form: headline-text
    effect: text gently unblurs and reveals on scroll
    depth: flat
    texture: glass
    glow: low
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: scroll
    persistence: trigger-once

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

ScrollVelocity:
  visual:
    form: marquee-text
    effect: text marquee animatio - speed and distortion scale with users
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: scroll
    persistence: loop

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

ShinyText:
  visual:
    form: headline-text
    effect: metallic sheen sweeps across text producing a reflective
    depth: flat
    texture: metallic
    glow: medium
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: mount
    persistence: trigger-once

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

Shuffle:
  visual:
    form: scramble-text
    effect: animated text reveal where characters shuffle before settling
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: mount-or-hover
    persistence: trigger-once

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

SplitFlapText:
  visual:
    form: scramble-text
    effect: mechanical split-flap departure board that clacks through to
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: retro-computational
    trigger: mount-or-hover
    persistence: hover-only

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

SplitText:
  visual:
    form: headline-text
    effect: splits text into characters / words for staggered entrance
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: mount
    persistence: trigger-once

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

StrokeText:
  visual:
    form: vector-text
    effect: outlined letterforms draw themselves on, then flood with fill
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: mount
    persistence: trigger-once

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

TechText:
  visual:
    form: vector-text
    effect: a wordmark whose letters turn into dashed vector paths under
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: spring
    trigger: drag
    persistence: drag-settle

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: moderate

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

TextCursor:
  visual:
    form: headline-text
    effect: make any text element follow your cursor, leaving a trail of
    depth: layered-parallax
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

TextLoop:
  visual:
    form: marquee-text
    effect: a seamless text marquee that flows along curved svg paths
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

TextPressure:
  visual:
    form: display-text
    effect: characters scale / warp interactively based on pointer
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 4/5

  motion:
    character: smooth
    trigger: click
    persistence: trigger-once

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

TextType:
  visual:
    form: typewriter
    effect: typewriter effect with blinking cursor and adjustable typing
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: retro-computational
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

TrueFocus:
  visual:
    form: headline-text
    effect: applies dynamic blur / clarity based over a series of words
    depth: flat
    texture: glass
    glow: low
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: mount-or-hover
    persistence: hover-only

  interaction:
    pointer: none
    touch: supported
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

VariableProximity:
  visual:
    form: display-text
    effect: letter styling changes continuously with pointer distance mapping
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: pointer
    persistence: loop

  interaction:
    pointer: strong
    touch: degrade-to-tap
    keyboard: accessible

  performance:
    weight: light

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list

WarpText:
  visual:
    form: headline-text
    effect: webgl warp that bends and refracts the text around the pointer
    depth: deep-3d
    texture: glass
    glow: none
    visual_intensity: 4/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-tap
    keyboard: accessible

  performance:
    weight: heavy

  placement:
    - mission-briefing-hero
    - dossier-title
    - case-file-header

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - long-form-body-copy
    - small-mobile-list
```

## Animations (40)

```yaml
AnimatedContent:
  visual:
    form: motion-wrapper
    effect: wrapper that animates any children on scroll or mount with
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: scroll
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

Antigravity:
  visual:
    form: cursor-tracker
    effect: 3d antigravity particle field that repels from the cursor
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 4/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: moderate

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

BlobCursor:
  visual:
    form: cursor-tracker
    effect: organic blob cursor that smoothly follows the pointer with
    depth: flat
    texture: liquid
    glow: none
    visual_intensity: 2/5

  motion:
    character: spring
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: moderate

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

ClickSpark:
  visual:
    form: particle-field
    effect: particle spark bursts at click position
    depth: flat
    texture: electric
    glow: high
    visual_intensity: 4/5

  motion:
    character: explosive
    trigger: click
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

Crosshair:
  visual:
    form: cursor-tracker
    effect: targeting reticle with link snapping and coordinate locks
    depth: flat
    texture: clean
    glow: neon
    visual_intensity: 3/5

  motion:
    character: snappy
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: high

  avoid:
    - stacking with multiple cursor effects
    - small-mobile-list
    - text-heavy-documentation

Cubes:
  visual:
    form: motion-wrapper
    effect: 3d rotating cube cluster
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

CursorGrid:
  visual:
    form: cursor-tracker
    effect: canvas grid whose cells light up around the cursor with
    depth: flat
    texture: mesh
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: click
    persistence: trigger-once

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

DitherVeil:
  visual:
    form: filter-overlay
    effect: 1-bit dither print burned away by cursor to reveal color image
    depth: flat
    texture: grain
    glow: low
    visual_intensity: 4/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - classified-redaction-reveal
    - evidence-unmask-view
    - target-photo-inspect

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - stacking with multiple cursor effects

ElasticMesh:
  visual:
    form: mesh-surface
    effect: spring-mesh surface that stretches under the pointer and
    depth: flat
    texture: mesh
    glow: none
    visual_intensity: 3/5

  motion:
    character: spring
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

ElectricBorder:
  visual:
    form: border-fx
    effect: jittery electric energy border with animated edge arcs
    depth: subtle-2.5d
    texture: electric
    glow: neon
    visual_intensity: 4/5

  motion:
    character: glitchy
    trigger: continuous
    persistence: loop

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - challenge-card-border
    - classified-badge
    - quarantine-container

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - multi-instance-in-virtual-list
    - low-contrast-backgrounds

ElectricLogo:
  visual:
    form: cursor-tracker
    effect: turns any svg or png into a living lightning outline, with
    depth: flat
    texture: electric
    glow: neon
    visual_intensity: 4/5

  motion:
    character: glitchy
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

FadeContent:
  visual:
    form: motion-wrapper
    effect: simple directional fade / slide entrance / exit wrapper with
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 1/5

  motion:
    character: smooth
    trigger: mount
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

GhostCursor:
  visual:
    form: cursor-tracker
    effect: semi-transparent ghost cursor that smoothly follows the real
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

GlareHover:
  visual:
    form: motion-wrapper
    effect: a realistic moving glare highlight on hover over any element
    depth: subtle-2.5d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

GlowCursor:
  visual:
    form: cursor-tracker
    effect: shader-powered light trail that smoothly follows the pointer
    depth: flat
    texture: clean
    glow: medium
    visual_intensity: 5/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

GradualBlur:
  visual:
    form: filter-overlay
    effect: progressively un-blurs content based on scroll or trigger
    depth: flat
    texture: glass
    glow: low
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: scroll
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

HalftoneReveal:
  visual:
    form: cursor-tracker
    effect: print-style halftone dot matrix that resolves into sharp
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 3/5

  motion:
    character: retro-computational
    trigger: pointer
    persistence: trigger-once

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

ImageTrail:
  visual:
    form: cursor-tracker
    effect: cursor-based image trail with several built-in variants
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

LaserFlow:
  visual:
    form: mesh-surface
    effect: dynamic flowing laser light beam scanning across surface
    depth: subtle-2.5d
    texture: electric
    glow: neon
    visual_intensity: 4/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: moderate
    touch: supported
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - quarantine-perimeter
    - laser-tripwire-display
    - breach-alert-boundary

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

LogoLoop:
  visual:
    form: motion-wrapper
    effect: continuously looping marquee of brand or tech logos with
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

MagicRings:
  visual:
    form: motion-wrapper
    effect: interactive magic rings effect with customizable parameters
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

Magnet:
  visual:
    form: cursor-tracker
    effect: elements magnetically ease toward the cursor then settle back
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: spring
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: moderate

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

MagnetLines:
  visual:
    form: cursor-tracker
    effect: animated field lines bend toward the cursor
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

MetaBalls:
  visual:
    form: motion-wrapper
    effect: liquid metaball blobs that merge and separate with smooth
    depth: flat
    texture: liquid
    glow: none
    visual_intensity: 4/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

MetallicPaint:
  visual:
    form: motion-wrapper
    effect: liquid metallic paint shader which can be applied to svg elements
    depth: flat
    texture: liquid
    glow: none
    visual_intensity: 4/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: heavy

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

Noise:
  visual:
    form: filter-overlay
    effect: animated film grain / noise overlay adding subtle texture and
    depth: flat
    texture: grain
    glow: low
    visual_intensity: 2/5

  motion:
    character: subtle
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

OrbitImages:
  visual:
    form: motion-wrapper
    effect: svg path customizable orbiting images effect
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

PixelSwap:
  visual:
    form: filter-overlay
    effect: pixel fragments assemble into a full cover, swap arbitrary
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: pointer
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

PixelTrail:
  visual:
    form: cursor-tracker
    effect: pixelated cursor trail emitting fading squares with retro
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 3/5

  motion:
    character: retro-computational
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

PixelTransition:
  visual:
    form: filter-overlay
    effect: pixel dissolve transition for content reveal on hover
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: pointer
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

Ribbons:
  visual:
    form: cursor-tracker
    effect: flowing responsive ribbons/cursor trail driven by physics and
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: moderate

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

RippleDistortion:
  visual:
    form: motion-wrapper
    effect: pointer-driven water displacement that warps content and
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 4/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

ScrollExpand:
  visual:
    form: motion-wrapper
    effect: a rounded media frame that grows to full bleed as it scrolls
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: scroll
    persistence: hover-only

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

ShapeBlur:
  visual:
    form: filter-overlay
    effect: morphing blurred geometric shape. the effect occurs on hover
    depth: flat
    texture: glass
    glow: low
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

SplashCursor:
  visual:
    form: cursor-tracker
    effect: liquid splash burst at cursor with curling ripples and waves
    depth: flat
    texture: liquid
    glow: high
    visual_intensity: 4/5

  motion:
    character: continuous
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

StarBorder:
  visual:
    form: border-fx
    effect: animated star / sparkle border orbiting content with twinkle
    depth: deep-3d
    texture: electric
    glow: medium
    visual_intensity: 3/5

  motion:
    character: explosive
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card-border
    - classified-badge
    - quarantine-container

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

StickerPeel:
  visual:
    form: motion-wrapper
    effect: sticker corner lift + peel interaction using 3d transform and
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

Strands:
  visual:
    form: particle-field
    effect: glowing ribbon-like strands that ripple and weave across a
    depth: flat
    texture: clean
    glow: medium
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: heavy

  placement:
    - interactive-intel-sandbox
    - recon-canvas-underlay
    - operator-hero-canvas

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

SwarmCursor:
  visual:
    form: cursor-tracker
    effect: flocking particle swarm that chases the pointer, jostles for
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 4/5

  motion:
    character: continuous
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

TargetCursor:
  visual:
    form: cursor-tracker
    effect: a cursor follow animation with 4 corners that lock onto targets
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - target-tracker
    - recon-viewer
    - dossier-cursor

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects
```

## Components (46)

```yaml
AccordionGallery:
  visual:
    form: card-stack
    effect: panels expand on hover or focus, revealing parallax imagery
    depth: layered-parallax
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

AnimatedList:
  visual:
    form: component-surface
    effect: list items enter with staggered motion variants for polished
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

BorderGlow:
  visual:
    form: component-surface
    effect: glowing mesh-gradient border that follows cursor direction
    depth: subtle-2.5d
    texture: mesh
    glow: medium
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

BounceCards:
  visual:
    form: card
    effect: cards bounce that bounce in on mount
    depth: subtle-2.5d
    texture: clean
    glow: none
    visual_intensity: 3/5

  motion:
    character: spring
    trigger: mount
    persistence: trigger-once

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: low

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

BubbleMenu:
  visual:
    form: navigation-menu
    effect: floating circular expanding menu with staggered item reveal
    depth: layered-parallax
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - operator-dock
    - tool-switcher
    - quick-action-bar

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

CardNav:
  visual:
    form: card
    effect: expandable navigation bar with card panels revealing nested links
    depth: subtle-2.5d
    texture: clean
    glow: none
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: pointer
    persistence: trigger-once

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: supported

  performance:
    weight: light

  placement:
    - operator-dock
    - tool-switcher
    - quick-action-bar

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

CardSwap:
  visual:
    form: card
    effect: cards animate position swapping with smooth layout transitions
    depth: subtle-2.5d
    texture: clean
    glow: none
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

Carousel:
  visual:
    form: card-stack
    effect: responsive carousel with touch gestures, looping and transitions
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

ChromaGrid:
  visual:
    form: component-surface
    effect: a responsive grid of grayscale tiles
    depth: flat
    texture: mesh
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

CircularGallery:
  visual:
    form: card-stack
    effect: circular orbit gallery rotating images
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

Counter:
  visual:
    form: interactive-widget
    effect: flexible animated counter supporting increments + easing
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 1/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

CurvedInput:
  visual:
    form: interactive-widget
    effect: arc-bent input bar with text, caret and submit button all
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: snappy
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

DecayCard:
  visual:
    form: card
    effect: canvas decay erosion dissolving to reveal inner content
    depth: subtle-2.5d
    texture: grain
    glow: low
    visual_intensity: 4/5

  motion:
    character: smooth
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - cold-case-file
    - corrupted-evidence-card
    - declassified-briefing

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

DepthCarousel:
  visual:
    form: card
    effect: cards recede into depth on a 3d rail, with drag, keyboard and
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: drag
    persistence: drag-settle

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

Dock:
  visual:
    form: dock
    effect: magnification icon dock with spring inertia
    depth: subtle-2.5d
    texture: glass
    glow: low
    visual_intensity: 2/5

  motion:
    character: spring
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - operator-dock
    - tool-switcher
    - quick-action-bar

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - small-mobile-list
    - nested-menus

DomeGallery:
  visual:
    form: card-stack
    effect: immersive 3d dome gallery projecting images on a hemispheric
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

DriftWall:
  visual:
    form: component-surface
    effect: an endless perspective wall of tiles drifting past, lifting
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

ElasticSlider:
  visual:
    form: card-stack
    effect: slider handle stretches elastically then snaps with spring
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: spring
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

FlexCarousel:
  visual:
    form: card-stack
    effect: an infinite image row that flows through invisible liquid
    depth: flat
    texture: glass
    glow: low
    visual_intensity: 4/5

  motion:
    character: continuous
    trigger: click
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

FlowingMenu:
  visual:
    form: navigation-menu
    effect: liquid flowing active indicator glides between menu items
    depth: flat
    texture: liquid
    glow: none
    visual_intensity: 4/5

  motion:
    character: continuous
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - operator-dock
    - tool-switcher
    - quick-action-bar

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

FluidGlass:
  visual:
    form: component-surface
    effect: glassmorphism container with animated liquid distortion
    depth: flat
    texture: glass
    glow: low
    visual_intensity: 4/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

FlyingPosters:
  visual:
    form: component-surface
    effect: 3d posters rotate on scroll infinitely
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: scroll
    persistence: hover-only

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

Folder:
  visual:
    form: component-surface
    effect: interactive folder opens to reveal nested content smooth motion
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

GlassIcons:
  visual:
    form: component-surface
    effect: icon set styled with frosted glass blur
    depth: flat
    texture: glass
    glow: low
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

GlassSurface:
  visual:
    form: component-surface
    effect: advanced apple-style glass surface with real-time distortion
    depth: flat
    texture: glass
    glow: low
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

GooeyNav:
  visual:
    form: navigation-menu
    effect: navigation indicator morphs with gooey blob transitions
    depth: flat
    texture: liquid
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - operator-dock
    - tool-switcher
    - quick-action-bar

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

InfiniteMenu:
  visual:
    form: navigation-menu
    effect: horizontally looping menu effect that scrolls endlessly with
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: scroll
    persistence: loop

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - operator-dock
    - tool-switcher
    - quick-action-bar

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

InfiniteSpiral:
  visual:
    form: component-surface
    effect: an endlessly looping 3d helix of images with customizable
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

Lanyard:
  visual:
    form: card
    effect: swinging 3d lanyard / badge card with realistic inertial motion
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

LineSidebar:
  visual:
    form: navigation-menu
    effect: static list navigation with a cursor-proximity effect that
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: subtle
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - operator-dock
    - tool-switcher
    - quick-action-bar

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

MagicBento:
  visual:
    form: bento-grid
    effect: multi-tile responsive bento grid with hover illumination
    depth: subtle-2.5d
    texture: clean
    glow: low
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: supported

  performance:
    weight: light

  placement:
    - recon-bento-grid
    - intel-dashboard
    - target-overview

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

Masonry:
  visual:
    form: component-surface
    effect: responsive masonry layout with animated reflow + gaps
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

ModelViewer:
  visual:
    form: component-surface
    effect: three.js model viewer with orbit controls and lighting presets
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: heavy

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

MorphSlider:
  visual:
    form: card-stack
    effect: webgl slider that melts between images with a displacement
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 5/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: heavy

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

OptionWheel:
  visual:
    form: component-surface
    effect: curved option picker that spins via scroll, drag, or arrow
    depth: subtle-2.5d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: scroll
    persistence: drag-settle

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

PillNav:
  visual:
    form: navigation-menu
    effect: minimal pill nav with sliding active highlight + smooth easing
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 1/5

  motion:
    character: subtle
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - operator-dock
    - tool-switcher
    - quick-action-bar

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

PixelCard:
  visual:
    form: card
    effect: canvas pixel grid highlight and dissolve
    depth: subtle-2.5d
    texture: pixel-matrix
    glow: medium
    visual_intensity: 4/5

  motion:
    character: snappy
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - classified-dossier
    - threat-actor-card
    - evidence-card

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

ProfileCard:
  visual:
    form: card
    effect: animated profile card glare with 3d hover effect
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: supported

  performance:
    weight: light

  placement:
    - agent-dossier
    - operator-id-badge
    - target-profile-modal

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

ReflectiveCard:
  visual:
    form: card
    effect: card with dynamic webcam reflection and glare effects that
    depth: subtle-2.5d
    texture: clean
    glow: medium
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

ScrollStack:
  visual:
    form: card
    effect: overlapping card stack reveals on scroll with depth layering
    depth: layered-parallax
    texture: clean
    glow: none
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: scroll
    persistence: trigger-once

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

SpecularButton:
  visual:
    form: component-surface
    effect: glass button with a shader-driven specular rim light that
    depth: flat
    texture: glass
    glow: low
    visual_intensity: 5/5

  motion:
    character: snappy
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

SpotlightCard:
  visual:
    form: card
    effect: cursor-following spotlight
    depth: subtle-2.5d
    texture: clean
    glow: medium
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

Stack:
  visual:
    form: card-stack
    effect: layered stack with swipe animations, autoplay and smooth
    depth: layered-parallax
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

StaggeredMenu:
  visual:
    form: navigation-menu
    effect: menu with staggered item animations and smooth transitions on
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - operator-dock
    - tool-switcher
    - quick-action-bar

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

Stepper:
  visual:
    form: interactive-widget
    effect: animated multi-step progress indicator with active state
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 1/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects

TiltedCard:
  visual:
    form: card
    effect: 3d perspective tilt card reacting to pointer
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: supported

  performance:
    weight: light

  placement:
    - challenge-card
    - evidence-card
    - dossier-card

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - small-mobile-list
    - stacking with multiple cursor effects
```

## Micro (34)

```yaml
BellToggle:
  visual:
    form: toggle-pill
    effect: pill toggle that answers a press at three tempos - the bell
    depth: flat
    texture: glass
    glow: low
    visual_intensity: 1/5

  motion:
    character: spring
    trigger: click
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: heavy

  placement:
    - tool-call-chip
    - agent-status-badge
    - terminal-execution-log

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

BranchedMenu:
  visual:
    form: chip
    effect: collapsible menu whose sections unfold into a trunk with a
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

CallChip:
  visual:
    form: chip
    effect: inline tool-call execution wiper with live ms counter
    depth: flat
    texture: clean
    glow: low
    visual_intensity: 2/5

  motion:
    character: snappy
    trigger: click-or-run
    persistence: trigger-once

  interaction:
    pointer: moderate
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - tool-call-chip
    - agent-status-badge
    - terminal-execution-log

  theme_fit:
    cyber_terminal: high

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

CodeSlots:
  visual:
    form: input-field
    effect: mechanical slot reels cycling auth characters
    depth: subtle-2.5d
    texture: ascii
    glow: medium
    visual_intensity: 3/5

  motion:
    character: retro-computational
    trigger: click
    persistence: trigger-once

  interaction:
    pointer: moderate
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - cipher-pin-entry
    - 2fa-token-station
    - clearance-code-gate

  theme_fit:
    cyber_terminal: high

  avoid:
    - static-noninteractive-label
    - unconstrained-freeform-input
    - rapid-data-entry

CometDial:
  visual:
    form: meter-dial
    effect: tick-ring dial you flick by angle - the reading launches on a
    depth: layered-parallax
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: spring
    trigger: scroll
    persistence: hover-only

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

DodgeField:
  visual:
    form: meter-dial
    effect: wrapper that makes any child flee the pointer inside a
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

FlipCard:
  visual:
    form: micro-control
    effect: two-faced card that flips in 3d on a click, a drag or a
    depth: deep-3d
    texture: metallic
    glow: none
    visual_intensity: 3/5

  motion:
    character: spring
    trigger: scroll
    persistence: trigger-once

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: moderate

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

FolderFloat:
  visual:
    form: micro-control
    effect: folder that opens on hover or press - the flap tilts toward
    depth: layered-parallax
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: spring
    trigger: click
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

FuseButton:
  visual:
    form: action-button
    effect: action button whose done state carries its own undo on a
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 1/5

  motion:
    character: snappy
    trigger: click
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - purge-evidence-action
    - classified-stamp-button
    - intercept-execute

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

GlideSelect:
  visual:
    form: chip
    effect: select chip whose menu pops out of its own corner and whose
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: snappy
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - tool-call-chip
    - agent-status-badge
    - terminal-execution-log

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

HoldButton:
  visual:
    form: action-button
    effect: hold-to-confirm button whose liquid fill rises while pressed,
    depth: flat
    texture: glass
    glow: low
    visual_intensity: 4/5

  motion:
    character: snappy
    trigger: click
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - purge-evidence-action
    - classified-stamp-button
    - intercept-execute

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

JellyRadio:
  visual:
    form: chip
    effect: radio group of labelled chips where the chosen one swells
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: spring
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - tool-call-chip
    - agent-status-badge
    - terminal-execution-log

  theme_fit:
    cyber_terminal: low

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

LatticeLoader:
  visual:
    form: loader
    effect: inline agent-status row - a 3x3 or 4x4 lattice whose cells
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 1/5

  motion:
    character: continuous
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

PaperCrumple:
  visual:
    form: micro-control
    effect: an image that crumples into a textured 3d sheet while held
    depth: deep-3d
    texture: grain
    glow: none
    visual_intensity: 2/5

  motion:
    character: explosive
    trigger: drag
    persistence: drag-settle

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: low

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

PeekRating:
  visual:
    form: meter-dial
    effect: star rating you can try before you commit - sweeping the row
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: click
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

PromptBar:
  visual:
    form: micro-control
    effect: chat composer with an @ sources menu, a / commands menu, a
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

PulseHeart:
  visual:
    form: action-button
    effect: like button that contracts to a dot, flips colour at its
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 1/5

  motion:
    character: snappy
    trigger: mount
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - purge-evidence-action
    - classified-stamp-button
    - intercept-execute

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

RefineFrame:
  visual:
    form: chip
    effect: reserved-aspect frame that walks any media through queued,
    depth: layered-parallax
    texture: glass
    glow: low
    visual_intensity: 1/5

  motion:
    character: snappy
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - tool-call-chip
    - agent-status-badge
    - terminal-execution-log

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

RubberSegment:
  visual:
    form: micro-control
    effect: segmented control with a rubber thumb - taps stretch it
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: spring
    trigger: drag
    persistence: drag-settle

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: high

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

ScrubField:
  visual:
    form: chip
    effect: number chip you drag to scrub - the value follows the hand,
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: spring
    trigger: click
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - tool-call-chip
    - agent-status-badge
    - terminal-execution-log

  theme_fit:
    cyber_terminal: low

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

Shredder:
  visual:
    form: micro-control
    effect: a list with a paper shredder at the bottom
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 1/5

  motion:
    character: spring
    trigger: drag
    persistence: drag-settle

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

SlideCommit:
  visual:
    form: micro-control
    effect: slide-to-confirm handle that plants with a spinner while your
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 1/5

  motion:
    character: spring
    trigger: click
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

SlingButton:
  visual:
    form: action-button
    effect: send button you pull back like a slingshot - the band
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: snappy
    trigger: scroll
    persistence: hover-only

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - purge-evidence-action
    - classified-stamp-button
    - intercept-execute

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

SloshGauge:
  visual:
    form: meter-dial
    effect: tank gauge whose liquid chases the value with mass, tilts
    depth: subtle-2.5d
    texture: liquid
    glow: none
    visual_intensity: 4/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

SpringCheck:
  visual:
    form: micro-control
    effect: checkbox row where a single spring fills the box, draws the
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 1/5

  motion:
    character: spring
    trigger: click
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

SquishSwitch:
  visual:
    form: toggle-pill
    effect: drag-scrubbable switch whose thumb stretches by how fast it
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 1/5

  motion:
    character: spring
    trigger: drag
    persistence: drag-settle

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - stealth-mode-switch
    - threat-level-toggle
    - access-gate-toggle

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

StatusMark:
  visual:
    form: chip
    effect: a 20px status glyph for agent task lists that morphs in place
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 1/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

SwipeRow:
  visual:
    form: micro-control
    effect: list row that swipes open to reveal actions, snaps by flick
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: snappy
    trigger: scroll
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

SwipeToast:
  visual:
    form: micro-control
    effect: single toast that rises through its bottom edge, swipes down
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

TearTicket:
  visual:
    form: micro-control
    effect: ticket whose perforated stub tears off by hand - paper
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: snappy
    trigger: pointer
    persistence: hover-only

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

ThoughtLine:
  visual:
    form: micro-control
    effect: reasoning-trace header - a glyph and a label breathe beside a
    depth: flat
    texture: glass
    glow: low
    visual_intensity: 1/5

  motion:
    character: smooth
    trigger: pointer
    persistence: continuous

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

VoicePill:
  visual:
    form: toggle-pill
    effect: mic button that swells into a tinted capsule of level-driven
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 1/5

  motion:
    character: snappy
    trigger: click
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - stealth-mode-switch
    - threat-level-toggle
    - access-gate-toggle

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

WakeSlider:
  visual:
    form: meter-dial
    effect: range slider drawn as thin bars with no thumb - drag speed
    depth: layered-parallax
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: drag
    persistence: drag-settle

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: moderate

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks

WarmTooltip:
  visual:
    form: micro-control
    effect: tooltip group with one shared delay - the first label waits
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: scroll
    persistence: trigger-once

  interaction:
    pointer: light
    touch: supported
    keyboard: supported

  performance:
    weight: light

  placement:
    - telemetry-strip
    - status-monitor
    - operator-controls

  theme_fit:
    cyber_terminal: medium

  avoid:
    - static-noninteractive-label
    - multiline-overflow
    - unmetered-async-tasks
```

## Backgrounds (58)

```yaml
AcidSquares:
  visual:
    form: geometric-tunnel
    effect: a crystalline corridor of stacked squares receding into depth
    depth: layered-parallax
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

AeroShards:
  visual:
    form: geometric-tunnel
    effect: a gpu-driven wind sculpture of folded foil shards with crisp
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: moderate
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Aurora:
  visual:
    form: ambient-canvas
    effect: flowing aurora gradient background
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Balatro:
  visual:
    form: ambient-canvas
    effect: the balatro shader, fully customizalbe and interactive
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 5/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: moderate
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Ballpit:
  visual:
    form: ambient-canvas
    effect: physics ball pit simulation with bouncing colorful spheres
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Beams:
  visual:
    form: ambient-canvas
    effect: crossing animated ribbons with customizable properties
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

ColorBends:
  visual:
    form: ambient-canvas
    effect: vibrant color bends with smooth flowing animation
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

CRTWarp:
  visual:
    form: canvas-shader
    effect: barrel-distorted retro cathode-ray monitor with scanlines
    depth: subtle-2.5d
    texture: phosphor
    glow: medium
    visual_intensity: 3/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - terminal-shell-wrapper
    - surveillance-feed-view
    - retro-ops-console

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

DarkVeil:
  visual:
    form: noise-veil
    effect: subtle dark background with a smooth animation and postprocessing
    depth: flat
    texture: clean
    glow: low
    visual_intensity: 2/5

  motion:
    character: subtle
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Dither:
  visual:
    form: noise-veil
    effect: retro dithered noise shader background
    depth: flat
    texture: grain
    glow: none
    visual_intensity: 4/5

  motion:
    character: retro-computational
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - cyber-war-room-backdrop
    - breach-visualization
    - terminal-shell-wrapper

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

DotField:
  visual:
    form: grid-matrix
    effect: interactive dot grid with cursor bulge, glow, sparkle, and
    depth: flat
    texture: electric
    glow: medium
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - tactical-grid-underlay
    - satellite-recon-map
    - telemetry-board

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

DotGrid:
  visual:
    form: grid-matrix
    effect: animated dot grid with cursor interactions
    depth: flat
    texture: mesh
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - tactical-grid-underlay
    - satellite-recon-map
    - telemetry-board

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

EvilEye:
  visual:
    form: ambient-canvas
    effect: procedural evil eye shader with animated iris, slit pupil,
    depth: flat
    texture: clean
    glow: medium
    visual_intensity: 5/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

FaultyTerminal:
  visual:
    form: ascii-canvas
    effect: flickering terminal glyphs with dropped sync pulses
    depth: flat
    texture: ascii
    glow: high
    visual_intensity: 4/5

  motion:
    character: retro-computational
    trigger: continuous
    persistence: loop

  interaction:
    pointer: light
    touch: supported
    keyboard: passthrough

  performance:
    weight: moderate

  placement:
    - compromised-host-lockscreen
    - breach-alert-hero
    - honeypot-terminal

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - primary-form-inputs
    - small-mobile-list

Ferrofluid:
  visual:
    form: webgl-fluid
    effect: a churning magnetic fluid traced by glowing contour lines,
    depth: flat
    texture: liquid
    glow: medium
    visual_intensity: 5/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

FloatingLines:
  visual:
    form: ambient-canvas
    effect: 3d floating lines that react to cursor movement
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Galaxy:
  visual:
    form: ambient-canvas
    effect: parallax realistic starfield with pointer interactions
    depth: deep-3d
    texture: clean
    glow: high
    visual_intensity: 5/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: moderate
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

GhostFibers:
  visual:
    form: ambient-canvas
    effect: a deep-blue recursive fiber field with luminous bands, radial
    depth: flat
    texture: clean
    glow: medium
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

GradientBlinds:
  visual:
    form: noise-veil
    effect: layered gradient blinds with spotlight and noise distortion
    depth: layered-parallax
    texture: grain
    glow: medium
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - cyber-war-room-backdrop
    - breach-visualization
    - terminal-shell-wrapper

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

GradientWaves:
  visual:
    form: ambient-canvas
    effect: raymarched sine waves rolling toward a soft, hazy horizon
    depth: deep-3d
    texture: clean
    glow: low
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Grainient:
  visual:
    form: noise-veil
    effect: grainy gradient swirls with soft wave distortion
    depth: flat
    texture: grain
    glow: low
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

GridDistortion:
  visual:
    form: grid-matrix
    effect: warped grid mesh distorts smoothly reacting to cursor
    depth: flat
    texture: mesh
    glow: none
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - tactical-grid-underlay
    - satellite-recon-map
    - telemetry-board

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

GridMotion:
  visual:
    form: grid-matrix
    effect: perspective moving grid lines based on cusror position
    depth: deep-3d
    texture: mesh
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - tactical-grid-underlay
    - satellite-recon-map
    - telemetry-board

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

GridScan:
  visual:
    form: grid-matrix
    effect: animated grid room 3d scan effect and cool interactions
    depth: deep-3d
    texture: mesh
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - tactical-grid-underlay
    - satellite-recon-map
    - telemetry-board

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Hyperspeed:
  visual:
    form: canvas-shader
    effect: high-velocity 3d light streaks receding into horizon
    depth: deep-3d
    texture: electric
    glow: neon
    visual_intensity: 5/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: moderate
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - mission-launch-hero
    - network-uplink-splash
    - agent-activation-screen

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Iridescence:
  visual:
    form: ambient-canvas
    effect: slick iridescent shader with shifting waves
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 5/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

LetterGlitch:
  visual:
    form: ascii-canvas
    effect: matrix rain of shifting alphanumeric glyphs and runes
    depth: flat
    texture: ascii
    glow: neon
    visual_intensity: 4/5

  motion:
    character: retro-computational
    trigger: continuous
    persistence: loop

  interaction:
    pointer: light
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - classified-payload-view
    - decrypt-progress-backdrop
    - cipher-wall

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Lightfall:
  visual:
    form: geometric-tunnel
    effect: colorful light streaks raining down a glowing tunnel with a
    depth: deep-3d
    texture: clean
    glow: medium
    visual_intensity: 5/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Lightning:
  visual:
    form: ambient-canvas
    effect: procedural lightning bolts with branching and glow flicker
    depth: flat
    texture: electric
    glow: neon
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

LightPillar:
  visual:
    form: ambient-canvas
    effect: vertical pillar of light with glow effects
    depth: flat
    texture: clean
    glow: medium
    visual_intensity: 1/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

LightRays:
  visual:
    form: ambient-canvas
    effect: volumetric light rays/beams with customizable direction
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

LightTunnel:
  visual:
    form: geometric-tunnel
    effect: a radial fibre-optic tunnel with light pulses racing into depth
    depth: deep-3d
    texture: clean
    glow: none
    visual_intensity: 5/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

LineWaves:
  visual:
    form: ambient-canvas
    effect: animated line wave pattern with colorful warped distortion
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 4/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

LiquidChrome:
  visual:
    form: webgl-fluid
    effect: liquid metallic chrome shader with flowing reflective surface
    depth: flat
    texture: liquid
    glow: medium
    visual_intensity: 4/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

LiquidEther:
  visual:
    form: webgl-fluid
    effect: interactive liquid shader with flowing distortion and
    depth: flat
    texture: liquid
    glow: none
    visual_intensity: 4/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: moderate
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

MicroSlats:
  visual:
    form: grid-matrix
    effect: a wall of tiny slats that becomes a rolling sea in
    depth: deep-3d
    texture: liquid
    glow: none
    visual_intensity: 5/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: strong
    touch: degrade-to-static
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

MoltenMetal:
  visual:
    form: webgl-fluid
    effect: swirling caustic plasma filaments with molten, white-hot cores
    depth: flat
    texture: liquid
    glow: high
    visual_intensity: 4/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Orb:
  visual:
    form: ambient-canvas
    effect: floating energy orb with customizable hover effect
    depth: layered-parallax
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Particles:
  visual:
    form: particle-emitter
    effect: configurable particle system
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 4/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

PixelBlast:
  visual:
    form: particle-emitter
    effect: exploding pixel particle bursts with optional liquid
    depth: flat
    texture: liquid
    glow: high
    visual_intensity: 3/5

  motion:
    character: explosive
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - cyber-war-room-backdrop
    - breach-visualization
    - terminal-shell-wrapper

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

PixelSnow:
  visual:
    form: particle-emitter
    effect: falling pixelated snow effect with customizable density and speed
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 3/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - cyber-war-room-backdrop
    - breach-visualization
    - terminal-shell-wrapper

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Plasma:
  visual:
    form: webgl-fluid
    effect: organic plasma gradients swirl + morph with smooth turbulence
    depth: flat
    texture: liquid
    glow: high
    visual_intensity: 4/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

PlasmaWave:
  visual:
    form: webgl-fluid
    effect: raymarched plasma waves with dual-wave interference and ogl
    depth: deep-3d
    texture: liquid
    glow: high
    visual_intensity: 4/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Prism:
  visual:
    form: ambient-canvas
    effect: rotating prism with configurable intensity, size, and colors
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

PrismaticBurst:
  visual:
    form: ambient-canvas
    effect: burst of light rays with controllable color, distortion, amount
    depth: flat
    texture: clean
    glow: high
    visual_intensity: 4/5

  motion:
    character: explosive
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Radar:
  visual:
    form: canvas-shader
    effect: 360-degree rotating radar sweep with blip detection
    depth: flat
    texture: phosphor
    glow: high
    visual_intensity: 4/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - airspace-surveillance-screen
    - threat-radar-display
    - signal-intercept-panel

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

RippleGrid:
  visual:
    form: grid-matrix
    effect: a grid that continuously animates with a ripple effect
    depth: flat
    texture: mesh
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - tactical-grid-underlay
    - satellite-recon-map
    - telemetry-board

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Scanner:
  visual:
    form: canvas-shader
    effect: bidirectional optical laser scan sweeping surface
    depth: flat
    texture: electric
    glow: neon
    visual_intensity: 3/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - document-verification-portal
    - evidence-ingestion-view
    - biometric-scan-gate

  theme_fit:
    cyber_terminal: high

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

ShapeGrid:
  visual:
    form: grid-matrix
    effect: animated grid with shape variants (square, hexagon, circle,
    depth: flat
    texture: mesh
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - tactical-grid-underlay
    - satellite-recon-map
    - telemetry-board

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

ShapeWaves:
  visual:
    form: geometric-tunnel
    effect: a webgpu field of triangles, circles and squares that
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

SideRays:
  visual:
    form: ambient-canvas
    effect: animated light rays emanating from the side with customizable
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Silk:
  visual:
    form: ambient-canvas
    effect: smooth waves background with soft lighting
    depth: flat
    texture: clean
    glow: low
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

SlicedWaves:
  visual:
    form: grid-matrix
    effect: a grid of soft glowing bars rippling like a slatted equalizer
    depth: flat
    texture: mesh
    glow: medium
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - tactical-grid-underlay
    - satellite-recon-map
    - telemetry-board

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

SoftAurora:
  visual:
    form: noise-veil
    effect: soft aurora borealis shader with 3d perlin noise and cosine
    depth: deep-3d
    texture: grain
    glow: low
    visual_intensity: 5/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Threads:
  visual:
    form: ambient-canvas
    effect: animated pattern of lines forming a fabric-like motion
    depth: flat
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Topography:
  visual:
    form: ambient-canvas
    effect: a living contour map with glowing, elevation-tinted lines
    depth: subtle-2.5d
    texture: clean
    glow: medium
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

Waves:
  visual:
    form: ambient-canvas
    effect: layered lines that form smooth wave patterns with animation
    depth: layered-parallax
    texture: clean
    glow: none
    visual_intensity: 2/5

  motion:
    character: continuous
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text

WebThreads:
  visual:
    form: ambient-canvas
    effect: glowing sine threads woven through a luminous convergence point
    depth: flat
    texture: clean
    glow: medium
    visual_intensity: 2/5

  motion:
    character: smooth
    trigger: continuous
    persistence: loop

  interaction:
    pointer: none
    touch: none
    keyboard: passthrough

  performance:
    weight: heavy

  placement:
    - dossier-page-canvas
    - stealth-briefing-background
    - secure-enclave-wrapper

  theme_fit:
    cyber_terminal: medium

  avoid:
    - dense-data-table
    - low-power-mobile-backgrounds
    - behind-high-contrast-text
```

