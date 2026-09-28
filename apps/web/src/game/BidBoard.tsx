import { columnShift, mod100, type CardId, type Column } from '@cardauction/engine';
import type { WireBidRow, WireView } from '@cardauction/protocol';
import { motion } from 'motion/react';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../cards/Card';
import { CardFace } from '../cards/CardFace';
import { SuitIcon } from '../ui/SuitIcon';
import type { CardSizes } from '../ui/hooks';
import { AnimatedNumber } from './AnimatedNumber';
import type { Analysis, Selection } from './compose';
import { LAYOUT_TRANSITION, type CardMotion } from './motion';
import { pad2 } from './text';

interface Props {
  readonly view: WireView;
  readonly analysis: Analysis;
  readonly selection: Selection;
  readonly sizes: CardSizes;
  readonly enter: (id: CardId, order: number) => CardMotion;
  readonly label: (id: CardId | null) => string;
  readonly onColumn: (column: Column) => void;
  /** The move log, oldest first. */
  readonly log: readonly ReactNode[];
  /** How many rows the board showed before this update (null: nothing to animate). */
  readonly previousRows: number | null;
}

/** A row's value once any action card beside it is counted. */
const effective = (row: WireBidRow | undefined): number | undefined =>
  row ? (row.action?.newValue ?? row.value) : undefined;

/** The auction so far: one row per bid, action cards beside the row they changed. */
export function BidBoard({
  view,
  analysis,
  selection,
  sizes,
  enter,
  label,
  onColumn,
  log,
  previousRows,
}: Props) {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  const rows = view.bids;
  const latestIndex = rows.length - 1;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [rows.length]);

  const choosing = analysis.mode === 'bid' && selection.action !== null;
  const name = (by: WireBidRow['by']): string =>
    by === 'start' ? t('game.start') : by === view.you.seat ? t('log.you') : view.opponent.nickname;

  const cell = (id: CardId, order: number, zone: string) => {
    const m = enter(id, order);
    return (
      <Card
        key={id}
        layoutId={`c${id}`}
        id={id}
        width={sizes.board}
        label={label(id)}
        zone={zone}
        initial={m.initial}
        animate={m.animate}
        transition={{ ...LAYOUT_TRANSITION, ...m.transition }}
      />
    );
  };

  const columnCell = (row: WireBidRow, index: number, column: Column) => {
    if (row.action?.column === column) return cell(row.action.card, index * 3, 'board');
    if (index !== latestIndex || !choosing || !selection.action) return null;
    const chosen = selection.action.column === column;
    const legal = analysis.columns.includes(column);
    return (
      <button
        type="button"
        className={`column-choice ${chosen ? 'column-choice--on' : ''} ${legal ? 'column-choice--legal' : ''}`}
        onClick={() => onColumn(column)}
        style={{ width: sizes.board, height: Math.round(sizes.board * 1.4) }}
        aria-pressed={chosen}
        aria-label={column === 1 ? t('compose.plus') : t('compose.minus')}
        data-testid={`board-column-${column}`}
      >
        {chosen ? (
          <span className="ghost-card">
            <CardFace id={selection.action.card} compact />
          </span>
        ) : column === 1 ? (
          '+10'
        ) : (
          '−10'
        )}
      </button>
    );
  };

  const preview =
    choosing && selection.action?.column
      ? mod100((rows[latestIndex]?.value ?? 0) + columnShift(selection.action.column))
      : null;

  return (
    <section
      className="panel board"
      aria-label={t('game.bids')}
      data-testid="board"
      style={{ '--board-card': `${sizes.board}px` } as CSSProperties}
    >
      <header className="panel-head">
        <h2>{t('game.bids')}</h2>
        <span className="panel-meta">{t('game.bidCount', { count: rows.length - 1 })}</span>
      </header>
      <div className="board-grid board-grid--head" aria-hidden="true">
        <span />
        <span>{t('game.column1')}</span>
        <span>{t('game.tens')}</span>
        <span>{t('game.units')}</span>
        <span>{t('game.column4')}</span>
        <span />
      </div>
      <div className="board-rows" ref={scroller}>
        {rows.map((row, index) => {
          const latest = index === latestIndex;
          const shown = row.action?.newValue;
          return (
            <motion.div
              key={`${row.tens}-${row.units}`}
              className={`board-grid board-row ${latest ? 'board-row--latest' : ''} ${row.by === view.you.seat ? 'board-row--mine' : ''}`}
              layout="position"
              initial={index === 0 ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              data-testid="bid-row"
            >
              <span className="row-by">{name(row.by)}</span>
              <span className="slot">{columnCell(row, index, 1)}</span>
              <span className="slot">{cell(row.tens, index * 3 + 1, 'board')}</span>
              <span className="slot">{cell(row.units, index * 3 + 2, 'board')}</span>
              <span className="slot">{columnCell(row, index, 4)}</span>
              <span className="row-value">
                {shown !== undefined && (
                  <>
                    <span className="value-old">{pad2(row.value)}</span>
                    <span className="value-arrow">→</span>
                  </>
                )}
                <AnimatedNumber
                  value={shown ?? row.value}
                  from={
                    previousRows !== null && index >= previousRows && index > 0
                      ? effective(rows[index - 1])
                      : undefined
                  }
                  className="value-now"
                />
                {latest && preview !== null && (
                  <span className="value-preview">
                    → <b>{pad2(preview)}</b>
                  </span>
                )}
              </span>
            </motion.div>
          );
        })}
      </div>
      {view.status === 'playing' && view.phase !== 'exchange' && (
        <footer className="board-foot">
          <div className="window">
            <b>
              {t('game.next', {
                from: pad2(analysis.windows.none.from),
                to: pad2(analysis.windows.none.to),
              })}
            </b>{' '}
            <span className="muted">
              ·{' '}
              {t('game.withAction', {
                plusFrom: pad2(analysis.windows.plus.from),
                plusTo: pad2(analysis.windows.plus.to),
                minusFrom: pad2(analysis.windows.minus.from),
                minusTo: pad2(analysis.windows.minus.to),
              })}
            </span>
          </div>
          <div className="colors">
            {t('game.needsColor')}{' '}
            {analysis.oldSuits.map((suit) => (
              <SuitIcon key={suit} suit={suit} light size="1.05em" />
            ))}
          </div>
        </footer>
      )}
      {log.length > 0 && (
        <details className="log">
          <summary>
            <span className="log-label">{t('game.lastMove')}</span>
            <span className="log-last" aria-live="polite">
              {log[log.length - 1]}
            </span>
          </summary>
          <ol className="log-list" aria-label={t('game.log')}>
            {log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
