import type { CardId, Column, Move } from '@cardauction/engine';
import { LayoutGroup } from 'motion/react';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../net/connection';
import { actions, useStore, type GameSlice } from '../state/store';
import { cardSizes, useViewportWidth } from '../ui/hooks';
import { BidBoard } from './BidBoard';
import { Hand, TableGrid } from './Cards';
import { Composer } from './Composer';
import { analyze, chooseColumn, pick, type Selection } from './compose';
import { entrance, freshIds } from './motion';
import { OpponentBar } from './OpponentBar';
import { ResultPanel } from './ResultPanel';
import { describe, useCardLabel } from './text';

/** Warn once per page about leaving a game against a person. */
let warned = false;

export function GameScreen() {
  const game = useStore((s) => s.game);
  if (!game) return null;
  // A new game (a rematch included) starts from a clean table: fresh state, a new deal.
  return <GameTable key={game.gameId} game={game} />;
}

function GameTable({ game }: { game: GameSlice }) {
  const { t } = useTranslation();
  const selection = useStore((s) => s.selection);
  const assistSetting = useStore((s) => s.assist);
  const { view } = game;
  const assist = assistSetting ?? view.opponent.isAI;
  const sizes = cardSizes(useViewportWidth());
  const label = useCardLabel();

  const analysis = useMemo(() => analyze(view, selection), [view, selection]);
  const enter = useMemo(() => entrance(game), [game]);
  const fresh = useMemo(() => freshIds(game), [game]);
  const log = useMemo(
    () =>
      game.events
        .filter((e) => e.type !== 'start' && e.type !== 'end')
        .map((e) => describe(e, view, t)),
    [game.events, view, t],
  );

  const onPick = useCallback(
    (zone: 'hand' | 'table', id: CardId) =>
      actions.select(pick(view, useStore.getState().selection, zone, id)),
    [view],
  );
  const onColumn = useCallback(
    (column: Column) => actions.select(chooseColumn(useStore.getState().selection, column)),
    [],
  );
  const onSelect = useCallback((next: Selection) => actions.select(next), []);
  const onSend = useCallback((move: Move) => api.move(view, move), [view]);

  // A player waiting in another tab sees the turn come back in the tab's title.
  const myTurn = analysis.mode !== 'watch';
  const yourTurn = t('game.yourTurn');
  useEffect(() => {
    document.title = myTurn ? `● ${yourTurn} · CardAuction` : 'CardAuction';
    return () => {
      document.title = 'CardAuction';
    };
  }, [myTurn, yourTurn]);

  const againstPerson = !view.opponent.isAI;
  const live = view.status !== 'over';
  useEffect(() => {
    if (againstPerson && live && !warned) {
      warned = true;
      actions.notify('forfeitWarning');
    }
  }, [againstPerson, live]);

  const zone = { view, analysis, selection, sizes, assist, enter, label, onPick, fresh };
  return (
    <LayoutGroup>
      <div
        className={`game game--${view.status} ${analysis.mode !== 'watch' ? 'game--my-turn' : ''}`}
        data-testid="game"
        data-seat={view.you.seat}
        data-phase={view.phase}
        data-status={view.status}
        data-to-move={view.toMove}
        data-version={view.version}
      >
        <OpponentBar view={view} sizes={sizes} enter={enter} label={label} />
        <BidBoard
          view={view}
          analysis={analysis}
          selection={selection}
          sizes={sizes}
          enter={enter}
          label={label}
          onColumn={onColumn}
          log={log}
          previousRows={game.previous?.bids.length ?? null}
        />
        <TableGrid {...zone} />
        <Hand {...zone} />
        {view.status === 'over' ? (
          <ResultPanel view={view} offered={game.rematchOffer} />
        ) : (
          <Composer
            view={view}
            analysis={analysis}
            selection={selection}
            sizes={sizes}
            onSelect={onSelect}
            onColumn={onColumn}
            onSend={onSend}
          />
        )}
      </div>
    </LayoutGroup>
  );
}
