import { actionId, digitId, type CardId } from '@cardauction/engine';
import { useTranslation } from 'react-i18next';
import { Card } from '../cards/Card';
import { actions, useStore } from '../state/store';
import { Dialog } from '../ui/controls';
import { useCardLabel } from '../game/text';

function Bid({
  cards,
  value,
  tone,
}: {
  cards: readonly CardId[];
  value: string;
  tone?: 'ok' | 'no';
}) {
  const label = useCardLabel();
  return (
    <div className={`example-bid ${tone ? `example-bid--${tone}` : ''}`}>
      {cards.map((id) => (
        <Card key={id} id={id} width={40} label={label(id)} />
      ))}
      <span className="example-value">= {value}</span>
      {tone && (
        <span className="example-mark" aria-hidden="true">
          {tone === 'ok' ? '✓' : '✗'}
        </span>
      )}
    </div>
  );
}

/** The video tutorial: every rule, then how to play in the app (8½ minutes, in English). */
export const TUTORIAL_URL = 'https://youtu.be/rnim6YZoadw';

/** How to play, over whatever screen it was opened from. */
export function Rules() {
  const { t } = useTranslation();
  const open = useStore((s) => s.screen === 'rules');
  const close = (): void => actions.show(useStore.getState().returnTo);
  const items = t('rules.items', { returnObjects: true }) as unknown as readonly string[];
  return (
    <Dialog open={open} onClose={close} labelledBy="rules-title" className="rules">
      <header className="dialog-head">
        <h2 id="rules-title">{t('rules.title')}</h2>
        <button type="button" className="icon-btn" onClick={close} aria-label={t('menu.close')}>
          ×
        </button>
      </header>
      <div className="dialog-body">
        <p className="rules-goal">{t('rules.goal')}</p>
        <a
          className="btn tutorial-btn"
          href={TUTORIAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="tutorial"
        >
          <svg className="tutorial-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="11" />
            <path d="M9.8 7.4 L16.6 12 L9.8 16.6 Z" />
          </svg>
          <span className="tutorial-text">
            <span className="tutorial-title">{t('rules.tutorial')}</span>
            <span className="tutorial-note">{t('rules.tutorialNote')}</span>
          </span>
        </a>
        <ol className="rules-list">
          {items.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ol>
        <section className="example" aria-label={t('rules.example')}>
          <h3>{t('rules.example')}</h3>
          <p className="muted">{t('rules.latest')}</p>
          <Bid cards={[digitId(3, 5), digitId(4, 8)]} value="58" />
          <p>{t('rules.legal')}</p>
          <Bid cards={[digitId(4, 6), digitId(0, 3)]} value="63" tone="ok" />
          <p>{t('rules.illegal')}</p>
          <Bid cards={[digitId(3, 6, 1), digitId(4, 3)]} value="63" tone="no" />
          <p>{t('rules.action')}</p>
          <div className="example-bid">
            <Card id={actionId(0)} width={40} label={t('card.action')} />
            <span className="example-value">58 → 48</span>
          </div>
        </section>
      </div>
      <footer className="dialog-foot">
        <button type="button" className="btn btn--primary" onClick={close}>
          {t('rules.back')}
        </button>
      </footer>
    </Dialog>
  );
}
