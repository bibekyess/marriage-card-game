# Marriage Card Game — Plan

A browser game for Nepali **Marriage** (Nepal standard rules). The host creates a table and shares a link or code. Family members join from their phones and play a 5-round match with the full rules. The app then scores every round and shows who owes whom, in the currency the table chose.

---

## 1. Brainstorm

### Who and where
- Families and friends, often on phones held in **landscape** at the dinner table. Some play remotely from Korea and Nepal on video calls.
- People join by tapping a shared link. **Nobody signs up**: they type a name and play.
- Refreshing, locking the screen or a dropped connection is common on phones, so **reconnecting must be seamless**.

### What makes it fun (keep), what's noise (cut)
| Keep (v1) | Cut / later |
|---|---|
| Real-time multiplayer table with a code/link | Accounts, friends lists, chat |
| Full rules enforced by the server (so fouls can't happen) | Multiple rule presets per region |
| Bots for practice and for empty seats | Bot difficulty levels beyond one decent bot |
| 5-round match, scoreboard, money settlement | Leaderboards, history across matches |
| Currency + rate per point (NPR, KRW, …) | Live exchange rates |
| Share score image/text ("remind the losers") | Social login, push notifications |
| Sound, haptics, optional turn timer | Nepali/Hindi translations (English only for now) |

### Key decisions
| Decision | Choice | Why |
|---|---|---|
| Authority | **Server-authoritative** game state | Hands stay private; no cheating; a single source of truth makes reconnecting trivial |
| Transport | **Socket.IO** | Auto-reconnect, rooms, acks; reliable on mobile networks |
| Persistence | **Postgres** (JSONB state per table) | A server restart or deploy doesn't lose games in progress; a refresh resumes |
| Identity | Random seat token in `localStorage` per table | No accounts; a refresh or reconnect re-attaches to the same seat |
| Packaging | **Docker Compose**: `db` (postgres:16-alpine) + `app` (Node 22) | One command to run anywhere |
| Frontend | **React 18 + Vite + TypeScript + Tailwind + shadcn/ui** (Radix primitives) | Polished, accessible dialogs, sheets, selects, switches and tabs; the card table itself is custom |
| Shared code | `src/shared` engine used by the server **and** the client | The client can show "Pure 2/3" and "ready to declare" hints computed by the same rules the server enforces |
| Animation | CSS transitions + `framer-motion` for cards and dialogs | Smooth card movement without a game engine |

> shadcn CLI note: the registry host is blocked in this build environment, so the shadcn components are written into the repo by hand in the standard layout (`src/client/components/ui/*`, `cn()` helper, CSS variables), on top of `@radix-ui/*`, `class-variance-authority`, `tailwind-merge` and `lucide-react`. The result is identical to running the CLI.

---

## 2. Rules spec (what the engine implements)

Defaults are configurable per table by the host.

**Setup.** 3 decks (156 cards), 2–5 players, 21 cards each. One stock card is set aside face down as the **Maal** (tiplu) card. One card starts the discard pile. Round 1: the last seat deals and seat 1 plays first; the deal then rotates clockwise.

**Turn.** Draw the top **stock** card or the top **discard**, then discard one card. You can't throw back the card you just picked up. If the stock runs out, the discards are reshuffled (except the top card).

**Pick-up rule** (`restrictPickup`, default on). Before seeing the Maal, you may take the discard only if it completes a pure set with two cards in your hand, or a dublee pair when dublees are allowed. Once you've seen, you can pick up freely.

**Seeing the Maal** (on your turn, before or after drawing):
- Show **3 pure sets**: pure sequences (same suit, consecutive; A low or high, no wrap) or tunnels (3 identical cards).
- **Tunnela at the start:** before their first draw, a player may show every tunnel they were dealt. Each counts as one of the 3 pure sets (3 tunnels = maal seen at once). Only these tunnels score, and only if the player sees the maal; afterwards the dublee route is closed to them.
- Or show **7 dublees** (pairs of identical cards). Allowed only when dublees are on and there are **4+ players**.

**Wild cards** (once you've seen): Tiplu (same rank and suit), Poplu (+1, same suit), Jhiplu (−1, same suit), Alter (same rank, same colour, other suit), and Plain wilds (same rank, opposite colour). All of them are wild, but plain wilds score nothing.

**Printed cards** (settings, default 3 Jokers + 1 Bhoot, 160 cards). Jokers are dead until you've seen, then wild; they score 5/15/25 for 1/2/3 Jokers, like alters. The Bhoot is wild from the start: it can fill a pure sequence or tunnel to see the maal (not a tunnela shown before the first draw), still counts as pure, scores 5, and can never be thrown. Any two printed cards make a dublee. The maal and the first face-up card are never printed cards.

**Declare (win).** After drawing, a player who has seen arranges every card left in their hand, except one discard, into sequences (3+, wilds allowed), trials (3–4 of the same rank in different suits, wilds allowed) or tunnels. A dublee player wins by holding an **8th dublee**.

**Maal points** (seen players only, by default): Tiplu 3/7/15 for 1/2/3 cards, Poplu and Jhiplu 2/5/10 each, Alter 5/15/25, Jokers 5/15/25 for 1/2/3 cards, Bhoot 5, Marriage (tiplu + poplu + jhiplu) 10/30/50 for 1/2/3 sets, replacing those cards' own points, tunnel 5 each (only tunnels shown at the start, by players who saw).

**Round settlement.** Each player's points = N × own maal − total maal (every pair settles the difference). Then every loser pays the winner **3** if they saw the Maal, **10** if not, plus **+5** each if the winner won by dublees. The points add up to 0.

**Unseen players' maal** (`unseenRule`):
- **murder** (default): not counted.
- **kidnap**: goes to the winner.
- **count**: counted normally.

**Fouls.** These can't happen: the server rejects an invalid show or declare and tells the player why.

**Match.** N rounds (default 5; 0 = until the host ends it). Totals × rate per point = money. Settlement uses the **fewest transfers** (greedy largest debtor → largest creditor).

---

## 3. Architecture

```
docker-compose.yml        db (postgres:16-alpine, volume) + app (multi-stage Dockerfile)
src/shared/               pure TypeScript, no I/O
  cards.ts                card ids, decks, maal kinds
  melds.ts                set checks, partitioning, show/declare finders
  scoring.ts              maal points, round scoring, settlement
  settings.ts             settings, defaults, currencies, sanitising
  bot.ts                  bot decisions (draw / show / declare / discard)
  protocol.ts             view + message types
src/server/
  table.ts                Table state machine (lobby → playing → roundEnd → matchEnd)
  db.ts                   Postgres store (JSONB) + in-memory store for dev and tests
  index.ts                Express (static client, /api/health) + Socket.IO handlers, bot/timer scheduler
src/client/               React app (Vite)
  lib/                    socket client, session store, sounds, share-image
  components/ui/          shadcn components
  components/game/        PlayingCard, Hand, Felt, Seat, ActionBar, …
  screens/                Home, CreateTable, Join, Lobby, Table, RoundResult, Scoreboard, Settle, Rules
tests/                    vitest: engine, table, socket integration; Playwright e2e + screenshots
```

**Privacy.** The server sends each player a *personal view*: their own hand, opponents' card counts, the shown sets, and the Maal only if they've seen it. Everything is revealed only when the round ends.

**Reconnect.** Socket.IO reconnects, the client emits `resume {code, token}`, and the server re-attaches the seat and pushes a fresh view. An offline player on their turn is auto-played after 45 s so the table never gets stuck. The host can also hand a seat to a bot.

**Automation.** After every change the scheduler arms one timer per table: a bot move (speed-dependent delay), a turn-timer timeout, or an offline auto-play.

---

## 4. Screens (UX)

1. **Home.** Brand, your name, **Create table**, **Join with code**, **Practice with bots**, Rules.
2. **Create table / Edit rules.** Rounds, rate + currency, Murder/Kidnap/Count, point values, dublee toggles, pick-up rule, turn timer, bot speed. Uses a shadcn Tabs layout: Overview / House rules.
3. **Lobby.** Big table code, share-link button, seats (avatar, name, bot or online), host: add bot, remove, **Deal**.
4. **Table** (landscape-first, works in portrait). Felt oval with opponents around the top, stock / Maal / discard in the centre, and a turn hint banner. My hand is fanned at the bottom (tap to select, drag to reorder, swipe up to discard). The action bar has Sort, Group, **Show (Pure n/3 · Dublee n/7)**, **Declare** and **Discard**. A top-bar pill shows "Round 2 of 5 · You +12" and a turn timer ring.
5. **Round result.** Winner, Maal card, everyone's cards with wild markers, maal breakdown, round points. Host: **Deal next round**.
6. **Scoreboard sheet.** Grid of rounds × players, totals, money row.
7. **Settle up.** Net money per player, "who pays whom" transfers, **Share image** (canvas PNG via the Web Share API) and **Copy text**.
8. **Menu.** Scoreboard, Settle, Rules, Sound/Haptics, Invite, host tools (players, rules, end match), Leave.

Design language: dark green felt and near-black surfaces, a gold accent, Plus Jakarta Sans, large touch targets, subtle motion. Cards are crisp vector cards with gold wild-card markers.

---

## 5. Phases

Each phase ends with an **Opus review** (correctness and code quality) and a fix pass. Mechanical coding can go to Sonnet agents; every piece of their output is reviewed by Opus before it's accepted.

### Phase 1 — Game engine (logic) ✅ draft exists
- Cards, melds, partition search, show/declare finders, scoring, settlement, settings sanitising, bot heuristics.
- **Accept when:** unit tests cover every rule above, bot-only matches always finish, points sum to 0, and an Opus review has no open correctness findings.

### Phase 2 — Server, persistence, Docker
- Table state machine, Socket.IO protocol, private views, bots, turn timer, offline auto-play, Postgres store, restore on boot.
- Dockerfile + `docker-compose.yml` (db health check, volume, env).
- **Tests:** socket integration (two clients join, play turns, one refreshes and resumes the same seat; a restart restores tables), plus `docker compose up` smoke test hitting `/api/health`.
- **Accept when:** tests pass, compose runs, and the Opus review is clean.

### Phase 3 — Client foundation (functional, plain styling)
- Vite + React + Tailwind + shadcn setup; socket/session store; routing (`/`, `/t/:code`); every screen working end to end, deliberately unpolished.
- **Tests:** Playwright e2e — create table → add bots → deal → draw/discard → reload page → still seated → finish match (with a test hook for a fast bot speed) → settlement visible.
- **Accept when:** a whole match can be played in the browser, refresh resumes, and the Opus review is clean.

### Phase 4 — UI/UX polish
- Design tokens, card art, felt table, seat layout for 2–5 players, hand fan + drag/swipe, animations, timer ring, round result and settlement design, share image, sounds and haptics, empty/error/reconnecting states.
- **Screenshots** at phone landscape (844×390), phone portrait (390×844) and desktop (1440×900) for every screen; iterate until it's clean.
- **Accept when:** an Opus design + code review of the screenshots and code is clean.

### Phase 5 — QA, hardening, docs
- Full e2e regression, multi-tab game (2 humans), accessibility pass (focus, labels, contrast), input validation and rate-limit sanity, README (run, deploy, rules), final screenshots.
- Push the branch; summary for the user.

---

## 6. Risks
- **Declare search cost** on phones → partition is memoised and capped at 5-card groups (longer runs split losslessly). Measured < 200 ms worst case on the server; the client only computes on its own turn.
- **Rule variations between families** → the house rules are settings, not code paths.
- **Mobile Safari audio** → unlock WebAudio on the first tap.
- **Small screens with 22 cards** → computed overlap, two-row hand in portrait.

---

## 7. Round 2 (requested after v1)

### Phase 6 — Match history & seat persistence (logic)
- **Match history (per device)**: when a match ends, save a summary in `localStorage` (date, table code, players, points per round, totals, currency/rate, transfers). Home → "Match history" lists them; each opens the full scoreboard + settle-up and can re-share the scorecard.
- **Seat persistence**: seat tokens already live in `localStorage`; additionally cache the last table view per code so a refresh renders instantly while reconnecting, add "Your tables" (resume) on Home using a public `GET /api/tables/:code` status check, and never forget a seat on a network error (only when the server says the seat/table is gone).
- Tests: unit tests for history storage, e2e for "refresh → instant table" and "Home → Your tables → resume".

### Phase 7 — Themes (UI)
Per-viewer theme picker (Menu + Home), saved in `localStorage`, applied as `data-theme` with CSS variables + decoration components. Decorations stay out of the play area; `prefers-reduced-motion` respected.
| Theme | Felt & page | Decorations | Card back | Maal / turn |
|---|---|---|---|---|
| Classic | current green | — | green/gold diamond | gold glow |
| Royal Red & Gold | deep crimson felt with gold mandala pattern | marigold + jamara garland across the top | crimson with gold mandala | gold border + jamara icon; orange-yellow turn pill, tika-dot pills |
| Azure Kite Festival | deep blue/teal felt | paper buntings along the top, kites in corners | colourful kite pattern | festive yellow turn pill, tika badges on avatars |
| Festival Glow | dark emerald | gold bokeh drifting, "Vijaya Dashami Subhakamana" watermark, gold marigold corners | dark green with gold kalash line-art | soft gold halo |

### Phase 8 — Screenshot review & release
Screenshots for every theme at phone landscape/portrait + desktop; Opus design + code review; fixes; push.
