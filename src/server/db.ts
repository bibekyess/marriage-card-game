import pg from "pg";
import { computeStats, DAY_MS, GameEvent, Stats } from "./events";
import type { TableState } from "./table";

// Tables are kept in memory while the server runs and written to Postgres after every change,
// so a server restart (or deploy) doesn't lose games in progress.

export interface Store {
  init(): Promise<void>;
  loadActive(): Promise<TableState[]>;
  save(state: TableState): Promise<void>;
  remove(code: string): Promise<void>;
  close(): Promise<void>;
  /** Append one event to the log (never deleted by table cleanup). */
  logEvent(e: GameEvent): Promise<void>;
  stats(now?: number): Promise<Stats>;
  /** Newest first. */
  recentEvents(limit: number): Promise<GameEvent[]>;
  /** Delete `visit` events older than `before` (epoch ms); game events are kept. */
  pruneVisits(before: number): Promise<void>;
}

const MEMORY_EVENTS = 500;

/** Development store: keeps only the last 500 events, so its "all time" stats are just the recent past. */
export class MemoryStore implements Store {
  async init() {}
  async loadActive(): Promise<TableState[]> {
    return [];
  }
  async save() {}
  async remove() {}
  async close() {}
  private events: GameEvent[] = [];
  async logEvent(e: GameEvent) {
    this.events.push(e);
    if (this.events.length > MEMORY_EVENTS) this.events.shift();
  }
  async stats(now = Date.now()) {
    return computeStats(this.events, now);
  }
  async recentEvents(limit: number) {
    return this.events.slice(-limit).reverse();
  }
  async pruneVisits() {} // Already capped at MEMORY_EVENTS.
}

export class PgStore implements Store {
  pool: pg.Pool;
  private lastPoolLog = 0;
  constructor(url: string) {
    this.pool = new pg.Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
      idleTimeoutMillis: 30_000,
    });
    // Idle clients can error when the database restarts; without a handler that kills the process.
    this.pool.on("error", (e) => {
      const now = Date.now();
      if (now - this.lastPoolLog > 30_000) {
        this.lastPoolLog = now;
        console.error("postgres pool error", e.message);
      }
    });
  }

  async init() {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS game_tables (
            code text PRIMARY KEY,
            state jsonb NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS game_tables_updated ON game_tables (updated_at);
          CREATE TABLE IF NOT EXISTS events (
            id bigserial PRIMARY KEY,
            at timestamptz NOT NULL DEFAULT now(),
            type text NOT NULL,
            code text,
            name text,
            ip_hash text,
            data jsonb
          );
          CREATE INDEX IF NOT EXISTS events_type_at ON events (type, at);
        `);
        return;
      } catch (e) {
        if (attempt >= 30) throw e;
        console.log(`Waiting for database (${(e as Error).message})…`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  async loadActive() {
    await this.pool.query(`DELETE FROM game_tables WHERE updated_at < now() - interval '3 days'`);
    const r = await this.pool.query(`SELECT state FROM game_tables`);
    return r.rows.map((x) => x.state as TableState);
  }

  async save(state: TableState) {
    await this.pool.query(
      `INSERT INTO game_tables (code, state, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (code) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
      [state.code, JSON.stringify(state)],
    );
  }

  async remove(code: string) {
    await this.pool.query(`DELETE FROM game_tables WHERE code = $1`, [code]);
  }

  async logEvent(e: GameEvent) {
    await this.pool.query(`INSERT INTO events (at, type, code, name, ip_hash, data) VALUES (to_timestamp($1 / 1000.0), $2, $3, $4, $5, $6)`, [
      e.at,
      e.type,
      e.code ?? null,
      e.name ?? null,
      e.ipHash ?? null,
      e.data ? JSON.stringify(e.data) : null,
    ]);
  }

  async stats(now = Date.now()): Promise<Stats> {
    const periods = [
      { key: "today", since: now - (now % DAY_MS) },
      { key: "week", since: now - 7 * DAY_MS },
      { key: "all", since: 0 },
    ] as const;
    const [counts, top] = await Promise.all([
      this.pool.query(
        `SELECT p.key,
           count(*) FILTER (WHERE e.type = 'table.created')::int AS tables,
           count(*) FILTER (WHERE e.type = 'match.ended')::int AS matches,
           count(DISTINCT e.name) FILTER (WHERE e.type IN ('table.created', 'player.joined'))::int AS players,
           count(DISTINCT e.ip_hash) FILTER (WHERE e.type = 'visit')::int AS visitors
         FROM unnest($1::text[], $2::float8[]) AS p(key, since)
         JOIN events e ON e.at >= to_timestamp(p.since / 1000.0)
         GROUP BY p.key`,
        [periods.map((p) => p.key), periods.map((p) => p.since)],
      ),
      this.pool.query(
        `SELECT n AS name, count(*)::int AS matches
         FROM events, jsonb_array_elements_text(data -> 'players') AS n
         WHERE type = 'match.ended' AND jsonb_typeof(data -> 'players') = 'array'
         GROUP BY n ORDER BY matches DESC, n COLLATE "C" LIMIT 10`,
      ),
    ]);
    const zero = { tables: 0, matches: 0, players: 0, visitors: 0 };
    const period = (key: string) => {
      const { tables, matches, players, visitors } = counts.rows.find((r) => r.key === key) ?? zero;
      return { tables, matches, players, visitors };
    };
    return { today: period("today"), week: period("week"), all: period("all"), top: top.rows };
  }

  async recentEvents(limit: number): Promise<GameEvent[]> {
    const r = await this.pool.query(
      `SELECT (extract(epoch FROM at) * 1000)::bigint AS at, type, code, name, ip_hash, data FROM events ORDER BY id DESC LIMIT $1`,
      [limit],
    );
    return r.rows.map((x) => ({
      at: Number(x.at),
      type: x.type,
      code: x.code ?? undefined,
      name: x.name ?? undefined,
      ipHash: x.ip_hash ?? undefined,
      data: x.data ?? undefined,
    }));
  }

  async pruneVisits(before: number) {
    await this.pool.query(`DELETE FROM events WHERE type = 'visit' AND at < to_timestamp($1 / 1000.0)`, [before]);
  }

  async close() {
    await this.pool.end();
  }
}
