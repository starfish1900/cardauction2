import type { CardId } from '@cardauction/engine';
import { motion, type HTMLMotionProps } from 'motion/react';
import type { KeyboardEvent } from 'react';
import { CardBack, CardFace } from './CardFace';

/**
 * - selected: part of the move being composed;
 * - playable: assist mode, fits a legal move;
 * - dim: cannot be used now;
 * - fresh: just arrived (a short glow).
 */
export type CardMark = 'selected' | 'playable' | 'dim' | 'fresh';

export interface CardProps extends Omit<HTMLMotionProps<'div'>, 'id' | 'onClick'> {
  /** null: a face-down card whose identity is unknown (the opponent's hand). */
  readonly id: CardId | null;
  readonly width: number;
  readonly faceDown?: boolean;
  /** Large rank and suit only; the default below 56 px wide. */
  readonly compact?: boolean;
  readonly mark?: CardMark | undefined;
  readonly label?: string;
  readonly onPick?: (() => void) | undefined;
  /** Where the card is shown (hand, table, board...), for tests and styling. */
  readonly zone?: string;
  /** Delay before a face-down card turns face up (the end-of-game reveal). */
  readonly flipDelay?: number;
}

/**
 * A card that can travel: give it a layoutId (the card id) and Motion animates it from wherever
 * it was to wherever it is now, so a bid visibly moves from a hand to the board.
 */
export function Card({
  id,
  width,
  faceDown = false,
  compact,
  mark,
  label,
  onPick,
  zone,
  flipDelay = 0,
  className,
  style,
  ...motion_
}: CardProps) {
  const small = compact ?? width < 56;
  const back = faceDown || id === null;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!onPick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onPick();
    }
  };
  return (
    <motion.div
      className={[
        'card',
        mark ? `card--${mark}` : '',
        onPick ? 'card--pick' : '',
        className ?? '',
      ].join(' ')}
      style={{ width, height: Math.round(width * 1.4), ...style }}
      role={onPick ? 'button' : 'img'}
      tabIndex={onPick ? 0 : undefined}
      aria-label={label}
      aria-pressed={onPick ? mark === 'selected' : undefined}
      onClick={onPick}
      onKeyDown={onPick ? onKeyDown : undefined}
      data-card-id={id ?? undefined}
      data-zone={zone}
      {...motion_}
    >
      <motion.div
        className="card-inner"
        initial={false}
        animate={{ rotateY: back ? 180 : 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1], delay: back ? 0 : flipDelay }}
      >
        <div className="card-side card-front">
          {id !== null && <CardFace id={id} compact={small} />}
        </div>
        <div className="card-side card-back">
          <CardBack />
        </div>
      </motion.div>
    </motion.div>
  );
}
