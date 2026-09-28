'use client';

/**
 * CountUp — adapted from React Bits (reactbits.dev, "CountUp-TS-TW").
 *
 * DOSSIER changes:
 *  - Animates from the *previous* value when `to` changes (live score updates),
 *    instead of snapping back to `from` and replaying.
 *  - Server-renders the final number (no empty span before hydration; correct
 *    for screen readers and no-JS). Screen readers get the settled value only.
 *  - Reduced motion: jumps straight to the value.
 */
import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';

interface CountUpProps {
  to: number;
  from?: number;
  /** Seconds. */
  duration?: number;
  delay?: number;
  className?: string;
  separator?: string;
  /** Prefix a + sign for positive values (score deltas). */
  signed?: boolean;
  startWhen?: boolean;
  onEnd?: () => void;
}

function format(n: number, separator: string, signed: boolean) {
  const rounded = Math.round(n);
  const s = new Intl.NumberFormat('en-US', { useGrouping: Boolean(separator) }).format(Math.abs(rounded)).replace(/,/g, separator);
  const sign = rounded < 0 ? '−' : signed && rounded > 0 ? '+' : '';
  return sign + s;
}

export default function CountUp({
  to,
  from,
  duration = 1.1,
  delay = 0,
  className = '',
  separator = ',',
  signed = false,
  startWhen = true,
  onEnd,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number>(from ?? to);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !startWhen || !inView) return;
    const start = shown.current;
    if (reduce || start === to) {
      shown.current = to;
      el.textContent = format(to, separator, signed);
      return;
    }
    const controls = animate(start, to, {
      duration,
      delay,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = format(v, separator, signed);
      },
      onComplete: () => {
        shown.current = to;
        onEnd?.();
      },
    });
    return () => controls.stop();
  }, [to, inView, startWhen, reduce, duration, delay, separator, signed, onEnd]);

  return (
    <span className={`num ${className}`} aria-label={format(to, separator, signed)}>
      <span ref={ref} aria-hidden="true">
        {format(from ?? to, separator, signed)}
      </span>
    </span>
  );
}
