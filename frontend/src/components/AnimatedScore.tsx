import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  /** Only true for a row that just transitioned to Completed via a live push. */
  animate: boolean;
}

/**
 * Counts up to the match score when it arrives.
 *
 * The point is not decoration: the score appearing is the *only* visible
 * evidence that the async pipeline completed and pushed a result over SignalR.
 * Without it the number simply materialises during a refetch and the whole
 * event-driven round trip looks identical to an ordinary page load.
 */
export function AnimatedScore({ value, animate }: Props) {
  const [display, setDisplay] = useState(animate ? 0 : value);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Respect a user's reduced-motion preference - and skip the animation
    // entirely for rows that were already complete when the page loaded.
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduceMotion) {
      setDisplay(value);
      return;
    }

    const DURATION_MS = 700;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplay(Math.round(eased * value));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [value, animate]);

  return <>{display}</>;
}
