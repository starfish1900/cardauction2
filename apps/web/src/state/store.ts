import type {
  EndedGame,
  GameEvent,
  GameUpdate,
  PresenceUpdate,
  Welcome,
  WireView,
} from '@cardauction/protocol';
import { create } from 'zustand';
import { EMPTY, type Selection } from '../game/compose';
import { readSetting, writeSetting } from './storage';

export type Screen = 'home' | 'queue' | 'host' | 'game' | 'rules';

export interface GameSlice {
  readonly gameId: string;
  readonly view: WireView;
  /** The view before the latest update (null after a full sync): what was visible before. */
  readonly previous: WireView | null;
  /** Every event of the game seen so far, for the move log. */
  readonly events: readonly GameEvent[];
  /** The events of the latest update: what to animate now. */
  readonly fresh: readonly GameEvent[];
  /** The latest update replaced everything (first view, reconnection): nothing to animate. */
  readonly synced: boolean;
  /** The opponent asked for a rematch. */
  readonly rematchOffer: boolean;
}

export type NoticeKind =
  | 'replaced'
  | 'update'
  | 'restarting'
  | 'cancelled'
  | 'serverError'
  | 'requeued'
  | 'codeExpired'
  | 'ended'
  | 'forfeitWarning'
  | 'error';

export interface Notice {
  readonly kind: NoticeKind;
  /** An ErrorCode, or a code this client does not know yet. */
  readonly code?: string;
  readonly params?: Readonly<Record<string, string | number>>;
  readonly ended?: EndedGame;
  readonly id: number;
}

export interface AppState {
  readonly connection: 'connecting' | 'online' | 'offline' | 'replaced';
  readonly offlineSince: number | null;
  readonly everConnected: boolean;
  /** Server clock minus this device's clock, from the latest message. */
  readonly clockOffset: number;
  readonly me: { readonly playerId: string; readonly nickname: string } | null;
  readonly screen: Screen;
  /** Where "Back" leads from the rules. */
  readonly returnTo: Screen;
  readonly queue: { readonly since: number; readonly aiOffered: boolean } | null;
  readonly privateCode: { readonly code: string; readonly expiresAt: number } | null;
  readonly game: GameSlice | null;
  readonly selection: Selection;
  readonly notice: Notice | null;
  /** Assist mode as the player set it; null: the default (on against the AI). */
  readonly assist: boolean | null;
  /** A private code from an invitation link that could not be joined: offered again at home. */
  readonly joinCode: string | null;
}

const initial: AppState = {
  connection: 'connecting',
  offlineSince: null,
  everConnected: false,
  clockOffset: 0,
  me: null,
  screen: 'home',
  returnTo: 'home',
  queue: null,
  privateCode: null,
  game: null,
  selection: EMPTY,
  notice: null,
  assist: readAssist(),
  joinCode: null,
};

function readAssist(): boolean | null {
  const saved = readSetting('assist');
  return saved === 'on' ? true : saved === 'off' ? false : null;
}

export const useStore = create<AppState>(() => initial);

let noticeId = 0;

/** State changes, kept here so screens and the connection share one vocabulary. */
export const actions = {
  online(welcome: Welcome): void {
    useStore.setState((s) => ({
      connection: 'online',
      offlineSince: null,
      everConnected: true,
      clockOffset: welcome.serverNow - Date.now(),
      me: { playerId: welcome.playerId, nickname: welcome.nickname },
      queue:
        welcome.queuedSince !== undefined
          ? { since: welcome.queuedSince, aiOffered: false }
          : s.queue,
      privateCode: welcome.privateCode ?? null,
      screen: welcome.activeGameId
        ? 'game'
        : welcome.queuedSince !== undefined
          ? 'queue'
          : welcome.privateCode
            ? 'host'
            : // The server dropped the code while this player was away.
              s.screen === 'host'
              ? 'home'
              : s.screen,
      returnTo: s.returnTo === 'host' && !welcome.privateCode ? 'home' : s.returnTo,
    }));
  },

  offline(): void {
    useStore.setState((s) => ({
      connection: s.connection === 'replaced' ? 'replaced' : 'offline',
      offlineSince: s.offlineSince ?? Date.now(),
    }));
  },

  replaced(): void {
    useStore.setState({ connection: 'replaced' });
  },

  show(screen: AppState['screen']): void {
    useStore.setState((s) => ({
      screen,
      returnTo: screen === 'rules' ? (s.screen === 'rules' ? s.returnTo : s.screen) : s.returnTo,
    }));
  },

  update(update: GameUpdate): void {
    useStore.setState((s) => {
      const current = s.game;
      const same = current?.gameId === update.gameId;
      const replace = update.sync || !same;
      const events = replace ? update.events : [...(current?.events ?? []), ...update.events];
      const changed = !same || current.view.version !== update.view.version;
      return {
        game: {
          gameId: update.gameId,
          view: update.view,
          previous: replace ? null : (current?.view ?? null),
          events,
          fresh: replace ? [] : update.events,
          synced: replace,
          rematchOffer: same && update.view.status === 'over' ? current.rematchOffer : false,
        },
        clockOffset: update.serverNow - Date.now(),
        screen: s.screen === 'rules' ? 'rules' : 'game',
        returnTo: s.screen === 'rules' ? 'game' : s.returnTo,
        queue: null,
        privateCode: null,
        selection: changed ? EMPTY : s.selection,
      };
    });
  },

  presence(p: PresenceUpdate): void {
    useStore.setState((s) => {
      if (!s.game || s.game.gameId !== p.gameId) return {};
      const view = s.game.view;
      return {
        clockOffset: p.serverNow - Date.now(),
        game: {
          ...s.game,
          view: {
            ...view,
            opponent: { ...view.opponent, connected: p.connected, graceDeadline: p.graceDeadline },
          },
        },
      };
    });
  },

  rematchOffer(gameId: string, accept: boolean): void {
    useStore.setState((s) =>
      s.game?.gameId === gameId ? { game: { ...s.game, rematchOffer: accept } } : {},
    );
  },

  leaveGame(): void {
    useStore.setState({ game: null, selection: EMPTY, screen: 'home' });
  },

  queued(since: number): void {
    useStore.setState({ queue: { since, aiOffered: false }, screen: 'queue' });
  },

  aiOffered(): void {
    useStore.setState((s) => (s.queue ? { queue: { ...s.queue, aiOffered: true } } : {}));
  },

  hosting(code: string, expiresAt: number): void {
    useStore.setState({ privateCode: { code, expiresAt }, screen: 'host' });
  },

  home(): void {
    useStore.setState({ queue: null, privateCode: null, screen: 'home' });
  },

  select(selection: Selection): void {
    useStore.setState({ selection });
  },

  notify(kind: NoticeKind, extra: Omit<Notice, 'kind' | 'id'> = {}): void {
    useStore.setState({ notice: { kind, ...extra, id: ++noticeId } });
  },

  dismiss(): void {
    useStore.setState({ notice: null });
  },

  setAssist(on: boolean): void {
    writeSetting('assist', on ? 'on' : 'off');
    useStore.setState({ assist: on });
  },
};
