import type { CardId } from '@cardauction/engine';
import type { WireView } from '@cardauction/protocol';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../cards/Card';
import { useServerNow, type CardSizes } from '../ui/hooks';
import { Clock } from './Clock';
import { LAYOUT_TRANSITION, type CardMotion } from './motion';

interface Props {
  readonly view: WireView;
  readonly sizes: CardSizes;
  readonly enter: (id: CardId, order: number) => CardMotion;
  readonly label: (id: CardId | null) => string;
}

/** The opponent: name, cards in hand (backs), cards known to be there, presence and clock. */
export function OpponentBar({ view, sizes, enter, label }: Props) {
  const { t } = useTranslation();
  const now = useServerNow();
  const opponent = view.opponent;
  const over = view.status === 'over' && view.result !== null;
  const theirTurn = view.status === 'playing' && view.toMove === opponent.seat;
  const away =
    !opponent.connected && opponent.graceDeadline !== null
      ? Math.max(0, Math.ceil((opponent.graceDeadline - now) / 1000))
      : null;
  const hidden = Math.max(0, opponent.handCount - opponent.known.length);
  const finalHand = over ? (view.result?.hands[opponent.seat] ?? []) : [];

  // At the end, the hidden cards turn face up one by one.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!over) return;
    const timer = setTimeout(() => setRevealed(true), 350);
    return () => clearTimeout(timer);
  }, [over]);

  return (
    <section
      className={`panel opponent ${theirTurn ? 'panel--active' : ''}`}
      aria-label={opponent.nickname}
      data-testid="opponent"
    >
      <div className="who">
        <div className={`avatar ${opponent.isAI ? 'avatar--ai' : ''}`} aria-hidden="true">
          {opponent.isAI ? '◆' : opponent.nickname.slice(0, 1).toUpperCase()}
        </div>
        <div className="who-text">
          <div className="who-name">
            {opponent.nickname}
            <span className="seat-tag">{opponent.seat}</span>
          </div>
          <div className="who-sub">
            {t('game.cards', { count: opponent.handCount })}
            {away !== null && (
              <span className="pill pill--warn" role="status" data-testid="away">
                {t('game.away', { seconds: away })}
              </span>
            )}
            {away === null && theirTurn && (
              <span className="pill pill--turn">
                {opponent.isAI
                  ? t('game.thinking')
                  : t('game.theirTurn', { name: opponent.nickname })}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="opponent-cards">
        {over ? (
          finalHand.map((id, i) => (
            <Card
              key={id}
              layoutId={`c${id}`}
              id={id}
              width={sizes.known}
              faceDown={!revealed && !opponent.known.includes(id)}
              flipDelay={i * 0.09}
              label={label(id)}
              zone="opponent"
              transition={LAYOUT_TRANSITION}
            />
          ))
        ) : (
          <>
            <div className="backs" aria-label={t('game.cards', { count: hidden })}>
              <AnimatePresence initial={false}>
                {Array.from({ length: hidden }, (_, i) => (
                  <motion.div
                    key={i}
                    className="back-slot"
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 30, scale: 0.8 }}
                    transition={{ duration: 0.35 }}
                  >
                    <Card id={null} width={sizes.back} label={label(null)} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {opponent.known.length > 0 && (
              <div className="known">
                <span className="known-label">{t('game.known')}</span>
                {opponent.known.map((id, i) => {
                  const m = enter(id, i);
                  return (
                    <Card
                      key={id}
                      layoutId={`c${id}`}
                      id={id}
                      width={sizes.known}
                      label={label(id)}
                      zone="opponent"
                      initial={m.initial}
                      animate={m.animate}
                      transition={{ ...LAYOUT_TRANSITION, ...m.transition }}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <div className="opponent-clock">{theirTurn && <Clock deadline={view.turnDeadline} />}</div>
    </section>
  );
}
