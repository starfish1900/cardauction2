import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect } from 'react';

const mod100 = (n: number): number => ((n % 100) + 100) % 100;
const pad2 = (n: number): string => String(mod100(Math.round(n))).padStart(2, '0');

/**
 * A two-digit number that counts to its new value, upwards and through 99 → 00 like the auction
 * itself (an action card's −10 counts down). `from` is where a newly shown number starts.
 */
export function AnimatedNumber({
  value,
  from,
  className,
}: {
  value: number;
  from?: number | undefined;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(from ?? value);
  const text = useTransform(motionValue, pad2);
  useEffect(() => {
    // Counts from wherever the number is shown now, even halfway through another count.
    const current = motionValue.get();
    const up = mod100(value - Math.round(current));
    if (up === 0) {
      motionValue.set(value);
      return;
    }
    if (reduce) {
      motionValue.set(value);
      return;
    }
    const target = current + (up <= 50 ? up : up - 100);
    const controls = animate(motionValue, target, { duration: 0.7, ease: 'easeOut' });
    return () => controls.stop();
  }, [value, motionValue, reduce]);
  return <motion.span className={className}>{text}</motion.span>;
}
