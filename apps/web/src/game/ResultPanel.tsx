import type { WireView } from '@cardauction/protocol';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../net/connection';
import { useServerNow } from '../ui/hooks';
import { outcome } from './text';

interface Props {
  readonly view: WireView;
  /** The opponent asked for a rematch (they are told as soon as it happens). */
  readonly offered: boolean;
}

/** Replaces the composer when the game is over: who won and why, rematch, back to the lobby. */
export function ResultPanel({ view, offered }: Props) {
  const { t } = useTranslation();
  const now = useServerNow(500);
  const { tone, title, reason } = outcome(view, t);
  const [asked, setAsked] = useState(false);
  const rematch = view.rematch;
  const seconds = rematch ? Math.max(0, Math.ceil((rematch.deadline - now) / 1000)) : 0;
  // A person who went back to the lobby (or lost the connection) cannot accept a rematch.
  const left = !view.opponent.isAI && !view.opponent.connected;
  const open = rematch !== null && seconds > 0 && !left;
  const theyAsked = open && !view.opponent.isAI && (offered || rematch.opponent);
  const waiting = open && (asked || rematch.you);

  const ask = async (): Promise<void> => {
    setAsked(true);
    if (!(await api.rematch(view.gameId))) setAsked(false);
  };

  return (
    <motion.section
      className={`panel result result--${tone}`}
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.25 }}
      data-testid="result"
      data-outcome={tone}
    >
      {tone === 'win' && <Confetti />}
      <div className="result-text">
        <motion.h2
          className="result-title"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.45 }}
        >
          {title}
        </motion.h2>
        {reason && <p className="result-reason">{reason}</p>}
      </div>
      <div className="result-actions">
        {theyAsked && !waiting && (
          <motion.span
            className="pill pill--turn"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            {t('result.rematchOffer', { name: view.opponent.nickname })}
          </motion.span>
        )}
        {open ? (
          waiting ? (
            <span className="pill">
              <span className="dots" aria-hidden="true" />
              {t('result.rematchSent', { name: view.opponent.nickname, seconds })}
            </span>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void ask()}
              data-testid="rematch"
              title={t('result.rematchLeft', { seconds })}
            >
              {theyAsked ? t('result.accept') : t('result.rematch')}
              <span className="btn-count">{seconds}</span>
            </button>
          )
        ) : left ? (
          <span className="muted" data-testid="opponent-left">
            {t('result.left', { name: view.opponent.nickname })}
          </span>
        ) : (
          rematch === null &&
          view.result?.reason !== 'abandoned' &&
          view.result?.reason !== 'aborted' && (
            <span className="muted">{t('result.rematchClosed')}</span>
          )
        )}
        <button
          type="button"
          className="btn"
          onClick={() => void api.leave(view.gameId)}
          data-testid="lobby"
        >
          {t('result.lobby')}
        </button>
      </div>
    </motion.section>
  );
}

const COLORS = ['#f3cf7d', '#e5b95a', '#7ee2b8', '#ff8a8a', '#7fb0ff', '#fffdf8'];

/** A short burst of paper, from the result panel upwards. */
function Confetti() {
  const reduce = useReducedMotion();
  const [pieces] = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 520,
      y: -140 - Math.random() * 260,
      rotate: (Math.random() - 0.5) * 720,
      delay: 0.35 + Math.random() * 0.25,
      color: COLORS[i % COLORS.length] ?? '#f3cf7d',
      wide: Math.random() > 0.5,
    })),
  );
  if (reduce) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="confetti-piece"
          style={{ background: p.color, width: p.wide ? 10 : 6, height: p.wide ? 6 : 10 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 220], opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{
            duration: 2.2,
            delay: p.delay,
            ease: ['easeOut', 'easeIn'],
            times: [0, 0.45, 1],
          }}
        />
      ))}
    </div>
  );
}
