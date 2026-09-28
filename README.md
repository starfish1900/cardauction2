# CardAuction

A two-player card game for the web, with a server-side AI. Players outbid each other with two-digit
numbers made of cards; the first player who cannot continue the auction loses.

This repository is built milestone by milestone, each one arriving as a pull request.

| Milestone | Scope                                                                         | Status  |
| --------- | ----------------------------------------------------------------------------- | ------- |
| M0        | Rules engine, property tests, random-play simulator, terminal game            | Done    |
| M1        | Game server: sessions, lobby, games, timers, disconnects, first Render deploy | Next    |
| M2        | Web client: lobby, table, turn composer, card faces, reconnection             | Planned |
| M3        | AI: ISMCTS with three levels, worker thread, balance lab                      | Planned |
| M4        | Hardening: Key Value snapshots, deploy handoff, soak and load tests           | Planned |
| M5        | Launch on Render (Starter instance, free Key Value, static site)              | Planned |

## Requirements

- Node.js 22.12 or later (24 recommended; CI uses the version in `.node-version`)
- pnpm 10: `corepack enable` installs the version pinned in `package.json`

## Commands

```sh
pnpm install
pnpm check                          # typecheck, lint, format check and tests
pnpm test                           # unit and property tests
pnpm sim                            # 1,000,000 random games, every invariant checked
pnpm sim --games 20000 --seed 7     # smaller reproducible run
pnpm play                           # play in the terminal against a random bot
pnpm play --seat p2 --seed 42       # choose your seat and a reproducible deal
```

## Layout

```text
packages/
  engine/      rules: cards, setup, legal moves, move validation and application, views
    src/       the engine (no dependencies; runs in Node and in browsers)
    test/      rule-book cases, error codes, brute-force and property-based tests
    scripts/   simulate.ts (random-play simulator) and play.ts (terminal game)
```

The server (`apps/server`), web client (`apps/web`) and AI (`packages/ai`) arrive with later
milestones.

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

Timers, disconnection forfeits, resignations and abandoned games are server rules; the engine
records their results through `endGame`.

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
