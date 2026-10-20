# AGENTS.md

Nepali Marriage card game in the browser: real-time tables over Socket.IO, bots, scoring, money settlement. TypeScript everywhere (Node 22 + React 18). Rules spec: `docs/PLAN.md` §2. Visual direction: `docs/DESIGN.md`.

## Commands

```bash
npm run dev          # server :3000 (in-memory store) + Vite :5173
npm test             # vitest: engine, client libs, socket integration
npm run typecheck    # tsc --noEmit (strict, noUnusedLocals)
npm run test:e2e     # build, then Playwright (phone-landscape + desktop)
bash scripts/smoke.sh --down   # docker compose up, wait for /api/health, tear down
```

Run `npm run typecheck && npm test` before finishing any change. There is no linter or formatter config; match the surrounding style.

## Architecture

| Layer | Path | Rule |
|---|---|---|
| Rules engine | `src/shared/` | Pure TS, **no I/O, no DOM, no Node APIs**. Imported by both server and client. |
| Table state machine | `src/server/table.ts` | `Table` owns `TableState` (lobby → playing → roundEnd → matchEnd). Every action validates and throws `GameError` with a user-facing message. |
| Socket server | `src/server/index.ts` | Thin: parse/validate payload, rate-limit, call a `Table` method, `reply(Ack)`, then `changed(table)` (persist + broadcast + reschedule bots/timers). |
| Persistence | `src/server/db.ts` | `Store` interface: `PgStore` (JSONB per table) when `DATABASE_URL` is set, else `MemoryStore`. Also holds the append-only `events` table. |
| Event log | `src/server/events.ts` | `EventLog.track()` prints one line and stores the event fire-and-forget; it never throws into a handler. `Table` reports game events via `onEvent`, never by doing I/O itself. IPs are stored only as salted hashes. |
| Admin page | `src/server/admin.ts` | Server-rendered `/admin` (no React), only when `ADMIN_TOKEN` is ≥ 16 chars, else 404. Escape every user string. |
| Client | `src/client/` | React + Vite + Tailwind + shadcn/ui. One socket and store in `lib/store.ts` (`useGame()`), `screens/`, `components/game/`, `components/ui/` (hand-written shadcn). |
| Tests | `tests/*.test.ts`, `tests/e2e/` | vitest + Playwright. |

### Invariants (do not break)

- **Server-authoritative.** The client never decides legality; it only sends intents. All rules live in `src/shared` and are enforced in `Table`.
- **Private views.** `Table.view(playerId)` builds each player's `TableView`: own hand only, opponents as counts, Maal hidden until that player has seen it (`maalPending` keeps it hidden until they throw after a post-draw show). Never broadcast raw `TableState`.
- **Protocol in one place.** Wire types live in `src/shared/protocol.ts`. Adding a field means: update the type, fill it in `Table.view`, then use it in the client.
- **Persisted state must stay loadable.** `TableState` is stored as JSON and restored on boot. New fields on `TableState`/`RoundState` are optional (`?`) with a safe default when read.
- **House rules are settings, not code paths.** New variants go into `Settings` + `DEFAULT_SETTINGS` + `sanitizeSettings` (clamp every untrusted value) and `RulesForm`.
- **Handlers never throw out.** Register socket events only via the local `on(...)` wrapper; reject bad input with `bad(...)`/`GameError`.
- **Reconnect is seamless.** Seat tokens and the last view live in `localStorage` (`mg.*` keys); only forget a seat when the server says it is gone. Wrap all storage access in try/catch.
- **Bots and timers** are driven by `Table.nextStep()` / `autoStep()` and one scheduler per table in `index.ts`; bot logic lives in `src/shared/bot.ts` (also reused for the client Tip hints).
- Client-side hints (`lib/hints.ts`, `lib/groups.ts`) reuse the shared engine for display only.

## Code style

- TypeScript strict; no `any` unless crossing an untrusted boundary. `@/` aliases `src/client/`; import shared code by relative path.
- Small, direct functions; no new dependencies or abstractions unless clearly needed.
- Comments are short, plain English, and explain *why*. Use `/** */` on exported fields whose meaning isn't obvious.
- Card ids are strings: rank + suit + deck index (`"10H2"`, `"AS0"`). Use helpers in `cards.ts`, don't parse ad hoc.
- User-facing text (errors, hints, logs) is short, friendly, plain English; game terms as players say them (Maal, Tiplu, dublee, tunnela).
- UI: dark felt + single gold accent; colours via theme CSS variables (`data-theme`, `lib/themes.ts`), never hard-coded per theme. Respect `prefers-reduced-motion`. Must work at 844×390, 390×844 and desktop.
- Add `data-testid` only where e2e tests need it.

## Tests

- Rule or scoring change → `tests/engine.test.ts` (round points must sum to 0).
- Server/protocol change → `tests/server.test.ts` (real sockets, `startServer({ port: 0, store, delayScale: 0, clientDir: null })`).
- Client lib logic → matching `tests/<lib>.test.ts`. UI flows → `tests/e2e/game.spec.ts`.

## Commits

Imperative subject (≤ ~60 chars, no prefix like `feat:`), blank line, short body explaining what changed and why from the player's point of view. One logical change per commit.
