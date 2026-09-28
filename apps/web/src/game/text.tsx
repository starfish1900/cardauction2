import { isAction, rankOf, suitOf, type CardId } from '@cardauction/engine';
import type { GameEvent, WireSeat, WireView } from '@cardauction/protocol';
import type { TFunction } from 'i18next';
import { Fragment, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CardText } from '../ui/SuitIcon';

export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Spoken names for cards, for screen readers ("7 of hearts"). */
export function useCardLabel(): (id: CardId | null) => string {
  const { t } = useTranslation();
  return useCallback(
    (id: CardId | null): string => {
      if (id === null) return t('card.back');
      if (isAction(id)) return t('card.action');
      const suits = t('card.suits', { returnObjects: true }) as unknown as readonly string[];
      return t('card.digit', { rank: rankOf(id), suit: suits[suitOf(id)] ?? '' });
    },
    [t],
  );
}

const MARK = '\u0000';

/**
 * A translated sentence with React nodes (colored cards) in place of some of its placeholders:
 * the placeholders are filled with a marker, then the text is cut at the markers.
 */
export function withNodes(text: string, nodes: readonly ReactNode[]): ReactNode {
  const parts = text.split(MARK);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 ? nodes[i] : null}
    </Fragment>
  ));
}

const cards = (...ids: CardId[]): ReactNode => (
  <span className="card-texts">
    {ids.map((id) => (
      <CardText key={id} id={id} />
    ))}
  </span>
);

export function seatName(view: WireView, seat: WireSeat, t: TFunction): string {
  return seat === view.you.seat ? t('log.you') : view.opponent.nickname;
}

/** One line of the move log. */
export function describe(event: GameEvent, view: WireView, t: TFunction): ReactNode {
  switch (event.type) {
    case 'start':
      return t('log.start');
    case 'pass':
      return t(event.timeout ? 'log.passTimeout' : 'log.pass', {
        who: seatName(view, event.by, t),
      });
    case 'exchange':
      return withNodes(
        t('log.exchange', { who: seatName(view, event.by, t), give: MARK, take: MARK }),
        [cards(event.give), cards(event.take)],
      );
    case 'bid': {
      const nodes: ReactNode[] = [cards(event.tens, event.units)];
      let text = t('log.bid', {
        who: seatName(view, event.by, t),
        value: pad2(event.value),
        cards: MARK,
      });
      if (event.action) {
        text += `, ${t('log.action', { from: pad2(mod(event.action.newValue - shift(event.action.column))), to: pad2(event.action.newValue) })}`;
      }
      if (event.tableCard !== undefined) {
        text += `, ${t('log.tableCard', { card: MARK })}`;
        nodes.push(cards(event.tableCard));
      }
      if (event.take !== undefined) {
        text += `, ${t('log.take', { card: MARK })}`;
        nodes.push(cards(event.take));
      }
      return withNodes(`${text}.`, nodes);
    }
    case 'end':
      return t('log.end');
  }
}

const shift = (column: 1 | 4): number => (column === 1 ? 10 : -10);
const mod = (n: number): number => ((n % 100) + 100) % 100;

/** "You win!" and why, from the player's side. */
export function outcome(
  view: WireView,
  t: TFunction,
): { tone: 'win' | 'lose' | 'none'; title: string; reason: string } {
  const result = view.result;
  if (!result) return { tone: 'none', title: t('game.over'), reason: '' };
  const name = view.opponent.nickname;
  if (result.winner === null) {
    return { tone: 'none', title: t('result.none'), reason: t(`result.reasons.${result.reason}`) };
  }
  const won = result.winner === view.you.seat;
  return {
    tone: won ? 'win' : 'lose',
    title: t(won ? 'result.win' : 'result.lose'),
    reason: t(`result.reasons.${result.reason}_${won ? 'win' : 'lose'}`, { name }),
  };
}
