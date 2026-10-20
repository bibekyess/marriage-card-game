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
cp .env.example .env        # then set POSTGRES_PASSWORD (required)
docker compose up -d --build
open http://localhost:9062
```

This starts two containers: `db` (postgres:16-alpine, data in the `pgdata` volume) and `app` (Node 22). `bash scripts/smoke.sh --down` builds the stack, waits for `/api/health`, then tears it down.

To let family join from other devices, put a reverse proxy on the same host (Caddy, nginx…) in front of `localhost:9062`; compose only publishes the port on 127.0.0.1. The app serves the web page and the realtime socket on the same port. Set `TRUST_PROXY=1` when it sits behind a proxy, so rate limits see real client addresses.

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
| `ADMIN_TOKEN` | server | Enables `/admin` (Basic auth, any username, this as the password); also the salt for stored visitor hashes |
| `UMAMI_URL` | server | Umami base URL (`http://umami:3000` in compose); enables the same-origin `/stats` proxy |
| `UMAMI_WEBSITE_ID` | server | Umami website UUID; adds the tracker script to the page |
| `UMAMI_DASHBOARD_URL` | server | Link to the Umami dashboard shown on `/admin` |
| `UMAMI_APP_SECRET`, `UMAMI_DB_PASSWORD`, `UMAMI_PORT` | compose | Umami container secret, its database password, and its localhost port (default 9063) |
| `BOT_DELAY_SCALE` | server | Multiplies bot "thinking" delays; tests use `0.05`. Leave unset in production |
| `API_URL` | Vite dev server | Where `npm run dev:client` proxies the socket/API (default `http://localhost:3000`) |

## Monitoring

Every table opened, player joined, match started/finished and so on is printed as one line, so `docker compose logs app` is a readable history. The same events are kept in Postgres (an append-only `events` table) with addresses stored only as a short salted hash. The salt is `ADMIN_TOKEN` (random per start if unset), so hashes are pseudonymous, and rotating the token resets unique-visitor counts. Page visits are counted once per visitor per half hour, for `/` and `/t/CODE` only, and are deleted after 90 days; game events are kept. The in-memory dev store keeps only the last 500 events.

**Admin page.** Set `ADMIN_TOKEN` in `.env` (at least 16 characters, or the page stays off; `openssl rand -hex 32` makes a good one) and open `/admin` (any username, the token as password): tables live now, totals for today / 7 days / all time, top players and the latest events. Without a token the page doesn't exist.

**Visitor stats (Umami, optional).** It runs as extra containers, off by default:

1. In `.env` set `UMAMI_APP_SECRET`, `UMAMI_DB_PASSWORD`, and `UMAMI_URL=http://umami:3000`.
2. `docker compose --profile stats up -d`, then open `http://localhost:9063` (use an SSH tunnel on a server).
3. Log in as `admin` / `umami` and change the password immediately.
4. Add a website, copy its ID into `UMAMI_WEBSITE_ID` in `.env` (and the dashboard URL into `UMAMI_DASHBOARD_URL` if you like), then `docker compose up -d` to restart the app.

The app serves the tracker and receives its events on its own origin (`/stats/…`) and forwards them to Umami, so ad blockers don't hide it and Umami sees real client addresses (set `TRUST_PROXY=1` behind a proxy). If Umami is down, the game is unaffected.

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
