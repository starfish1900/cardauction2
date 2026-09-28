# CardAuction

A two-player card game for the web, with a server-side AI. Players outbid each other with two-digit
numbers made of cards; the first player who cannot continue the auction loses.

This repository is built milestone by milestone, each one arriving as a pull request.

| Milestone | Scope                                                                         | Status  |
| --------- | ----------------------------------------------------------------------------- | ------- |
| M0        | Rules engine, property tests, random-play simulator, terminal game            | Done    |
| M1        | Game server: sessions, lobby, games, timers, disconnects, first Render deploy | Done    |
| M2        | Web client: lobby, table, turn composer, card faces, animations, reconnection | Done    |
| M3        | AI: ISMCTS with three levels, worker thread, balance lab                      | Next    |
| M4        | Hardening: Key Value snapshots, deploy handoff, soak and load tests           | Planned |
| M5        | Launch on Render (Starter instance, free Key Value, static site)              | Planned |

## Requirements

- Node.js 22.12 or later (24 recommended; CI uses the version in `.node-version`)
- pnpm 10: `corepack enable` installs the version pinned in `package.json`

## Commands

```sh
pnpm install
pnpm check                          # typecheck, lint, format check and all tests
pnpm test                           # engine, protocol, server integration and web unit tests
pnpm e2e                            # browsers play whole games against a real server (below)
pnpm sim                            # 1,000,000 random games, every invariant checked
pnpm sim --games 20000 --seed 7     # smaller reproducible run
pnpm play                           # play in the terminal against a random bot (no server)
pnpm dev                            # game server on http://localhost:3000, restarts on changes
pnpm dev:web                        # web client on http://localhost:5173 (with pnpm dev running)
pnpm build                          # server bundle (apps/server/dist) and web client (apps/web/dist)
pnpm online --name Ada              # play on a server from a terminal (see below)
pnpm bot --bots 10 --games 5        # bots playing random legal moves against a server
pnpm smoke --server <url>           # health check, then two bots play a whole game
```

## Playing in the browser

Start the server with `pnpm dev` and the web client with `pnpm dev:web`, then open
http://localhost:5173. To play yourself, open a second window in private mode (each window is a
different guest): choose **Create a code** in one and type the code, or open the link, in the
other. **Play the AI** starts at once; until M3 every AI level plays random legal moves.
`http://localhost:5173/?gallery` shows every card face.

The end-to-end tests start their own server (port 3100) and a production build of the client
(port 4173, served from another origin like on Render, with the production Content-Security-Policy),
then drive real browsers at desktop and phone sizes: two players play whole games, a rematch, a
lost connection and a reload, a game against the AI, and the lobby screens. They need Playwright's
Chromium (`pnpm --filter @cardauction/web exec playwright install chromium`), or another Chromium
given in `PW_CHROMIUM_PATH`.

## Terminal client

A terminal client plays on any server with the notation of `pnpm play`. Start a server with
`pnpm dev`, then in two other terminals:

```sh
pnpm online --name Ada              # type "quick" in both to be matched
pnpm online --name Bob
pnpm online --name Ada --server https://cardauction-server.onrender.com
```

Type `help` for the commands: `quick`, `ai easy p1`, `create`, `join <code>`, moves such as
`7* 0H take 9C`, `resign`, `rematch`, `lobby`. The guest token is kept in `~/.cardauction/`, so
quitting and starting again brings you back to your game within 25 s. Until M3, every AI level
plays random legal moves.

## Deploying to Render

`render.yaml` is a Blueprint: in the Render dashboard choose **New → Blueprint**, pick this
repository and apply. Render creates two services and from then on deploys `main` whenever GitHub
Actions passes:

- `cardauction-server`, the game server, on the free plan (it sleeps after 15 idle minutes and
  takes about a minute to wake; the web client says so while it waits). Render generates
  `SESSION_SECRET`, `METRICS_TOKEN` and `ADMIN_TOKEN`.
- `cardauction-web`, the web client, a static site (free): open its URL to play.

Each service gets `https://<name>.onrender.com` when that name is free. If Render shows another
address (a name already taken elsewhere gets a suffix), put the real addresses in `render.yaml`,
`VITE_SERVER_URL` and the `connect-src` of the Content-Security-Policy for the web client,
`CORS_ORIGIN` for the server, and deploy again (a test checks that they agree). Then check it:

```sh
pnpm smoke --server https://cardauction-server.onrender.com   # the URL Render shows
```

`/healthz` is public. `/metrics` and `/admin/status` need `Authorization: Bearer <token>` with the
tokens from the service's Environment tab; `POST /admin/drain?on=true` stops new games and
`POST /admin/games/<id>/abort` ends one game. Games live in memory until M4, so a deploy or restart
ends games in progress (players are told, and the game ends without a result).

Per-address limits (connections, private codes, code guesses) read the client's address from
`CLIENT_IP_HEADER`, `True-Client-IP` on Render. Check once after the first deploy that clients
cannot forge it: the address returned must be yours, not `203.0.113.9`.

```sh
curl -H "Authorization: Bearer $ADMIN_TOKEN" -H "True-Client-IP: 203.0.113.9" \
  https://cardauction-server.onrender.com/admin/whoami
```

## Layout

```text
packages/
  engine/      rules: cards, setup, legal moves, move validation and application, views
  protocol/    events, zod payload schemas, wire views, error codes, view-to-engine decoding
apps/
  server/      Express 5 + Socket.IO 4 game server
    src/games/ the game actor, the manager (commands, timers, disconnects, cleanup), views
    test/      integration tests: real sockets, a manual clock, every disconnect case
  web/         React 19 + Vite web client
    src/cards/ card faces and backs, drawn as SVG
    src/game/  the table: bids, table cards, hand, turn composer, result, card motion
    src/net/   the Socket.IO connection and every request to the server
    src/state/ one Zustand store, changed only through its actions
    e2e/       Playwright tests: real browsers, a real server
tools/
  client/      terminal client, random-move bots, smoke test
render.yaml    Render Blueprint: the server (free plan for now) and the web client (static site)
```

