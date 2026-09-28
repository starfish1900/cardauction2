# CardAuction

A two-player card game for the web, with a server-side AI. Players outbid each other with two-digit
numbers made of cards; the first player who cannot continue the auction loses.

This repository is built milestone by milestone, each one arriving as a pull request.

| Milestone | Scope                                                                         | Status  |
| --------- | ----------------------------------------------------------------------------- | ------- |
| M0        | Rules engine, property tests, random-play simulator, terminal game            | Done    |
| M1        | Game server: sessions, lobby, games, timers, disconnects, first Render deploy | Done    |
| M2        | Web client: lobby, table, turn composer, card faces, animations, reconnection | Next    |
| M3        | AI: ISMCTS with three levels, worker thread, balance lab                      | Planned |
| M4        | Hardening: Key Value snapshots, deploy handoff, soak and load tests           | Planned |
| M5        | Launch on Render (Starter instance, free Key Value, static site)              | Planned |

## Requirements

- Node.js 22.12 or later (24 recommended; CI uses the version in `.node-version`)
- pnpm 10: `corepack enable` installs the version pinned in `package.json`

## Commands

```sh
pnpm install
pnpm check                          # typecheck, lint, format check and all tests
pnpm test                           # engine, protocol and server integration tests
pnpm sim                            # 1,000,000 random games, every invariant checked
pnpm sim --games 20000 --seed 7     # smaller reproducible run
pnpm play                           # play in the terminal against a random bot (no server)
pnpm dev                            # game server on http://localhost:3000, restarts on changes
pnpm build                          # bundle the server into apps/server/dist/main.js
pnpm online --name Ada              # play on a server from a terminal (see below)
pnpm bot --bots 10 --games 5        # bots playing random legal moves against a server
pnpm smoke --server <url>           # health check, then two bots play a whole game
```

## Playing online before the web client

Until the web client arrives (M2), a terminal client plays on any server with the notation of
`pnpm play`. Start a server with `pnpm dev`, then in two other terminals:

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
repository and apply. Render creates `cardauction-server` on the free plan (it sleeps after
15 idle minutes and takes about a minute to wake), generates `SESSION_SECRET`, `METRICS_TOKEN`
and `ADMIN_TOKEN`, and from then on deploys `main` whenever GitHub Actions passes. Then check it:

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
tools/
  client/      terminal client, random-move bots, smoke test
render.yaml    Render Blueprint (the server on the free plan for now)
```

The web client (`apps/web`) and the AI (`packages/ai`) arrive with M2 and M3.

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
