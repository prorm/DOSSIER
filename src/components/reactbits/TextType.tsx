'use client';

/**
 * TextType — adapted from React Bits (reactbits.dev, "TextType-TS-TW").
 *
 * DOSSIER changes:
 *  - Single-pass reveal (story/evidence typewriter), no delete loop.
 *  - Dropped the GSAP dependency: the caret blinks with a CSS keyframe.
 *  - A click/tap completes instantly — players never wait on an effect.
 *  - The whole reveal is capped (~1.8s) regardless of length: long text types
 *    in larger chunks.
 *  - The full text is exposed to assistive tech up-front (sr-only); the typing
 *    layer is aria-hidden. Reduced motion: the full text renders immediately.
 *  - Typed per grapheme, so emoji and combined characters never split.
 */
import { useReducedMotion } from 'motion/react';
import { createElement, useEffect, useMemo, useRef, useState, type ElementType } from 'react';

import { cn } from '@/lib/utils';

interface TextTypeProps {
  text: string;
  as?: ElementType;
  className?: string;
  /** ms per tick */
  typingSpeed?: number;
  initialDelay?: number;
  /** Upper bound for the whole reveal (ms). */
  maxDurationMs?: number;
  showCursor?: boolean;
  cursorCharacter?: string;
  cursorClassName?: string;
  startOnVisible?: boolean;
  /** Hide the caret once finished. */
  hideCursorOnDone?: boolean;
  onDone?: () => void;
}

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (s: string) => (segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s));

export default function TextType({
  text,
  as = 'p',
  className,
  typingSpeed = 22,
  initialDelay = 150,
  maxDurationMs = 1800,
  showCursor = true,
  cursorCharacter = '▌',
  cursorClassName,
  startOnVisible = true,
  hideCursorOnDone = true,
  onDone,
}: TextTypeProps) {
  const reduce = useReducedMotion();
  const chars = useMemo(() => graphemes(text), [text]);
  const [count, setCount] = useState(0);
  const [visible, setVisible] = useState(!startOnVisible);
  const ref = useRef<HTMLElement>(null);
  const done = Boolean(reduce) || count >= chars.length;
  const step = Math.max(1, Math.ceil(chars.length / Math.max(1, maxDurationMs / typingSpeed)));

  useEffect(() => {
    if (!startOnVisible || !ref.current) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { threshold: 0.1 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [startOnVisible]);

  useEffect(() => {
    setCount(0);
  }, [text]);

  useEffect(() => {
    if (!visible || done) return;
    const t = setTimeout(() => setCount((c) => Math.min(chars.length, c + step)), count === 0 ? initialDelay : typingSpeed);
    return () => clearTimeout(t);
  }, [visible, done, count, chars.length, typingSpeed, initialDelay, step]);

  useEffect(() => {
    if (done && chars.length) onDone?.();
  }, [done]);

  return createElement(
    as,
    {
      ref,
      className: cn('whitespace-pre-wrap', !done && 'cursor-pointer', className),
      onClick: done ? undefined : () => setCount(chars.length),
    },
    <span key="sr" className="sr-only">
      {text}
    </span>,
    <span key="vis" aria-hidden="true">
      {done ? text : chars.slice(0, count).join('')}
    </span>,
    showCursor && !(done && hideCursorOnDone) ? (
      <span key="caret" aria-hidden="true" className={cn('ml-0.5 inline-block animate-blink text-signal', cursorClassName)}>
        {cursorCharacter}
      </span>
    ) : null,
  );
}
