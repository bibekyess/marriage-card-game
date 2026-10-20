# Marriage — Nepali card table in the browser

Play **Nepali Marriage** with family and friends from any phone or computer. No app and no accounts.

- **Open a table**, share the 4-letter code or link, and play a full match (5 rounds by default).
- **All the rules are enforced:** pure sequences and tunnels to see the Maal, Tiplu/Poplu/Jhiplu/Alter/Joker wild cards, the dublee route (7 to see, 8 to win), and the pick-up rule. Invalid shows or declares are refused with a reason, so there are no fouls.
- **Automatic scoring.** Maal points (Marriage 10, Alter 5/15/25, tunnels 5 when shown at the start), 3 / 10 game points for seen / unseen players, and **Murder** (default), **Kidnap** or **Count** for unseen players' maal.
- **Settle up.** Each table sets a price per point in NPR, KRW, INR, USD, AUD and others. The app shows who pays whom in the fewest payments, plus a **shareable scorecard image** to remind the losers.
- **Practice against bots**, or let a bot take an empty seat (or your turns).
- **Refresh-proof.** Reloading, locking your phone or losing signal puts you straight back in your seat. Games live in Postgres, so they also survive a server restart.
- **Optional turn timer**, sound and haptics. Works in landscape and portrait.

## Run it

```bash
cp .env.example .env        # optional: change ports / database password
docker compose up -d --build
open http://localhost:3000
```

This starts two containers: `db` (postgres:16-alpine, data in the `pgdata` volume) and `app` (Node 22). `bash scripts/smoke.sh --down` builds the stack, waits for `/api/health`, then tears it down.

To let family join from other devices, put the app behind any HTTPS host or reverse proxy (Caddy, nginx, a cloud VM, Render, Fly.io…). The app serves the web page and the realtime socket on the same port. Set `TRUST_PROXY=1` when it sits behind a proxy, so rate limits see real client addresses.

## Develop

```bash
npm install
npm run dev          # server on :3000 (in-memory store) + Vite on :5173
npm test             # unit + socket integration tests (vitest)
npm run test:e2e     # builds, then Playwright end-to-end tests
npm run typecheck
```

Set `DATABASE_URL=postgres://…` to use Postgres in development. `TEST_DATABASE_URL=… npm test` also runs the Postgres store test.

| Variable | Used by | Meaning |
|---|---|---|
| `PORT` | server | HTTP + socket port (default 3000) |
| `DATABASE_URL` | server | Postgres connection; without it, tables are kept in memory |
| `TRUST_PROXY` | server | `1` behind a reverse proxy: use the proxy-added `X-Forwarded-For` hop for rate limits |
| `BOT_DELAY_SCALE` | server | Multiplies bot "thinking" delays; tests use `0.05`. Leave unset in production |
| `API_URL` | Vite dev server | Where `npm run dev:client` proxies the socket/API (default `http://localhost:3000`) |

## How it's built

| Part | Where |
|---|---|
| Rules engine (cards, sets, show/declare search, scoring, settlement, bots) | `src/shared/` — pure TypeScript, used by both server and browser |
| Table state machine, private per-player views, bots/timers | `src/server/table.ts` |
| Socket.IO server, persistence, limits, health | `src/server/index.ts`, `db.ts`, `main.ts` |
| React app (Vite + Tailwind + shadcn/ui) | `src/client/` |
| Tests | `tests/` (vitest) and `tests/e2e/` (Playwright) |

The server is authoritative. Each player only ever receives their own cards, and the Maal stays hidden until they've seen it. Plan, rules spec and design notes are in [`docs/PLAN.md`](docs/PLAN.md) and [`docs/DESIGN.md`](docs/DESIGN.md).

## House rules you can change per table

Rounds (1/3/5/10/∞) · price per point and currency · Murder / Kidnap / Count · seen and unseen game points · Tiplu, Poplu/Jhiplu, Alter, Marriage and tunnel points · dublee bonus · dublees on or off, and the 4+ player limit · pick-up rule · turn timer (off/30/60/90 s) · bot speed.
