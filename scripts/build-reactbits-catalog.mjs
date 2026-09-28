import fs from 'node:fs/promises';
import path from 'node:path';

const INPUT_FILE = path.join(process.cwd(), 'reactbits-llm', 'llm.txt');
const OUTPUT_FILE = path.join(process.cwd(), '.claude', 'reactbits-catalog.md');

// Exact hand-tuned specifications for iconic and user-specified components
const EXACT_OVERRIDES = {
    SpotlightCard: {
        visual: {
            form: 'card',
            effect: 'cursor-following spotlight',
            depth: 'subtle-2.5d',
            texture: 'clean',
            glow: 'medium',
            visual_intensity: '3/5'
        },
        motion: {
            character: 'smooth',
            trigger: 'pointer',
            persistence: 'hover-only'
        },
        interaction: {
            pointer: 'strong',
            touch: 'degrade-to-static',
            keyboard: 'supported'
        },
        performance: {
            weight: 'light'
        },
        placement: [
            'challenge-card',
            'evidence-card',
            'dossier-card'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'small-mobile-list',
            'stacking with multiple cursor effects'
        ]
    },
    ASCIIText: {
        visual: {
            form: 'display-text',
            effect: 'animated ascii background matrix behind letterforms',
            depth: 'flat',
            texture: 'ascii',
            glow: 'low',
            visual_intensity: '4/5'
        },
        motion: {
            character: 'retro-computational',
            trigger: 'continuous',
            persistence: 'loop'
        },
        interaction: {
            pointer: 'none',
            touch: 'supported',
            keyboard: 'accessible'
        },
        performance: {
            weight: 'light'
        },
        placement: [
            'terminal-hero-header',
            'breach-banner',
            'classified-title'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'long-form-body-copy',
            'small-mobile-list'
        ]
    },
    CountUp: {
        visual: {
            form: 'counter',
            effect: 'animated tabular numeric counter with decimal precision',
            depth: 'flat',
            texture: 'clean',
            glow: 'none',
            visual_intensity: '1/5'
        },
        motion: {
            character: 'spring',
            trigger: 'mount',
            persistence: 'trigger-once'
        },
        interaction: {
            pointer: 'none',
            touch: 'supported',
            keyboard: 'accessible'
        },
        performance: {
            weight: 'light'
        },
        placement: [
            'telemetry-metric-strip',
            'threat-level-indicator',
            'intercept-counter'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'frequently-updating-streams',
            'unformatted-currency',
            'static-labels'
        ]
    },
    DecryptedText: {
        visual: {
            form: 'scramble-text',
            effect: 'cycling glyph decryption matrix resolving to cleartext',
            depth: 'flat',
            texture: 'ascii',
            glow: 'medium',
            visual_intensity: '3/5'
        },
        motion: {
            character: 'retro-computational',
            trigger: 'mount-or-hover',
            persistence: 'trigger-once'
        },
        interaction: {
            pointer: 'moderate',
            touch: 'degrade-to-tap',
            keyboard: 'accessible'
        },
        performance: {
            weight: 'light'
        },
        placement: [
            'cipher-decoder-station',
            'classified-title',
            'breach-alert-headline'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'long-form-body-copy',
            'frequent-re-renders'
        ]
    },
    GlitchText: {
        visual: {
            form: 'headline-text',
            effect: 'rgb channel split with horizontal jitter and displacement slices',
            depth: 'flat',
            texture: 'clean',
            glow: 'neon',
            visual_intensity: '4/5'
        },
        motion: {
            character: 'glitchy',
            trigger: 'continuous',
            persistence: 'loop'
        },
        interaction: {
            pointer: 'light',
            touch: 'supported',
            keyboard: 'accessible'
        },
        performance: {
            weight: 'light'
        },
        placement: [
            'compromised-host-header',
            'malware-analysis-title',
            'breach-banner'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'long-form-body-copy',
            'dense-data-table',
            'accessible-form-labels'
        ]
    },
    PixelCard: {
        visual: {
            form: 'card',
            effect: 'canvas pixel grid highlight and dissolve',
            depth: 'subtle-2.5d',
            texture: 'pixel-matrix',
            glow: 'medium',
            visual_intensity: '4/5'
        },
        motion: {
            character: 'snappy',
            trigger: 'pointer',
            persistence: 'hover-only'
        },
        interaction: {
            pointer: 'strong',
            touch: 'degrade-to-static',
            keyboard: 'supported'
        },
        performance: {
            weight: 'moderate'
        },
        placement: [
            'classified-dossier',
            'threat-actor-card',
            'evidence-card'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'small-mobile-list',
            'stacking with multiple cursor effects'
        ]
    },
    DecayCard: {
        visual: {
            form: 'card',
            effect: 'canvas decay erosion dissolving to reveal inner content',
            depth: 'subtle-2.5d',
            texture: 'grain',
            glow: 'low',
            visual_intensity: '4/5'
        },
        motion: {
            character: 'smooth',
            trigger: 'pointer',
            persistence: 'hover-only'
        },
        interaction: {
            pointer: 'strong',
            touch: 'degrade-to-static',
            keyboard: 'supported'
        },
        performance: {
            weight: 'moderate'
        },
        placement: [
            'cold-case-file',
            'corrupted-evidence-card',
            'declassified-briefing'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'small-mobile-list',
            'stacking with multiple cursor effects'
        ]
    },
    MagicBento: {
        visual: {
            form: 'bento-grid',
            effect: 'multi-tile responsive bento grid with hover illumination',
            depth: 'subtle-2.5d',
            texture: 'clean',
            glow: 'low',
            visual_intensity: '3/5'
        },
        motion: {
            character: 'smooth',
            trigger: 'pointer',
            persistence: 'hover-only'
        },
        interaction: {
            pointer: 'strong',
            touch: 'degrade-to-static',
            keyboard: 'supported'
        },
        performance: {
            weight: 'light'
        },
        placement: [
            'recon-bento-grid',
            'intel-dashboard',
            'target-overview'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'small-mobile-list',
            'stacking with multiple cursor effects'
        ]
    },
    Dock: {
        visual: {
            form: 'dock',
            effect: 'magnification icon dock with spring inertia',
            depth: 'subtle-2.5d',
            texture: 'glass',
            glow: 'low',
            visual_intensity: '2/5'
        },
        motion: {
            character: 'spring',
            trigger: 'pointer',
            persistence: 'hover-only'
        },
        interaction: {
            pointer: 'strong',
            touch: 'degrade-to-static',
            keyboard: 'supported'
        },
        performance: {
            weight: 'moderate'
        },
        placement: [
            'operator-dock',
            'tool-switcher',
            'quick-action-bar'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'small-mobile-list',
            'nested-menus'
        ]
    },
    CallChip: {
        visual: {
            form: 'chip',
            effect: 'inline tool-call execution wiper with live ms counter',
            depth: 'flat',
            texture: 'clean',
            glow: 'low',
            visual_intensity: '2/5'
        },
        motion: {
            character: 'snappy',
            trigger: 'click-or-run',
            persistence: 'trigger-once'
        },
        interaction: {
            pointer: 'moderate',
            touch: 'supported',
            keyboard: 'supported'
        },
        performance: {
            weight: 'light'
        },
        placement: [
            'tool-call-chip',
            'agent-status-badge',
            'terminal-execution-log'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'static-noninteractive-label',
            'multiline-overflow',
            'unmetered-async-tasks'
        ]
    },
    CodeSlots: {
        visual: {
            form: 'input-field',
            effect: 'mechanical slot reels cycling auth characters',
            depth: 'subtle-2.5d',
            texture: 'ascii',
            glow: 'medium',
            visual_intensity: '3/5'
        },
        motion: {
            character: 'retro-computational',
            trigger: 'click',
            persistence: 'trigger-once'
        },
        interaction: {
            pointer: 'moderate',
            touch: 'supported',
            keyboard: 'supported'
        },
        performance: {
            weight: 'moderate'
        },
        placement: [
            'cipher-pin-entry',
            '2fa-token-station',
            'clearance-code-gate'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'static-noninteractive-label',
            'unconstrained-freeform-input',
            'rapid-data-entry'
        ]
    },
    Crosshair: {
        visual: {
            form: 'cursor-tracker',
            effect: 'targeting reticle with link snapping and coordinate locks',
            depth: 'flat',
            texture: 'clean',
            glow: 'neon',
            visual_intensity: '3/5'
        },
        motion: {
            character: 'snappy',
            trigger: 'pointer',
            persistence: 'continuous'
        },
        interaction: {
            pointer: 'strong',
            touch: 'degrade-to-static',
            keyboard: 'passthrough'
        },
        performance: {
            weight: 'light'
        },
        placement: [
            'target-tracker',
            'recon-viewer',
            'dossier-cursor'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'stacking with multiple cursor effects',
            'small-mobile-list',
            'text-heavy-documentation'
        ]
    },
    ElectricBorder: {
        visual: {
            form: 'border-fx',
            effect: 'jittery electric energy border with animated edge arcs',
            depth: 'subtle-2.5d',
            texture: 'electric',
            glow: 'neon',
            visual_intensity: '4/5'
        },
        motion: {
            character: 'glitchy',
            trigger: 'continuous',
            persistence: 'loop'
        },
        interaction: {
            pointer: 'light',
            touch: 'supported',
            keyboard: 'supported'
        },
        performance: {
            weight: 'moderate'
        },
        placement: [
            'challenge-card-border',
            'classified-badge',
            'quarantine-container'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'multi-instance-in-virtual-list',
            'low-contrast-backgrounds'
        ]
    },
    LaserFlow: {
        visual: {
            form: 'mesh-surface',
            effect: 'dynamic flowing laser light beam scanning across surface',
            depth: 'subtle-2.5d',
            texture: 'electric',
            glow: 'neon',
            visual_intensity: '4/5'
        },
        motion: {
            character: 'continuous',
            trigger: 'continuous',
            persistence: 'loop'
        },
        interaction: {
            pointer: 'moderate',
            touch: 'supported',
            keyboard: 'passthrough'
        },
        performance: {
            weight: 'heavy'
        },
        placement: [
            'quarantine-perimeter',
            'laser-tripwire-display',
            'breach-alert-boundary'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'low-power-mobile-backgrounds',
            'behind-high-contrast-text'
        ]
    },
    CRTWarp: {
        visual: {
            form: 'canvas-shader',
            effect: 'barrel-distorted retro cathode-ray monitor with scanlines',
            depth: 'subtle-2.5d',
            texture: 'phosphor',
            glow: 'medium',
            visual_intensity: '3/5'
        },
        motion: {
            character: 'continuous',
            trigger: 'continuous',
            persistence: 'loop'
        },
        interaction: {
            pointer: 'none',
            touch: 'none',
            keyboard: 'passthrough'
        },
        performance: {
            weight: 'heavy'
        },
        placement: [
            'terminal-shell-wrapper',
            'surveillance-feed-view',
            'retro-ops-console'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'low-power-mobile-backgrounds',
            'behind-high-contrast-text'
        ]
    },
    FaultyTerminal: {
        visual: {
            form: 'ascii-canvas',
            effect: 'flickering terminal glyphs with dropped sync pulses',
            depth: 'flat',
            texture: 'ascii',
            glow: 'high',
            visual_intensity: '4/5'
        },
        motion: {
            character: 'retro-computational',
            trigger: 'continuous',
            persistence: 'loop'
        },
        interaction: {
            pointer: 'light',
            touch: 'supported',
            keyboard: 'passthrough'
        },
        performance: {
            weight: 'moderate'
        },
        placement: [
            'compromised-host-lockscreen',
            'breach-alert-hero',
            'honeypot-terminal'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'primary-form-inputs',
            'small-mobile-list'
        ]
    },
    Hyperspeed: {
        visual: {
            form: 'canvas-shader',
            effect: 'high-velocity 3d light streaks receding into horizon',
            depth: 'deep-3d',
            texture: 'electric',
            glow: 'neon',
            visual_intensity: '5/5'
        },
        motion: {
            character: 'continuous',
            trigger: 'continuous',
            persistence: 'loop'
        },
        interaction: {
            pointer: 'moderate',
            touch: 'none',
            keyboard: 'passthrough'
        },
        performance: {
            weight: 'heavy'
        },
        placement: [
            'mission-launch-hero',
            'network-uplink-splash',
            'agent-activation-screen'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'low-power-mobile-backgrounds',
            'behind-high-contrast-text'
        ]
    },
    LetterGlitch: {
        visual: {
            form: 'ascii-canvas',
            effect: 'matrix rain of shifting alphanumeric glyphs and runes',
            depth: 'flat',
            texture: 'ascii',
            glow: 'neon',
            visual_intensity: '4/5'
        },
        motion: {
            character: 'retro-computational',
            trigger: 'continuous',
            persistence: 'loop'
        },
        interaction: {
            pointer: 'light',
            touch: 'none',
            keyboard: 'passthrough'
        },
        performance: {
            weight: 'heavy'
        },
        placement: [
            'classified-payload-view',
            'decrypt-progress-backdrop',
            'cipher-wall'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'low-power-mobile-backgrounds',
            'behind-high-contrast-text'
        ]
    },
    Radar: {
        visual: {
            form: 'canvas-shader',
            effect: '360-degree rotating radar sweep with blip detection',
            depth: 'flat',
            texture: 'phosphor',
            glow: 'high',
            visual_intensity: '4/5'
        },
        motion: {
            character: 'continuous',
            trigger: 'continuous',
            persistence: 'loop'
        },
        interaction: {
            pointer: 'none',
            touch: 'none',
            keyboard: 'passthrough'
        },
        performance: {
            weight: 'heavy'
        },
        placement: [
            'airspace-surveillance-screen',
            'threat-radar-display',
            'signal-intercept-panel'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'low-power-mobile-backgrounds',
            'behind-high-contrast-text'
        ]
    },
    Scanner: {
        visual: {
            form: 'canvas-shader',
            effect: 'bidirectional optical laser scan sweeping surface',
            depth: 'flat',
            texture: 'electric',
            glow: 'neon',
            visual_intensity: '3/5'
        },
        motion: {
            character: 'continuous',
            trigger: 'continuous',
            persistence: 'loop'
        },
        interaction: {
            pointer: 'none',
            touch: 'none',
            keyboard: 'passthrough'
        },
        performance: {
            weight: 'heavy'
        },
        placement: [
            'document-verification-portal',
            'evidence-ingestion-view',
            'biometric-scan-gate'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'low-power-mobile-backgrounds',
            'behind-high-contrast-text'
        ]
    },
    DitherVeil: {
        visual: {
            form: 'filter-overlay',
            effect: '1-bit dither print burned away by cursor to reveal color image',
            depth: 'flat',
            texture: 'grain',
            glow: 'low',
            visual_intensity: '4/5'
        },
        motion: {
            character: 'smooth',
            trigger: 'pointer',
            persistence: 'continuous'
        },
        interaction: {
            pointer: 'strong',
            touch: 'degrade-to-static',
            keyboard: 'passthrough'
        },
        performance: {
            weight: 'heavy'
        },
        placement: [
            'classified-redaction-reveal',
            'evidence-unmask-view',
            'target-photo-inspect'
        ],
        theme_fit: {
            cyber_terminal: 'high'
        },
        avoid: [
            'dense-data-table',
            'low-power-mobile-backgrounds',
            'stacking with multiple cursor effects'
        ]
    }
};

