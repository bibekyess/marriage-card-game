import pg from "pg";
import type { TableState } from "./table";

// Tables are kept in memory while the server runs and written to Postgres after every change,
// so a server restart (or deploy) doesn't lose games in progress.

export interface Store {
  init(): Promise<void>;
  loadActive(): Promise<TableState[]>;
  save(state: TableState): Promise<void>;
  remove(code: string): Promise<void>;
}

export class MemoryStore implements Store {
  async init() {}
  async loadActive() {
    return [];
  }
  async save() {}
  async remove() {}
}

export class PgStore implements Store {
  pool: pg.Pool;
  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 5 });
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
    await this.pool.query(`DELETE FROM game_tables WHERE updated_at < now() - interval '14 days'`);
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
}
