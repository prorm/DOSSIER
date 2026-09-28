'use client';

/**
 * SpotlightCard — adapted from React Bits (reactbits.dev, "SpotlightCard-TS-TW").
 *
 * DOSSIER changes:
 *  - No React state on pointermove: position is written to CSS variables inside
 *    a rAF, so hovering a grid of 20 cards never triggers re-render storms.
 *  - Effect only on fine pointers (desktop); touch devices get the static card.
 *  - Keyboard focus-within lights the card from the centre (focus is visible
 *    without a mouse). Reduced motion: no fade transition.
 *  - Unstyled shell: DOSSIER composites own borders, radius and padding.
 */
import React, { useCallback, useRef } from 'react';

import { cn } from '@/lib/utils';

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Any CSS colour; defaults to the event accent at low alpha. */
  spotlightColor?: string;
  /** Radius of the light in px. */
  size?: number;
}

const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className,
  spotlightColor = 'color-mix(in srgb, var(--accent) 16%, transparent)',
  size = 320,
  style,
  ...rest
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--sx', `${clientX - r.left}px`);
      el.style.setProperty('--sy', `${clientY - r.top}px`);
    });
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className={cn('group/spot relative isolate overflow-hidden', className)}
      style={{ ...style, ['--spot' as string]: spotlightColor, ['--spot-size' as string]: `${size}px` }}
      {...rest}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 ease-out motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:group-hover/spot:opacity-100"
        style={{
          background:
            'radial-gradient(var(--spot-size) circle at var(--sx, 50%) var(--sy, 50%), var(--spot), transparent 72%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-200 group-has-[:focus-visible]/spot:opacity-100"
        style={{ background: 'radial-gradient(90% 70% at 50% 50%, var(--spot), transparent 75%)' }}
      />
      {children}
    </div>
  );
};

export default SpotlightCard;