The AI (`packages/ai`) arrives with M3.

## How the web client plays

- The composer checks every bid with the engine itself, from the player's own view, before it is
  sent: it says what is missing (a card, the action card's column, the card to take) or why the
  bid is not legal (no new color, out of range…), and Confirm only sends a legal move. Assist mode
  (on by default against the AI) highlights the cards that fit a legal move.
- Every card has one identity on screen (`layoutId`), so Motion animates it from wherever it was
  to wherever it is: from a hand to the bids, from the table to a hand. Cards that were hidden
  (the opponent's) fly in from their side; a new game is dealt card by card; the numbers count up
  (and through 99 → 00); the clock drains and pulses in its last 10 s; the opponent's hand
  turns face up at the end. `prefers-reduced-motion` turns movement off.
- A lost connection is retried at once, then every few seconds; in a game the banner counts down
  the 25 s left to return, and the opponent sees the same countdown. A reload or a reopened tab
  lands back in the game, and a second tab takes over from the first (which offers to take it
  back).
- English and French, following the browser; the choice is kept on the device, like the guest
  token, the name and assist mode.

## How the server keeps games sound

| Rule from the plan                                                | Where                                 |
| ----------------------------------------------------------------- | ------------------------------------- |
| One command at a time per game, validated by the engine           | `Games.command` in `games/manager.ts` |
| Resent commands answered from a cache; stale ones answered STALE  | same pipeline, per-seat command cache |
| One timer per game, armed for its earliest deadline               | `Games.arm` and `Games.onDeadlines`   |
| 60 s turns (1 s grace for network delay); P2's timeout is a pass  | `onDeadlines`                         |
| 25 s to come back, or forfeit; the clock keeps running meanwhile  | `disconnected`, `onDeadlines`         |
| Both players away at any deadline: abandoned, deleted at once     | `onDeadlines`, `finish`, `dispose`    |
| Deleting a game clears its timer, AI job and indexes; 10 min note | `Games.dispose` (tombstones)          |
| An exception ends only its own game                               | `Games.guard`                         |
| A reaper checks everything every 30 s and counts any repair       | `Games.sweep`, `Lobby.sweep`          |
| Views never contain hidden cards                                  | `buildView` in `games/views.ts`       |

The protocol is defined once in `packages/protocol/src/events.ts`; every client event is
acknowledged with `{ ok: true, ... }` or `{ ok: false, code }`, and every game message carries the
player's complete view plus the events since the last update, for animations and the move log.

## Rules as implemented

The engine follows the rule book, with these decisions from the planning Q&A:

- **Color means suit** (5 colors). The two digit cards of a bid may share a suit, even as the two
  copies of one card (6♦ 6♦ = 66), but a new bid needs a suit that no card of the latest bid has:
  after 5♥ 8♠, both 6♥ 3♠ and 6♠ 3♥ are illegal, while 6♠ 3★ and 6♦ 3♦ are legal; after 5♥ 8♥,
  6♠ 3♥ is legal. Bids needed two different suits until 27 September 2026, when that condition was
  dropped after the first simulations.
- **The 67 undealt cards** stay face-down all game. If the table is empty, the bidder takes nothing.
- **P1's first bid** uses exactly one table card: a table action card with two hand digits, or a
  table digit with one hand digit (plus, optionally, an action card from hand). P1 then takes a
  table card like every bidder.
- Numbers wrap from 99 to 00, and an action card changes the reference value itself (column 1: +10,
  column 4: −10), so after −10 a bid may equal the old value.
- A player who must bid but has no legal bid loses at once; the last successful bidder wins.
  If P1 cannot open, P2 wins.

Timers, disconnection forfeits, resignations and abandoned games are server rules (above); the
engine records their results through `endGame`.

## Engine API in brief

```ts
import {
  applyMove,
  cryptoRng,
  legalBids,
  newGame,
  validateMove,
  viewFor,
} from '@cardauction/engine';

let state = newGame(cryptoRng()); // P2 moves first: pass or exchange
state = applyMove(state, 1, { type: 'pass' });
const [bid] = legalBids(state); // P1's legal first bids
const check = validateMove(state, 0, { type: 'bid', ...bid, take: state.table[0] });
const view = viewFor(state, 0); // what P1 may see: never the opponent's unseen cards
```

Card ids are fixed: digit card id = 20 × suit + 2 × rank + copy (0–99), action cards 100–119.
Suits are numbered ★ ♦ ♣ ♥ ♠ (rule-book order).

## Latest simulation

1,000,000 random games (seeds 1–1,000,000), every invariant checked after every move:
0 violations. The same seeds under the old and the current color rule:

| Random play, 1,000,000 games      | Two different suits required | Same suit allowed (current) |
| --------------------------------- | ---------------------------- | --------------------------- |
| P1 wins                           | 51.2%                        | 51.3%                       |
| Bids per game                     | 7.89 on average, at most 22  | 8.01 on average, at most 22 |
| Games of 13 bids or more          | 9.7%                         | 10.8%                       |
| Legal bids to choose from         | 21.7 per bid on average      | 25.3 per bid on average     |
| Bids whose two cards share a suit | 0% (not allowed)             | 13.9% (both copies: 0.6%)   |
| Games where P1 could not open     | 7                            | 7                           |

Random play is a weak player; the AI in M3 will give more meaningful balance data.
