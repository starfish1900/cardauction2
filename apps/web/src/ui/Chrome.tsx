import { TIMING } from '@cardauction/protocol';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import i18n, { toggleLanguage } from '../i18n';
import { api, reconnect } from '../net/connection';
import { actions, useStore, type Notice } from '../state/store';
import { Dialog, Switch } from './controls';
import { useNow } from './hooks';
import { Logo } from './Logo';

/** The screen shown under the rules dialog (the rules open over any screen). */
export function useBaseScreen() {
  return useStore((s) => (s.screen === 'rules' ? s.returnTo : s.screen));
}

export function Header() {
  const { t } = useTranslation();
  const base = useBaseScreen();
  const game = useStore((s) => s.game);
  const assistSetting = useStore((s) => s.assist);
  const connection = useStore((s) => s.connection);
  const [confirming, setConfirming] = useState(false);
  const inGame = base === 'game' && game !== null;
  const live = inGame && game.view.status !== 'over';
  const assist = assistSetting ?? game?.view.opponent.isAI ?? false;
  const close = useCallback(() => setConfirming(false), []);

  return (
    <header className={`topbar ${inGame ? 'topbar--game' : ''}`}>
      <div className="brand">
        <Logo size={30} />
        <span className="brand-name">CardAuction</span>
        <span
          className={`conn conn--${connection}`}
          role="img"
          aria-label={connection}
          title={connection}
        />
      </div>
      <nav className="top-actions">
        {live && (
          <Switch
            checked={assist}
            onChange={(on) => actions.setAssist(on)}
            label={t('menu.assist')}
            hint={t('menu.assistHint')}
          />
        )}
        <button
          type="button"
          className="top-btn"
          onClick={() => actions.show('rules')}
          title={t('menu.rules')}
        >
          <span aria-hidden="true" className="top-icon">
            ?
          </span>
          <span className="top-label">{t('menu.rules')}</span>
        </button>
        <button
          type="button"
          className="top-btn"
          onClick={toggleLanguage}
          aria-label={t('menu.language')}
          title={t('menu.language')}
          data-testid="language"
        >
          {t('menu.languageShort')}
        </button>
        {live && (
          <button
            type="button"
            className="top-btn top-btn--danger"
            onClick={() => setConfirming(true)}
            data-testid="resign"
          >
            {t('menu.resign')}
          </button>
        )}
      </nav>
      <Dialog
        open={confirming && live}
        onClose={close}
        labelledBy="resign-title"
        className="confirm"
      >
        <h2 id="resign-title">{t('menu.resignConfirm')}</h2>
        <div className="dialog-foot">
          <button type="button" className="btn" onClick={close}>
            {t('menu.no')}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              close();
              if (game) void api.resign(game.gameId);
            }}
            data-testid="resign-confirm"
          >
            {t('menu.yes')}
          </button>
        </div>
      </Dialog>
    </header>
  );
}

/** Connection trouble, under the header: the server waking up, or a lost connection. */
export function ConnectionBanner() {
  const { t } = useTranslation();
  const connection = useStore((s) => s.connection);
  const everConnected = useStore((s) => s.everConnected);
  const offlineSince = useStore((s) => s.offlineSince);
  const live = useStore(
    (s) =>
      s.game !== null &&
      s.game.view.status !== 'over' &&
      (s.screen === 'game' || s.returnTo === 'game'),
  );
  const now = useNow(500);
  const [loadedAt] = useState(() => Date.now());

  let text: string | null = null;
  let tone = 'info';
  if (connection === 'connecting' && !everConnected) {
    text = now - loadedAt > 5000 ? t('notice.wakeUp') : null;
  } else if (connection === 'offline') {
    tone = 'warn';
    const seconds = Math.max(0, Math.ceil(((offlineSince ?? now) + TIMING.graceMs - now) / 1000));
    text = live ? t('notice.reconnecting', { seconds }) : t('notice.reconnectingLobby');
  }
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          className={`banner banner--${tone}`}
          role="status"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          data-testid="banner"
        >
          <span className="dots" aria-hidden="true" />
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function noticeText(notice: Notice, t: TFunction): string {
  switch (notice.kind) {
    case 'update':
      return t('notice.update');
    case 'restarting':
      return t('notice.restarting');
    case 'cancelled':
      return t('notice.cancelled');
    case 'serverError':
      return t('notice.serverError');
    case 'requeued':
      return t('notice.requeued');
    case 'codeExpired':
      return t('notice.codeExpired', { code: notice.params?.code ?? '' });
    case 'forfeitWarning':
      return t('notice.backgroundWarning');
    case 'replaced':
      return t('notice.replaced');
    case 'ended': {
      const ended = notice.ended;
      const outcome =
        !ended || ended.winner === null ? 'none' : ended.winner === ended.seat ? 'win' : 'lose';
      return t('home.ended', { outcome: t(`home.outcome.${outcome}`) });
    }
    case 'error': {
      const code = String(notice.code ?? '');
      return i18n.exists(`notice.errors.${code}`)
        ? t(`notice.errors.${code}`)
        : t('notice.errors.other', { code });
    }
  }
}

/** One message at a time, at the top; most fade out by themselves. */
export function Toasts() {
  const { t } = useTranslation();
  const notice = useStore((s) => s.notice);
  useEffect(() => {
    if (!notice || notice.kind === 'update') return;
    const timer = setTimeout(
      () => {
        if (useStore.getState().notice?.id === notice.id) actions.dismiss();
      },
      notice.kind === 'error' || notice.kind === 'forfeitWarning' ? 6000 : 9000,
    );
    return () => clearTimeout(timer);
  }, [notice]);
  const tone =
    notice?.kind === 'error' || notice?.kind === 'serverError'
      ? 'error'
      : notice?.kind === 'forfeitWarning' || notice?.kind === 'restarting'
        ? 'warn'
        : 'info';
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {notice && notice.kind !== 'replaced' && (
          <motion.div
            key={notice.id}
            className={`toast toast--${tone}`}
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            data-testid="toast"
            data-kind={notice.kind}
          >
            <span className="toast-text">{noticeText(notice, t)}</span>
            {notice.kind === 'update' && (
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={() => window.location.reload()}
              >
                {t('notice.reload')}
              </button>
            )}
            <button
              type="button"
              className="toast-close"
              onClick={() => actions.dismiss()}
              aria-label={t('menu.close')}
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Another tab took over the session: offer to take it back. */
export function ReplacedOverlay() {
  const { t } = useTranslation();
  const replaced = useStore((s) => s.connection === 'replaced');
  const noop = useCallback(() => {}, []);
  return (
    <Dialog open={replaced} onClose={noop} labelledBy="replaced-title" className="confirm">
      <h2 id="replaced-title">{t('notice.replaced')}</h2>
      <div className="dialog-foot">
        <button type="button" className="btn btn--primary" onClick={reconnect}>
          {t('notice.playHere')}
        </button>
      </div>
    </Dialog>
  );
}
