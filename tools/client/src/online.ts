/**
 * Play CardAuction on a server from a terminal, with the notation of `pnpm play`.
 *
 *   pnpm online                                   local server (port 3000)
 *   pnpm online --server https://cardauction-server.onrender.com --name Ada
 *
 * The guest token is kept in ~/.cardauction/<server>.token, so you keep your identity (and
 * can return to a game in progress) after quitting.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import {
  cardLabel,
  describeWindow,
  formatCards,
  formatRow,
  legalBids,
  parseMove,
  validateMove,
  type Move,
} from '@cardauction/engine';
import {
  AI_LEVELS,
  fromWireSeat,
  stateFromView,
  type AiLevel,
  type GameEvent,
  type GameUpdate,
  type WireView,
} from '@cardauction/protocol';
import { openSession, request, sendMove } from './connection.js';

const { values } = parseArgs({
  options: {
    server: { type: 'string', default: 'http://localhost:3000' },
    name: { type: 'string' },
    'token-file': { type: 'string' },
  },
});
const url = values.server.replace(/\/$/u, '');
const tokenFile =
  values['token-file'] ??
  join(homedir(), '.cardauction', `${new URL(url).host.replace(/[^\w.-]/gu, '_')}.token`);

function readToken(): string | null {
  try {
    return readFileSync(tokenFile, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function saveToken(token: string): void {
  mkdirSync(join(tokenFile, '..'), { recursive: true });
  writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const say = (text: string): void => {
  process.stdout.write(`\r${text}\n`);
  rl.prompt(true);
};

let view: WireView | null = null;
let clockOffset = 0;

const session = await openSession(url, {
  token: readToken(),
  ...(values.name ? { nickname: values.name } : {}),
  build: 'terminal',
  reconnect: true,
  onWelcome: (welcome) => {
    if (welcome.token) saveToken(welcome.token);
    if (welcome.endedGame) {
      const e = welcome.endedGame;
      const outcome =
        e.winner === null ? 'nobody won' : e.winner === e.seat ? 'you won' : 'you lost';
      say(`While you were away, game ${e.gameId} ended (${e.reason}): ${outcome}.`);
    }
  },
});
const { socket } = session;
say(`Connected to ${url} as ${session.welcome.nickname}. Type "help" for commands.`);

socket.on('disconnect', () => say('Connection lost: reconnecting (you have 25 s to return)...'));
socket.on('server.notice', (n) => say(`Server: ${n.message}`));
socket.on('lobby.aiOffer', () =>
  say('Nobody else is waiting. Type "ai" to play the AI, or keep waiting.'),
);
socket.on('lobby.requeued', () =>
  say('Your opponent never loaded the game: you are back at the front of the queue.'),
);
socket.on('lobby.private.expired', ({ code }) => say(`Your private code ${code} expired.`));
socket.on('lobby.matched', (m) =>
  say(`Matched with ${m.opponent}${m.vsAI ? ' (AI)' : ''}: you are ${m.seat}.`),
);
socket.on('game.cancelled', ({ reason }) => {
  view = null;
  say(
    reason === 'start-timeout'
      ? 'The game was cancelled: a player never loaded it.'
      : 'The game was cancelled by a server error.',
  );
});
socket.on('game.presence', (p) => {
  if (!view || p.gameId !== view.gameId) return;
  say(
    p.connected
      ? `${view.opponent.nickname} is back.`
      : `${view.opponent.nickname} is away: ${Math.round(((p.graceDeadline ?? p.serverNow) - p.serverNow) / 1000)} s to return.`,
  );
});
socket.on('game.rematch', (r) =>
  say(
    `${view?.opponent.nickname ?? 'Your opponent'} ${r.accept ? 'wants a rematch: type "rematch"' : 'declined the rematch'}.`,
  ),
);
socket.on('game.update', (update) => onUpdate(update));

function onUpdate(update: GameUpdate): void {
  const previous = view;
  view = update.view;
  clockOffset = update.serverNow - Date.now();
  if (!update.sync || !previous)
    for (const event of update.events) say(describe(event, update.view));
  if (update.view.status === 'starting' && (!previous || previous.gameId !== update.gameId)) {
    request(socket, 'game.ready', { gameId: update.gameId, version: update.view.version }).catch(
      () => undefined,
    );
  }
  if (update.view.status === 'over' || update.view.toMove === update.view.you.seat || update.sync)
    say(render(update.view));
}

function who(seat: string, v: WireView): string {
  return seat === v.you.seat ? 'You' : v.opponent.nickname;
}

function describe(event: GameEvent, v: WireView): string {
  switch (event.type) {
    case 'start':
      return 'The game starts: P2 may exchange one card with the table, or pass.';
    case 'pass':
      return `${who(event.by, v)} kept the hand${event.timeout ? ' (time ran out)' : ''}.`;
    case 'exchange':
      return `${who(event.by, v)} swapped ${cardLabel(event.give)} for ${cardLabel(event.take)} from the table.`;
    case 'bid': {
      const parts = [
        `${who(event.by, v)} bid ${String(event.value).padStart(2, '0')} with ${cardLabel(event.tens)} ${cardLabel(event.units)}`,
      ];
      if (event.action)
        parts.push(
          `after an action card in column ${event.action.column} (the last bid became ${String(event.action.newValue).padStart(2, '0')})`,
        );
      if (event.tableCard !== undefined)
        parts.push(`using ${cardLabel(event.tableCard)} from the table`);
      if (event.take !== undefined) parts.push(`then took ${cardLabel(event.take)}`);
      return `${parts.join(', ')}.`;
    }
    case 'end': {
      const outcome =
        event.winner === null
          ? 'nobody wins'
          : event.winner === v.you.seat
            ? 'you win!'
            : `${v.opponent.nickname} wins`;
      return `Game over (${event.reason}): ${outcome}`;
    }
  }
}

function render(v: WireView): string {
  const state = stateFromView(v);
  const lines = ['─'.repeat(72), 'Bids', ...state.bids.map((row) => `  ${formatRow(row)}`)];
  if (v.status === 'playing' && v.phase !== 'exchange') lines.push(describeWindow(state));
  lines.push(`Table (${v.table.length}): ${formatCards(v.table)}`);
  lines.push(
    `${v.opponent.nickname} (${v.opponent.seat}${v.opponent.isAI ? ', AI' : ''}): ${v.opponent.handCount} cards · known: ${formatCards(v.opponent.known)}${v.opponent.connected ? '' : ' · away'}`,
  );
  lines.push(`Your hand (${v.you.seat}): ${formatCards(v.you.hand)}`);
  if (v.status === 'over' && v.result) {
    lines.push(
      `Hands: P1 ${formatCards(v.result.hands.P1)} · P2 ${formatCards(v.result.hands.P2)}`,
    );
    lines.push(v.rematch ? 'Type "rematch", or "lobby" to go back.' : 'Type "lobby" to go back.');
  } else if (v.status === 'playing' && v.toMove === v.you.seat && v.turnDeadline !== null) {
    const left = Math.max(0, Math.round((v.turnDeadline - (Date.now() + clockOffset)) / 1000));
    lines.push(
      v.phase === 'exchange'
        ? `Your move (${left} s): "swap <hand card> <table card>" or "pass".`
        : `Your bid (${left} s)${v.phase === 'firstBid' ? ': use exactly one table card, marked with t' : ''}. "hint" lists legal bids.`,
    );
  } else if (v.status === 'playing') {
    lines.push(`Waiting for ${v.opponent.nickname}...`);
  }
  return lines.join('\n');
}

const HELP = `Lobby:
  quick                       quick match against another player
  ai [easy|medium|hard] [p1|p2|random]
                              play the server's AI (a placeholder until milestone M3)
  create | join <code>        private game by code
  leave                       leave the queue or cancel your code
In a game (notation of pnpm play; suits * D C H S, A = action card):
  pass | swap 5H 3C           P2's opening
  7* 0H take 9C               bid 70, then take 9♣ ("+" or "-" first for an action card)
  t6D 3* take 4C              first bid: t marks the table card used
  hint | resign | sync
After a game: rematch | lobby
  quit`;

async function command(line: string): Promise<void> {
  const [word = '', ...rest] = line.trim().split(/\s+/u);
  const lower = word.toLowerCase();
  const game = view;
  switch (lower) {
    case '':
      return;
    case 'help':
      say(HELP);
      return;
    case 'quit':
    case 'exit':
      socket.disconnect();
      rl.close();
      process.exit(0);
      return;
    case 'quick': {
      const reply = await request(socket, 'lobby.quick.join', {});
      say(reply.ok ? 'Waiting for an opponent...' : `Cannot join: ${reply.code}`);
      return;
    }
    case 'ai': {
      const level = (rest[0] ?? 'easy').toLowerCase() as AiLevel;
      const seat = (rest[1] ?? 'random').toUpperCase();
      if (!AI_LEVELS.includes(level) || !['P1', 'P2', 'RANDOM'].includes(seat)) {
        say('Usage: ai [easy|medium|hard] [p1|p2|random]');
        return;
      }
      const reply = await request(socket, 'lobby.ai.start', {
        level,
        seat: seat === 'RANDOM' ? 'random' : (seat as 'P1' | 'P2'),
      });
      if (!reply.ok) say(`Cannot start: ${reply.code}`);
      return;
    }
    case 'create': {
      const reply = await request(socket, 'lobby.private.create', {});
      say(
        reply.ok
          ? `Your code: ${reply.code} (valid 10 minutes). Share it; your friend types "join ${reply.code}".`
          : `Cannot create: ${reply.code}`,
      );
      return;
    }
    case 'join': {
      const reply = await request(socket, 'lobby.private.join', { code: rest.join('') });
      if (!reply.ok) say(`Cannot join: ${reply.code}`);
      return;
    }
    case 'leave': {
      await request(socket, 'lobby.quick.leave', {});
      await request(socket, 'lobby.private.cancel', {});
      say('Left the queue.');
      return;
    }
    case 'lobby': {
      if (game) await request(socket, 'game.leave', { gameId: game.gameId });
      view = null;
      say('Back in the lobby.');
      return;
    }
    case 'rematch': {
      if (!game) return;
      const reply = await request(socket, 'game.rematch', { gameId: game.gameId, accept: true });
      say(reply.ok ? 'Rematch requested.' : `No rematch: ${reply.code}`);
      return;
    }
    case 'resign': {
      if (!game) return;
      const reply = await request(socket, 'game.resign', {
        gameId: game.gameId,
        cmdId: `resign-${game.version}`,
      });
      if (!reply.ok) say(`Cannot resign: ${reply.code}`);
      return;
    }
    case 'sync': {
      if (!game) return;
      const reply = await request(socket, 'game.sync', { gameId: game.gameId });
      if (reply.ok) onUpdate(reply.update);
      return;
    }
    case 'hint': {
      if (!game || game.phase === 'exchange') {
        say('Pass, or swap one hand card for a table card.');
        return;
      }
      const bids = legalBids(stateFromView(game));
      say(
        bids.length === 0
          ? 'No legal bid.'
          : `${bids.length} legal bids, for example: ${bids
              .slice(0, 8)
              .map(
                (b) =>
                  `${cardLabel(b.tens)}${cardLabel(b.units)}${b.action ? (b.action.column === 1 ? '(+10)' : '(−10)') : ''}`,
              )
              .join(' · ')}`,
      );
      return;
    }
    default: {
      if (!game || game.status !== 'playing') {
        say('Unknown command. Type "help".');
        return;
      }
      const state = stateFromView(game);
      const seat = fromWireSeat(game.you.seat);
      const move: Move | string = parseMove(state, seat, line);
      if (typeof move === 'string') {
        say(`Not understood: ${move}.`);
        return;
      }
      const check = validateMove(state, seat, move);
      if (!check.ok) {
        say(`Illegal: ${check.error}.`);
        return;
      }
      const reply = await sendMove(socket, game, move);
      if (!reply.ok) say(`Refused: ${reply.code}.`);
    }
  }
}

rl.setPrompt('> ');
rl.prompt();
rl.on('line', (line) => {
  command(line)
    .catch((error: unknown) =>
      say(`Error: ${error instanceof Error ? error.message : String(error)}`),
    )
    .finally(() => rl.prompt());
});
rl.on('close', () => {
  socket.disconnect();
  process.exit(0);
});
