import { MemoryStore, PgStore } from "./db";
import { startServer } from "./index";

const url = process.env.DATABASE_URL;
// BOT_DELAY_SCALE speeds bots up for automated tests (0 = instant). Leave unset in production.
const delayScale = process.env.BOT_DELAY_SCALE === undefined ? 1 : Number(process.env.BOT_DELAY_SCALE);
startServer({ port: Number(process.env.PORT || 3000), store: url ? new PgStore(url) : new MemoryStore(), delayScale })
  .then((srv) => {
    console.log(`Marriage table server on http://localhost:${srv.port} (${srv.tables.size} tables restored, ${url ? "postgres" : "memory"})`);
    let stopping = false;
    const stop = (sig: string) => {
      if (stopping) return;
      stopping = true;
      console.log(`${sig} received, shutting down`);
      setTimeout(() => process.exit(1), 8000).unref();
      srv.close().then(
        () => process.exit(0),
        (e) => {
          console.error("shutdown failed", e);
          process.exit(1);
        },
      );
    };
    process.on("SIGTERM", () => stop("SIGTERM"));
    process.on("SIGINT", () => stop("SIGINT"));
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
