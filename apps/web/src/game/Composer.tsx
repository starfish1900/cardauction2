import { rankOf, type CardId, type Column, type Move } from '@cardauction/engine';
import type { WireView } from '@cardauction/protocol';
import { AnimatePresence, motion, useAnimate } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CardFace } from '../cards/CardFace';
import { CardText, SuitIcon } from '../ui/SuitIcon';
import type { CardSizes } from '../ui/hooks';
import { Clock } from './Clock';
import { EMPTY, type Analysis, type Selection } from './compose';
import { pad2, withNodes } from './text';

interface Props {
  readonly view: WireView;
  readonly analysis: Analysis;
  readonly selection: Selection;
  readonly sizes: CardSizes;
  readonly onSelect: (selection: Selection) => void;
  readonly onColumn: (column: Column) => void;
  /** Sends a move; resolves to true when the server accepted it. */
  readonly onSend: (move: Move) => Promise<boolean>;
}

const MARK = '\u0000';

/** Where the turn is composed: the chosen cards, what is still missing, why it is not legal yet. */
export function Composer({ view, analysis, selection, sizes, onSelect, onColumn, onSend }: Props) {
  const { t } = useTranslation();
  // The version a move was sent from: Confirm stays locked until the answer or the next view.
  const [sentFrom, setSentFrom] = useState<number | null>(null);
  const sending = sentFrom === view.version;
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const name = view.opponent.nickname;
  const myTurn = analysis.mode !== 'watch';
  // The table hands over: a short pop when the turn comes to this player.
  const [panel, pop] = useAnimate<HTMLElement>();
  useEffect(() => {
    if (myTurn && panel.current) {
      void pop(panel.current, { scale: [1, 1.015, 1] }, { duration: 0.45, ease: 'easeOut' });
    }
  }, [myTurn, panel, pop]);
  const slotWidth = Math.max(34, Math.round(sizes.board * 1.1));

  const send = async (move: Move | null): Promise<void> => {
    if (sending) return;
    if (!move) {
      // Not ready: say so where the player is looking.
      void animate(scope.current, { x: [0, -9, 9, -6, 6, -2, 0] }, { duration: 0.42 });
      return;
    }
    setSentFrom(view.version);
    const ok = await onSend(move);
    if (!ok) setSentFrom(null);
  };

  const unselect = (id: CardId): void => {
    onSelect({
      ...selection,
      tens: selection.tens === id ? null : selection.tens,
      units: selection.units === id ? null : selection.units,
      action: selection.action?.card === id ? null : selection.action,
      take: selection.take === id ? null : selection.take,
      give: selection.give === id ? null : selection.give,
    });
  };

  const slot = (label: string, id: CardId | null, extra?: ReactNode, key = label) => (
    <div
      className={`slot ${id === null ? 'slot--empty' : ''} ${extra ? 'slot--extra' : ''}`}
      key={key}
    >
      <div className="slot-row">
        <div className="slot-box" style={{ width: slotWidth, height: Math.round(slotWidth * 1.4) }}>
          <AnimatePresence mode="popLayout" initial={false}>
            {id !== null && (
              <motion.button
                key={id}
                type="button"
                className="slot-card"
                initial={{ scale: 0.5, opacity: 0, y: 14 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                onClick={() => unselect(id)}
                aria-label={`${label}: ${t('compose.clear')}`}
                disabled={sending}
              >
                <CardFace id={id} compact />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        {extra}
      </div>
      <span className="slot-label">{label}</span>
    </div>
  );

  let status: ReactNode;
  let tone: 'info' | 'ok' | 'error' | 'wait' = 'info';
  if (view.status === 'starting') {
    status = t('game.starting', { name });
    tone = 'wait';
  } else if (!myTurn) {
    status =
      view.phase === 'exchange' ? t('game.exchangeTheirs', { name }) : t('compose.wait', { name });
    tone = 'wait';
  } else if (analysis.mode === 'exchange') {
    status =
      selection.give !== null && selection.take !== null
        ? withNodes(t('compose.exchangeReady', { give: MARK, take: MARK }), [
            <CardText key="g" id={selection.give} />,
            <CardText key="t" id={selection.take} />,
          ])
        : selection.give !== null || selection.take !== null
          ? t('compose.exchangePick')
          : t('compose.exchange');
  } else {
    switch (analysis.stage) {
      case 'pickDigits':
        status = analysis.firstBid
          ? `${t('compose.pickDigits')} ${t('compose.firstBid')}`
          : t('compose.pickDigits');
        break;
      case 'pickColumn':
        status = t('compose.pickColumn');
        break;
      case 'pickTake':
        status = t('compose.pickTake');
        break;
      case 'ready':
        status = t('compose.ready', { value: pad2(analysis.value ?? 0), step: analysis.step ?? 0 });
        tone = 'ok';
        break;
      case 'invalid':
        status = errorText(analysis, t);
        tone = 'error';
        break;
      case 'watch':
      case 'exchange':
        status = null;
    }
  }

  const anything =
    selection.action !== null ||
    selection.tens !== null ||
    selection.units !== null ||
    selection.take !== null ||
    selection.give !== null;

  return (
    <section
      ref={panel}
      className={`panel composer ${myTurn ? 'composer--active' : ''}`}
      aria-label={myTurn ? t('game.yourTurn') : t('game.theirTurn', { name })}
      data-testid="composer"
      data-stage={analysis.stage}
    >
      <div className="composer-main" ref={scope}>
        {analysis.mode === 'exchange' && (
          <div className="slots">
            {slot(t('compose.give'), selection.give)}
            <span className="slot-sep" aria-hidden="true">
              ⇄
            </span>
            {slot(t('compose.take'), selection.take)}
          </div>
        )}
        {analysis.mode === 'bid' && (
          <div className="slots">
            {slot(
              t('compose.action'),
              selection.action?.card ?? null,
              selection.action && (
                <div className="column-toggle" role="group" aria-label={t('compose.action')}>
                  {([1, 4] as const).map((column) => (
                    <button
                      key={column}
                      type="button"
                      className={`chip ${selection.action?.column === column ? 'chip--on' : ''}`}
                      aria-pressed={selection.action?.column === column}
                      disabled={!analysis.columns.includes(column) || sending}
                      onClick={() => onColumn(column)}
                      data-testid={`column-${column}`}
                    >
                      {column === 1 ? t('compose.plus') : t('compose.minus')}
                    </button>
                  ))}
                </div>
              ),
            )}
            {slot(t('compose.tens'), selection.tens)}
            <button
              type="button"
              className="swap-digits"
              onClick={() =>
                onSelect({ ...selection, tens: selection.units, units: selection.tens })
              }
              disabled={(selection.tens === null && selection.units === null) || sending}
              aria-label={t('compose.swapDigits')}
              title={t('compose.swapDigits')}
            >
              ⇄
            </button>
            {slot(t('compose.units'), selection.units)}
            <BidValue analysis={analysis} selection={selection} />
            {view.table.length > 0 && slot(t('compose.take'), selection.take)}
          </div>
        )}
        <p
          className={`composer-status composer-status--${tone}`}
          aria-live="polite"
          data-testid="status"
        >
          {tone === 'wait' && <span className="dots" aria-hidden="true" />}
          {status}
        </p>
      </div>

      {myTurn && (
        <div className="composer-actions">
          {analysis.mode === 'exchange' ? (
            <>
              <button
                type="button"
                className="btn"
                disabled={sending}
                onClick={() => void send({ type: 'pass' })}
                data-testid="pass"
              >
                {t('compose.pass')}
              </button>
              <button
                type="button"
                className={`btn btn--primary ${analysis.move ? '' : 'btn--waiting'}`}
                aria-disabled={!analysis.move || sending}
                onClick={() => void send(analysis.move)}
                data-testid="confirm"
              >
                {sending ? t('compose.sending') : t('compose.swap')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!anything || sending}
                onClick={() => onSelect(EMPTY)}
              >
                {t('compose.clear')}
              </button>
              <button
                type="button"
                className={`btn btn--primary ${analysis.stage === 'ready' ? 'btn--ready' : 'btn--waiting'}`}
                aria-disabled={analysis.stage !== 'ready' || sending}
                onClick={() => void send(analysis.stage === 'ready' ? analysis.move : null)}
                data-testid="confirm"
              >
                {sending ? t('compose.sending') : t('compose.confirm')}
              </button>
            </>
          )}
          <Clock deadline={view.turnDeadline} />
        </div>
      )}
    </section>
  );
}

/** The number being composed: two digits, filled in as the cards are chosen. */
function BidValue({ analysis, selection }: { analysis: Analysis; selection: Selection }) {
  const tens = selection.tens === null ? '·' : String(rankOf(selection.tens));
  const units = selection.units === null ? '·' : String(rankOf(selection.units));
  const tone = analysis.stage === 'ready' ? 'ok' : analysis.stage === 'invalid' ? 'error' : 'open';
  return (
    <div className={`bid-value bid-value--${tone}`} aria-hidden="true">
      <span className="bid-value-eq">=</span>
      <motion.span
        key={`${tens}${units}`}
        className="bid-value-number"
        initial={{ scale: 1.25, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      >
        {tens}
        {units}
      </motion.span>
      {analysis.stage === 'ready' && analysis.step !== null && (
        <motion.span
          className="bid-value-step"
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
        >
          +{analysis.step}
        </motion.span>
      )}
    </div>
  );
}

function errorText(analysis: Analysis, t: ReturnType<typeof useTranslation>['t']): ReactNode {
  switch (analysis.error) {
    case 'NO_NEW_COLOR':
      return withNodes(t('compose.errors.NO_NEW_COLOR', { suits: MARK }), [
        <span key="suits" className="suits">
          {analysis.oldSuits.map((suit) => (
            <SuitIcon key={suit} suit={suit} light size="1.05em" />
          ))}
        </span>,
      ]);
    case 'OUT_OF_RANGE':
      return t('compose.errors.OUT_OF_RANGE', {
        value: pad2(analysis.value ?? 0),
        from: pad2(analysis.window.from),
        to: pad2(analysis.window.to),
      });
    case 'TABLE_CARD_REQUIRED':
    case 'ONE_TABLE_CARD_ONLY':
    case 'TABLE_CARD_NOT_ALLOWED':
    case 'TAKE_NOT_ON_TABLE':
    case 'TAKE_NOT_ALLOWED':
      return t(`compose.errors.${analysis.error}`);
    case null:
      return null;
    // Moves the composer cannot build, or checks the stages already cover.
    case 'GAME_OVER':
    case 'NOT_YOUR_TURN':
    case 'WRONG_PHASE':
    case 'NOT_A_CARD':
    case 'DUPLICATE_CARD':
    case 'NOT_A_DIGIT':
    case 'NOT_AN_ACTION':
    case 'BAD_COLUMN':
    case 'CARD_NOT_IN_HAND':
    case 'CARD_NOT_ON_TABLE':
    case 'SAME_SUIT':
    case 'TAKE_REQUIRED':
      return t('compose.errors.other', { code: analysis.error });
  }
}
