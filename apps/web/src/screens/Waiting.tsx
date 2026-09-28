import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../cards/Card';
import { api } from '../net/connection';
import { useStore } from '../state/store';
import { Dots } from '../ui/controls';
import { useServerNow } from '../ui/hooks';

/** Three cards shuffling over and over while the lobby looks for an opponent. */
function Shuffle() {
  return (
    <div className="shuffle" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="shuffle-card"
          animate={{
            x: [0, (i - 1) * 46, 0, (1 - i) * 30, 0],
            y: [0, -10 - i * 4, 0, -6, 0],
            rotate: [(i - 1) * 6, (i - 1) * 16, (1 - i) * 8, (i - 1) * 4, (i - 1) * 6],
            zIndex: [i, 3 - i, i, 3 - i, i],
          }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12 }}
        >
          <Card id={null} width={54} />
        </motion.div>
      ))}
    </div>
  );
}

export function Queue() {
  const { t } = useTranslation();
  const queue = useStore((s) => s.queue);
  const now = useServerNow(1000);
  const seconds = queue ? Math.max(0, Math.floor((now - queue.since) / 1000)) : 0;
  const [busy, setBusy] = useState(false);
  return (
    <div className="screen center" data-testid="queue">
      <motion.section
        className="panel screen-card"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <Shuffle />
        <h2>{t('queue.searching')}</h2>
        <p className="muted">{t('queue.waited', { seconds })}</p>
        {queue?.aiOffered && (
          <motion.div
            className="offer"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
          >
            <p>{t('queue.aiOffer')}</p>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void api.aiStart('medium', 'random').finally(() => setBusy(false));
              }}
            >
              {t('queue.playAi')}
            </button>
          </motion.div>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => void api.quickLeave()}>
          {t('queue.cancel')}
        </button>
      </motion.section>
    </div>
  );
}

export function Host() {
  const { t } = useTranslation();
  const code = useStore((s) => s.privateCode);
  const now = useServerNow(1000);
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  const link = `${window.location.origin}/join/${code.code}`;
  const minutes = Math.max(1, Math.ceil((code.expiresAt - now) / 60_000));
  const share = typeof navigator.share === 'function';

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused: the link is selectable in the field.
    }
  };

  return (
    <div className="screen center" data-testid="host">
      <motion.section
        className="panel screen-card"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <h2>{t('host.title')}</h2>
        <p>{t('host.share')}</p>
        <div className="code-display" aria-label={code.code} data-testid="private-code">
          {[...code.code].map((ch, i) => (
            <motion.span
              key={`${i}${ch}`}
              className="code-char"
              initial={{ rotateX: 90, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.07, type: 'spring', stiffness: 300, damping: 20 }}
            >
              {ch}
            </motion.span>
          ))}
        </div>
        <div className="input-row link-row">
          <input
            className="input"
            readOnly
            value={link}
            aria-label="link"
            onFocus={(event) => event.target.select()}
          />
          <button type="button" className="btn" onClick={() => void copy()}>
            {copied ? t('host.copied') : t('host.copy')}
          </button>
          {share && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                void navigator.share({ url: link, title: 'CardAuction' }).catch(() => {})
              }
            >
              {t('host.shareLink')}
            </button>
          )}
        </div>
        <p className="muted">{t('host.expires', { count: minutes })}</p>
        <p className="waiting">
          <Dots />
          {t('host.waiting')}
        </p>
        <button type="button" className="btn btn--ghost" onClick={() => void api.cancelPrivate()}>
          {t('host.cancel')}
        </button>
      </motion.section>
    </div>
  );
}
