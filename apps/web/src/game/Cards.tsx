import type { CardId } from '@cardauction/engine';
import type { WireView } from '@cardauction/protocol';
import { useTranslation } from 'react-i18next';
import { Card, type CardMark } from '../cards/Card';
import type { CardSizes } from '../ui/hooks';
import type { Analysis, Selection } from './compose';
import { LAYOUT_TRANSITION, type CardMotion } from './motion';

interface ZoneProps {
  readonly view: WireView;
  readonly analysis: Analysis;
  readonly selection: Selection;
  readonly sizes: CardSizes;
  readonly assist: boolean;
  readonly enter: (id: CardId, order: number) => CardMotion;
  readonly label: (id: CardId | null) => string;
  readonly onPick: (zone: 'hand' | 'table', id: CardId) => void;
  readonly fresh: ReadonlySet<CardId>;
}

function inSelection(sel: Selection, id: CardId): boolean {
  return (
    sel.tens === id ||
    sel.units === id ||
    sel.action?.card === id ||
    sel.take === id ||
    sel.give === id
  );
}

function markFor(
  id: CardId,
  zone: 'hand' | 'table',
  { analysis, selection, assist, fresh }: ZoneProps,
): CardMark | undefined {
  if (inSelection(selection, id)) return 'selected';
  const composing = analysis.mode !== 'watch';
  // Assist mode points at what the next tap can be: a card for the bid, then a card to take.
  if (composing && assist && analysis.mode === 'bid') {
    if (analysis.stage === 'pickTake' && zone === 'table') {
      return analysis.takeable.has(id) ? 'playable' : undefined;
    }
    if (analysis.stage === 'pickDigits') {
      if (analysis.playable.has(id)) return 'playable';
      if (zone === 'hand') return 'dim';
    }
  }
  return fresh.has(id) ? 'fresh' : undefined;
}

/** The face-up table cards: taken from after each bid, and usable in P1's first bid. */
export function TableGrid(props: ZoneProps) {
  const { t } = useTranslation();
  const { view, sizes, enter, label, onPick, analysis } = props;
  const clickable = analysis.mode !== 'watch';
  return (
    <section className="panel table-panel" aria-label={t('game.table')} data-testid="table">
      <header className="panel-head">
        <h2>{t('game.table')}</h2>
        <span className="panel-meta">{t('game.cards', { count: view.table.length })}</span>
      </header>
      {view.table.length === 0 && <p className="table-empty">{t('game.emptyTable')}</p>}
      <div
        className="table-grid"
        style={{ gridTemplateColumns: `repeat(auto-fill, ${sizes.table}px)` }}
      >
        {view.table.map((id, i) => {
          const m = enter(id, 26 + i);
          return (
            <Card
              key={id}
              layoutId={`c${id}`}
              id={id}
              width={sizes.table}
              mark={markFor(id, 'table', props)}
              label={label(id)}
              zone="table"
              onPick={clickable ? () => onPick('table', id) : undefined}
              initial={m.initial}
              animate={m.animate}
              transition={{ ...LAYOUT_TRANSITION, ...m.transition }}
            />
          );
        })}
      </div>
    </section>
  );
}

/** The player's own hand, sorted: action cards, then rank, then suit. */
export function Hand(props: ZoneProps) {
  const { t } = useTranslation();
  const { view, sizes, enter, label, onPick, analysis } = props;
  const clickable = analysis.mode !== 'watch';
  const cards =
    view.status === 'over' && view.result ? view.result.hands[view.you.seat] : view.you.hand;
  return (
    <section className="hand-panel" aria-label={t('game.hand')} data-testid="hand">
      <div className="hand" style={{ minHeight: Math.round(sizes.hand * 1.4) + 14 }}>
        {cards.map((id, i) => {
          const m = enter(id, i);
          return (
            <Card
              key={id}
              layoutId={`c${id}`}
              id={id}
              width={sizes.hand}
              mark={markFor(id, 'hand', props)}
              label={label(id)}
              zone="hand"
              onPick={clickable ? () => onPick('hand', id) : undefined}
              initial={m.initial}
              animate={m.animate}
              transition={{ ...LAYOUT_TRANSITION, ...m.transition }}
            />
          );
        })}
      </div>
    </section>
  );
}
