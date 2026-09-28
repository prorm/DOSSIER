'use client';

/**
 * GlitchText — adapted from React Bits (reactbits.dev, "GlitchText-TS-TW").
 *
 * DOSSIER changes:
 *  - `burst` mode: the glitch runs for `burstMs` then settles to clean text.
 *    Failure feedback must be brief; a looping glitch on a form is hostile.
 *  - RGB split uses DOSSIER magenta/cyan; slices sit on a configurable ground
 *    (`--glitch-bg`) so it works on any surface.
 *  - Inherits font size (no hard-coded clamp()); pseudo-element copies are
 *    presentational, the real text node stays readable by assistive tech.
 *  - Reduced motion: global CSS collapses the animation to a single frame.
 */
import { useEffect, useState, type CSSProperties, type FC } from 'react';

import { cn } from '@/lib/utils';

interface GlitchTextProps {
  children: string;
  speed?: number;
  enableShadows?: boolean;
  /** Only glitch while hovered. */
  enableOnHover?: boolean;
  /** Glitch once for `burstMs`, then rest. Re-triggers when `burstKey` changes. */
  burst?: boolean;
  burstKey?: string | number;
  burstMs?: number;
  className?: string;
  as?: 'span' | 'div' | 'h1' | 'h2' | 'p';
}

const GlitchText: FC<GlitchTextProps> = ({
  children,
  speed = 0.35,
  enableShadows = true,
  enableOnHover = false,
  burst = false,
  burstKey,
  burstMs = 650,
  className,
  as: Tag = 'span',
}) => {
  const [active, setActive] = useState(!burst);

  useEffect(() => {
    if (!burst) return;
    setActive(true);
    const t = setTimeout(() => setActive(false), burstMs);
    return () => clearTimeout(t);
  }, [burst, burstKey, burstMs]);

  const style = {
    '--after-duration': `${speed * 3}s`,
    '--before-duration': `${speed * 2}s`,
    '--after-shadow': enableShadows ? '-2px 0 var(--color-signal-magenta)' : 'none',
    '--before-shadow': enableShadows ? '2px 0 var(--color-signal-cyan)' : 'none',
  } as CSSProperties;

  const running = active && !enableOnHover;
  const pseudo =
    'before:pointer-events-none after:pointer-events-none before:absolute after:absolute before:top-0 after:top-0 before:overflow-hidden after:overflow-hidden before:bg-[var(--glitch-bg,var(--color-surface))] after:bg-[var(--glitch-bg,var(--color-surface))] before:[clip-path:inset(0_0_0_0)] after:[clip-path:inset(0_0_0_0)]';
  const on =
    'after:content-[attr(data-text)] after:left-[2px] after:[text-shadow:var(--after-shadow)] after:animate-glitch-after before:content-[attr(data-text)] before:left-[-2px] before:[text-shadow:var(--before-shadow)] before:animate-glitch-before';
  const hover =
    "before:content-[''] after:content-[''] hover:after:content-[attr(data-text)] hover:after:left-[2px] hover:after:[text-shadow:var(--after-shadow)] hover:after:animate-glitch-after hover:before:content-[attr(data-text)] hover:before:left-[-2px] hover:before:[text-shadow:var(--before-shadow)] hover:before:animate-glitch-before";

  return (
    <Tag
      style={style}
      data-text={children}
      data-glitching={running || undefined}
      className={cn('relative inline-block select-none', pseudo, running && on, enableOnHover && hover, className)}
    >
      {children}
    </Tag>
  );
};

export default GlitchText;
