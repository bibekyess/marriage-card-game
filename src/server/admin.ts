import { createHash, timingSafeEqual } from "node:crypto";
import { formatEvent, GameEvent, Stats } from "./events";

export interface LiveTable {
  code: string;
  status: string;
  round: number;
  rounds: number;
  players: { name: string; bot: boolean; away: boolean }[];
}

/** HTTP Basic auth: any username, the password must equal the token. */
export function basicAuthOk(header: string | undefined, token: string): boolean {
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const given = decoded.slice(decoded.indexOf(":") + 1);
  // Hash both sides so the comparison is constant-time whatever the lengths.
  const h = (x: string) => createHash("sha256").update(x).digest();
  return timingSafeEqual(h(given), h(token));
}

const esc = (x: unknown) =>
  String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const STYLE = `
:root{--bg:#0b2a1f;--panel:#103a2b;--line:#1f5a42;--fg:#f1ead2;--dim:#9fb8a8;--gold:#e0b04a}
*{box-sizing:border-box}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
main{max-width:960px;margin:0 auto}
h1{color:var(--gold);font-size:22px;margin:0 0 4px}
h2{color:var(--gold);font-size:16px;margin:24px 0 8px}
a{color:var(--gold)}
.dim{color:var(--dim)}
.box{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;overflow-x:auto}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:5px 10px 5px 0;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
th{color:var(--dim);font-weight:600}
code{font-family:ui-monospace,monospace;font-size:12px}
`;

export function renderAdmin(d: { live: LiveTable[]; stats: Stats; events: GameEvent[]; umamiUrl?: string; now?: number }): string {
  const now = d.now ?? Date.now();
  const live = d.live.length
    ? `<table><tr><th>Code</th><th>Status</th><th>Round</th><th>Players</th></tr>${d.live
        .map(
          (t) =>
            `<tr><td><code>${esc(t.code)}</code></td><td>${esc(t.status)}</td><td>${esc(t.round)}${t.rounds > 0 ? `/${esc(t.rounds)}` : ""}</td><td>${t.players
              .map((p) => `${esc(p.name)}${p.bot ? " (bot)" : p.away ? ' <span class="dim">(away)</span>' : ""}`)
              .join(", ")}</td></tr>`,
        )
        .join("")}</table>`
    : '<p class="dim">No tables right now.</p>';
  const row = (label: string, p: Stats["all"]) =>
    `<tr><td>${label}</td><td>${p.tables}</td><td>${p.matches}</td><td>${p.players}</td><td>${p.visitors}</td></tr>`;
  const totals = `<table><tr><th></th><th>Tables created</th><th>Matches finished</th><th>Unique players</th><th>Unique visitors</th></tr>${row("Today (UTC)", d.stats.today)}${row("Last 7 days", d.stats.week)}${row("All time", d.stats.all)}</table>`;
  const top = d.stats.top.length
    ? `<table><tr><th>Player</th><th>Matches</th></tr>${d.stats.top.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.matches}</td></tr>`).join("")}</table>`
    : '<p class="dim">No finished matches yet.</p>';
  const events = d.events.length
    ? `<table>${d.events.map((e) => `<tr><td><code>${esc(formatEvent(e))}</code></td></tr>`).join("")}</table>`
    : '<p class="dim">No events yet.</p>';
  const umami = d.umamiUrl ? `<p><a href="${esc(d.umamiUrl)}" rel="noreferrer">Open the Umami dashboard</a></p>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30"><meta name="robots" content="noindex"><title>Admin</title><style>${STYLE}</style></head>
<body><main><h1>Marriage admin</h1><p class="dim">Updated ${esc(new Date(now).toISOString())}, refreshes every 30 s.</p>${umami}
<h2>Live now</h2><div class="box">${live}</div>
<h2>Totals</h2><div class="box">${totals}</div>
<h2>Top players</h2><div class="box">${top}</div>
<h2>Recent events</h2><div class="box">${events}</div>
</main></body></html>`;
}