function inferMetadata(cli, title, desc, category) {
    if (EXACT_OVERRIDES[cli]) {
        return EXACT_OVERRIDES[cli];
    }

    const t = `${cli} ${title} ${desc}`.toLowerCase();

    // 1. FORM
    let form = 'container';
    if (category === 'Text Animations') {
        if (/count/i.test(t)) form = 'counter';
        else if (/loop|marquee|curved/i.test(t)) form = 'marquee-text';
        else if (/scramble|decrypt|shuffle|split\s*flap/i.test(t)) form = 'scramble-text';
        else if (/type/i.test(t)) form = 'typewriter';
        else if (/stroke|tech/i.test(t)) form = 'vector-text';
        else if (/pressure|proximity|particle/i.test(t)) form = 'display-text';
        else form = 'headline-text';
    } else if (category === 'Animations') {
        if (/cursor|crosshair/i.test(t)) form = 'cursor-tracker';
        else if (/border/i.test(t)) form = 'border-fx';
        else if (/particle|spark|ribbon/i.test(t)) form = 'particle-field';
        else if (/mesh/i.test(t)) form = 'mesh-surface';
        else if (/noise|blur|dither|halftone|pixel/i.test(t)) form = 'filter-overlay';
        else form = 'motion-wrapper';
    } else if (category === 'Components') {
        if (/card/i.test(t)) form = 'card';
        else if (/bento/i.test(t)) form = 'bento-tile';
        else if (/dock/i.test(t)) form = 'dock';
        else if (/menu|nav/i.test(t)) form = 'navigation-menu';
        else if (/carousel|stack|gallery|slider/i.test(t)) form = 'card-stack';
        else if (/input|stepper|counter/i.test(t)) form = 'interactive-widget';
        else form = 'component-surface';
    } else if (category === 'Micro') {
        if (/toggle|switch/i.test(t)) form = 'toggle-pill';
        else if (/chip|badge|mark/i.test(t)) form = 'chip';
        else if (/button/i.test(t)) form = 'action-button';
        else if (/loader/i.test(t)) form = 'loader';
        else if (/dial|gauge|slider|field|rating/i.test(t)) form = 'meter-dial';
        else form = 'micro-control';
    } else if (category === 'Backgrounds') {
        if (/tunnel|shards|squares|cubes/i.test(t)) form = 'geometric-tunnel';
        else if (/grid|mesh|matrix|slats/i.test(t)) form = 'grid-matrix';
        else if (/particle|snow|dust|dots/i.test(t)) form = 'particle-emitter';
        else if (/fluid|plasma|liquid|ether/i.test(t)) form = 'webgl-fluid';
        else if (/noise|dither|grain|veil/i.test(t)) form = 'noise-veil';
        else if (/ascii|letter|terminal/i.test(t)) form = 'ascii-canvas';
        else form = 'ambient-canvas';
    }

    // 2. EFFECT (Sanitized for pure YAML compliance: no colons, quotes, or trailing noise)
    let effect = desc.toLowerCase().replace(/^(renders|creates|adds|displays|provides)\s+/i, '').replace(/\.$/, '');
    effect = effect.replace(/:/g, ' -').replace(/["'#]/g, '').trim();
    if (effect.length > 65) {
        const periodIdx = effect.indexOf('.');
        if (periodIdx > 20 && periodIdx <= 65) {
            effect = effect.slice(0, periodIdx);
        } else {
            effect = effect.slice(0, 62).replace(/\s+\S*$/, '');
        }
    }

    // 3. DEPTH
    let depth = 'flat';
    if (/3d|webgl|perspective|extru|spatial|\bcubes?\b|orbit|tunnel|galaxy|raymarch|shards/i.test(t)) {
        depth = 'deep-3d';
    } else if (/parallax|layer|stack|shadow|behind|receding|float/i.test(t)) {
        depth = 'layered-parallax';
    } else if (/card|bento|tilt|spotlight|elevation|\bfold\b|glare|border|dock/i.test(t)) {
        depth = 'subtle-2.5d';
    }

    // 4. TEXTURE
    let texture = 'clean';
    if (/ascii|terminal/i.test(t)) texture = 'ascii';
    else if (/glitch|crt|scanline|phosphor/i.test(t)) texture = 'phosphor';
    else if (/dither|noise|grain|film/i.test(t)) texture = 'grain';
    else if (/electric|lightning|spark|laser/i.test(t)) texture = 'electric';
    else if (/glass|blur|refract|frost/i.test(t)) texture = 'glass';
    else if (/liquid|fluid|plasma|\bblob\b|metaball/i.test(t)) texture = 'liquid';
    else if (/mesh|\bgrid\b|wireframe/i.test(t)) texture = 'mesh';
    else if (/metal|sheen|chrome|specular|shiny/i.test(t)) texture = 'metallic';

    // 5. GLOW
    let glow = 'none';
    if (/neon|laser|electric|lightning|crt/i.test(t)) glow = 'neon';
    else if (/plasma|galaxy|hyperspeed|burst|aura/i.test(t)) glow = 'high';
    else if (/spotlight|glow|shiny|reflect|\bborder\b|flare/i.test(t)) glow = 'medium';
    else if (/subtle|ambient|blur|glass|soft/i.test(t)) glow = 'low';

    // 6. VISUAL INTENSITY
    let visual_intensity = '2/5';
    if (/count|pill|fade|check|toggle|switch|minimal|stepper/i.test(t)) visual_intensity = '1/5';
    else if (/spotlight|matrix|scramble|decrypt|pixel|card|mesh|border|dock/i.test(t)) visual_intensity = '3/5';
    else if (/glitch|electric|laser|dither|plasma|liquid|burst|warp|particle/i.test(t)) visual_intensity = '4/5';
    else if (/hyperspeed|galaxy|webgl|fluid|shader|tunnel/i.test(t)) visual_intensity = '5/5';

    // 7. MOTION CHARACTER
    let character = 'smooth';
    if (/spring|bounce|squish|rubber|elastic|jelly/i.test(t)) character = 'spring';
    else if (/retro|computational|ascii|matrix|decrypt|type|flap/i.test(t)) character = 'retro-computational';
    else if (/glitch|jitter|electric|shake/i.test(t)) character = 'glitchy';
    else if (/snap|chip|button|toggle|switch/i.test(t)) character = 'snappy';
    else if (/loop|continuous|rotate|drift|wave|flow/i.test(t)) character = 'continuous';
    else if (/burst|spark|shatter|confetti|crumple/i.test(t)) character = 'explosive';
    else if (/minimal|static|subtle/i.test(t)) character = 'subtle';

    // 8. MOTION TRIGGER
    let trigger = 'pointer';
    if (category === 'Backgrounds') {
        trigger = 'continuous';
    } else if (/scroll|velocity/i.test(t)) {
        trigger = 'scroll';
    } else if (/click|press|toggle|commit/i.test(t)) {
        trigger = 'click';
    } else if (/drag|grab|sling/i.test(t)) {
        trigger = 'drag';
    } else if (category === 'Text Animations') {
        if (/pressure|proximity|cursor|track|warp|depth|tech|scrambl|fuzzy/i.test(t)) {
            trigger = 'pointer';
        } else if (/loop|continuous|rotat|gradient|marquee|circular|ascii/i.test(t)) {
            trigger = 'continuous';
        } else if (/decrypt|shuffle|flap|focus/i.test(t)) {
            trigger = 'mount-or-hover';
        } else {
            trigger = 'mount';
        }
    } else if (/mount|in-view|entrance|\bcount\b/i.test(t)) {
        trigger = 'mount';
    } else if (/loop|continuous|marquee/i.test(t)) {
        trigger = 'continuous';
    }

    // 9. PERSISTENCE
    let persistence = 'hover-only';
    if (category === 'Backgrounds' || trigger === 'continuous' || /loop|continuous|marquee/i.test(t)) {
        persistence = 'loop';
    } else if (trigger === 'mount' || trigger === 'click' || /trigger|mount|click|reveal|entrance/i.test(t)) {
        persistence = 'trigger-once';
    } else if (trigger === 'drag' || /drag/i.test(t)) {
        persistence = 'drag-settle';
    } else if (trigger === 'pointer') {
        persistence = /hover/i.test(t) || /card|bento/i.test(t) ? 'hover-only' : 'continuous';
    }

    // 10. INTERACTION
    let pointer = 'light';
    let touch = 'supported';
    let keyboard = 'supported';

    if (/cursor|crosshair/i.test(t)) {
        pointer = 'strong';
        touch = 'degrade-to-static';
        keyboard = 'passthrough';
    } else if (category === 'Backgrounds') {
        pointer = /interactive|pointer|mouse/i.test(t) ? 'moderate' : 'none';
        touch = 'none';
        keyboard = 'passthrough';
    } else if (category === 'Text Animations') {
        if (trigger === 'pointer') {
            pointer = 'strong';
            touch = 'degrade-to-tap';
        } else {
            pointer = 'none';
            touch = 'supported';
        }
        keyboard = 'accessible';
    } else if (/card|bento/i.test(t)) {
        pointer = 'strong';
        touch = 'degrade-to-static';
        keyboard = 'supported';
    }

    // 11. PERFORMANCE WEIGHT
    let weight = 'light';
    if (/webgl|shader|canvas|three|ogl|raymarch|plasma|gpu/i.test(t) || category === 'Backgrounds') {
        weight = 'heavy';
    } else if (/spring|physics|inertia|gsap|motion|elastic|drag/i.test(t)) {
        weight = 'moderate';
    }

    // 12. THEME FIT (CYBER TERMINAL)
    let cyber_terminal = 'medium';
    if (/ascii|terminal|cyber|hacker|glitch|matrix|decrypt|scramble|crt|dither|crosshair|laser|electric|pixel|radar|scanner|\bcode\b|spotlight|target/i.test(t)) {
        cyber_terminal = 'high';
    } else if (/bounce|playful|jelly|rubber|cartoon|confetti|crumple|cute/i.test(t)) {
        cyber_terminal = 'low';
    }

    // 13. PLACEMENT (DOSSIER ROLES)
    let placement = ['challenge-card', 'evidence-card', 'dossier-card'];
    if (category === 'Text Animations') {
        if (cyber_terminal === 'high') {
            placement = ['terminal-hero-header', 'cipher-decoder-station', 'classified-title'];
        } else if (/count/i.test(t)) {
            placement = ['telemetry-metric-strip', 'threat-level-indicator', 'intercept-counter'];
        } else {
            placement = ['mission-briefing-hero', 'dossier-title', 'case-file-header'];
        }
    } else if (category === 'Animations') {
        if (/cursor|crosshair/i.test(t)) {
            placement = ['target-tracker', 'recon-viewer', 'dossier-cursor'];
        } else if (/border/i.test(t)) {
            placement = ['challenge-card-border', 'classified-badge', 'quarantine-container'];
        } else {
            placement = ['interactive-intel-sandbox', 'recon-canvas-underlay', 'operator-hero-canvas'];
        }
    } else if (category === 'Components') {
        if (/bento/i.test(t)) {
            placement = ['recon-bento-grid', 'intel-dashboard', 'target-overview'];
        } else if (/dock|menu|nav/i.test(t)) {
            placement = ['operator-dock', 'tool-switcher', 'quick-action-bar'];
        } else if (/profile/i.test(t)) {
            placement = ['agent-dossier', 'operator-id-badge', 'target-profile-modal'];
        } else {
            placement = ['challenge-card', 'evidence-card', 'dossier-card'];
        }
    } else if (category === 'Micro') {
        if (/chip|badge|call/i.test(t)) {
            placement = ['tool-call-chip', 'agent-status-badge', 'terminal-execution-log'];
        } else if (/toggle|switch/i.test(t)) {
            placement = ['stealth-mode-switch', 'threat-level-toggle', 'access-gate-toggle'];
        } else if (/button/i.test(t)) {
            placement = ['purge-evidence-action', 'classified-stamp-button', 'intercept-execute'];
        } else {
            placement = ['telemetry-strip', 'status-monitor', 'operator-controls'];
        }
    } else if (category === 'Backgrounds') {
        if (/grid|matrix|dot/i.test(t)) {
            placement = ['tactical-grid-underlay', 'satellite-recon-map', 'telemetry-board'];
        } else if (/radar|scanner/i.test(t)) {
            placement = ['threat-radar-display', 'airspace-surveillance-screen', 'signal-intercept-panel'];
        } else if (cyber_terminal === 'high') {
            placement = ['cyber-war-room-backdrop', 'breach-visualization', 'terminal-shell-wrapper'];
        } else {
            placement = ['dossier-page-canvas', 'stealth-briefing-background', 'secure-enclave-wrapper'];
        }
    }

    // 14. AVOID (ANTI-PATTERNS)
    let avoid = ['dense-data-table', 'small-mobile-list', 'stacking with multiple cursor effects'];
    if (category === 'Text Animations') {
        avoid = ['dense-data-table', 'long-form-body-copy', 'small-mobile-list'];
    } else if (category === 'Backgrounds') {
        avoid = ['dense-data-table', 'low-power-mobile-backgrounds', 'behind-high-contrast-text'];
    } else if (category === 'Micro') {
        avoid = ['static-noninteractive-label', 'multiline-overflow', 'unmetered-async-tasks'];
    }

    return {
        visual: { form, effect, depth, texture, glow, visual_intensity },
        motion: { character, trigger, persistence },
        interaction: { pointer, touch, keyboard },
        performance: { weight },
        placement,
        theme_fit: { cyber_terminal },
        avoid
    };
}

function formatYaml(key, meta) {
    let out = `${key}:\n`;
    out += `  visual:\n`;
    out += `    form: ${meta.visual.form}\n`;
    out += `    effect: ${meta.visual.effect}\n`;
    out += `    depth: ${meta.visual.depth}\n`;
    out += `    texture: ${meta.visual.texture}\n`;
    out += `    glow: ${meta.visual.glow}\n`;
    out += `    visual_intensity: ${meta.visual.visual_intensity}\n\n`;

    out += `  motion:\n`;
    out += `    character: ${meta.motion.character}\n`;
    out += `    trigger: ${meta.motion.trigger}\n`;
    out += `    persistence: ${meta.motion.persistence}\n\n`;

    out += `  interaction:\n`;
    out += `    pointer: ${meta.interaction.pointer}\n`;
    out += `    touch: ${meta.interaction.touch}\n`;
    out += `    keyboard: ${meta.interaction.keyboard}\n\n`;

    out += `  performance:\n`;
    out += `    weight: ${meta.performance.weight}\n\n`;

    out += `  placement:\n`;
    for (const p of meta.placement) {
        out += `    - ${p}\n`;
    }
    out += `\n`;

    out += `  theme_fit:\n`;
    out += `    cyber_terminal: ${meta.theme_fit.cyber_terminal}\n\n`;

    out += `  avoid:\n`;
    for (const a of meta.avoid) {
        out += `    - ${a}\n`;
    }

    return out;
}

async function run() {
    const raw = await fs.readFile(INPUT_FILE, 'utf-8');
    const lines = raw.split('\n');

    let currentCategory = '';
    const categories = ['Text Animations', 'Animations', 'Components', 'Micro', 'Backgrounds'];
    const data = {};
    for (const c of categories) data[c] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // Track section headers
        for (const cat of categories) {
            if (trimmed.startsWith(`## ${cat}`)) {
                currentCategory = cat;
            }
        }

        // Stop strictly when non-component sections appear
        if (trimmed.startsWith('## ') && !categories.some(c => trimmed.startsWith(`## ${c}`))) {
            currentCategory = '';
        }

        // Parse list items
        if (currentCategory && trimmed.startsWith('- [')) {
            const match = trimmed.match(/- \[([^\]]+)\]\(([^)]+)\):\s*(.*?)(?:\s*CLI:\s*`([^`]+)`\.?)?$/);
            if (match) {
                const [, title, url, description, cli] = match;
                const cliKey = cli || title.replace(/[^a-zA-Z0-9]/g, '');
                const cleanDesc = description.replace(/\.$/, '');
                const meta = inferMetadata(cliKey, title, cleanDesc, currentCategory);
                data[currentCategory].push({
                    title,
                    url,
                    cliKey,
                    meta
                });
            }
        }
    }

    // Generate output
    let out = '# React Bits Design & Visual Catalog\n\n';
    out += '> Structured UI/UX composition catalog for Claude Code. Maps React Bits components to visual properties, motion dynamics, interaction models, performance footprints, DOSSIER roles, cyber-terminal compatibility, and composition anti-patterns.\n\n';
    out += '### CLI Installation Conventions\n';
    out += '- **shadcn:** `npx shadcn@latest add https://reactbits.dev/r/<ComponentKey>-TS-TW` (replace `TS`/`TW` with `JS`/`CSS` if needed)\n';
    out += '- **jsrepo:** `npx jsrepo@latest add https://reactbits.dev/r/<ComponentKey>-TS-TW`\n\n';
    out += '---\n\n';

    let total = 0;
    for (const [cat, items] of Object.entries(data)) {
        if (!items.length) continue;
        total += items.length;
        out += `## ${cat} (${items.length})\n\n`;
        out += '```yaml\n';
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            out += formatYaml(item.cliKey, item.meta);
            if (i < items.length - 1) {
                out += '\n';
            }
        }
        out += '```\n\n';
    }

    await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
    await fs.writeFile(OUTPUT_FILE, out, 'utf-8');
    console.log(`Successfully generated structured composition catalog with ${total} components!`);
    console.log(`Saved to: ${OUTPUT_FILE}`);
}

run().catch(console.error);