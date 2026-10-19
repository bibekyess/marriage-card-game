import type { TableView } from "../../shared/protocol";
import { formatMoney } from "../../shared/settings";
import { settlement, signed, totals } from "./format";

/** Plain-text summary for messaging apps. */
export function scoreText(v: TableView) {
  const name = (id: string) => v.seats.find((s) => s.id === id)?.name ?? "Player";
  const t = totals(v);
  const { net, transfers } = settlement(v);
  const lines = [
    `🃏 Marriage — table ${v.code} · ${v.rounds.length} round${v.rounds.length === 1 ? "" : "s"}`,
    "",
    ...Object.keys(t)
      .sort((a, b) => t[b] - t[a])
      .map((id, i) => `${i === 0 ? "👑" : "  "} ${name(id)}: ${signed(t[id])} pts (${formatMoney(net[id] ?? 0, v.settings.currency)})`),
  ];
  if (transfers.length) {
    lines.push("", "💸 Settle up:");
    for (const tr of transfers) lines.push(`• ${name(tr.from)} pays ${name(tr.to)} ${formatMoney(tr.amount, v.settings.currency)}`);
  }
  lines.push("", "Pay up, friends 😄");
  return lines.join("\n");
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A shareable scorecard image (PNG). */
export async function scoreImage(v: TableView): Promise<Blob> {
  await document.fonts?.ready;
  const name = (id: string) => v.seats.find((s) => s.id === id)?.name ?? "Player";
  const t = totals(v);
  const { net, transfers } = settlement(v);
  const ids = Object.keys(t).sort((a, b) => t[b] - t[a]);
  const W = 1080;
  const H = 360 + ids.length * 110 + (transfers.length ? 120 + transfers.length * 74 : 0) + 120;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const font = (w: number, s: number) => `${w} ${s}px "Plus Jakarta Sans", system-ui, sans-serif`;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0d3b2b");
  bg.addColorStop(1, "#06110d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#f5b83d";
  ctx.font = font(800, 30);
  ctx.fillText("MARRIAGE · SCORECARD", 80, 110);
  ctx.fillStyle = "#eef3ef";
  ctx.font = font(800, 64);
  ctx.fillText(`Table ${v.code}`, 80, 190);
  ctx.fillStyle = "#8fa59b";
  ctx.font = font(500, 30);
  const date = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  ctx.fillText(`${v.rounds.length} rounds · ${v.settings.pointRate} ${v.settings.currency} per point · ${date}`, 80, 240);

  let y = 300;
  ids.forEach((id, i) => {
    roundRect(ctx, 60, y, W - 120, 92, 22);
    ctx.fillStyle = i === 0 ? "rgba(245,184,61,0.16)" : "rgba(255,255,255,0.05)";
    ctx.fill();
    ctx.fillStyle = i === 0 ? "#f5b83d" : "#8fa59b";
    ctx.font = font(800, 34);
    ctx.fillText(i === 0 ? "👑" : `${i + 1}`, 92, y + 58);
    ctx.fillStyle = "#eef3ef";
    ctx.font = font(700, 38);
    ctx.fillText(name(id), 160, y + 60);
    ctx.textAlign = "right";
    const m = net[id] ?? 0;
    ctx.fillStyle = m > 0 ? "#34d399" : m < 0 ? "#f87171" : "#eef3ef";
    ctx.font = font(800, 40);
    ctx.fillText(formatMoney(m, v.settings.currency), W - 92, y + 50);
    ctx.fillStyle = "#8fa59b";
    ctx.font = font(500, 24);
    ctx.fillText(`${signed(t[id])} pts`, W - 92, y + 80);
    ctx.textAlign = "left";
    y += 110;
  });

  if (transfers.length) {
    y += 40;
    ctx.fillStyle = "#f5b83d";
    ctx.font = font(800, 30);
    ctx.fillText("WHO PAYS WHOM", 80, y);
    y += 30;
    for (const tr of transfers) {
      ctx.fillStyle = "#eef3ef";
      ctx.font = font(600, 34);
      ctx.fillText(`${name(tr.from)}  →  ${name(tr.to)}`, 80, y + 40);
      ctx.textAlign = "right";
      ctx.font = font(800, 34);
      ctx.fillStyle = "#f5b83d";
      ctx.fillText(formatMoney(tr.amount, v.settings.currency), W - 80, y + 40);
      ctx.textAlign = "left";
      y += 74;
    }
  }

  ctx.fillStyle = "#5d7369";
  ctx.font = font(500, 24);
  ctx.fillText("Played on Marriage — pay up, friends 😄", 80, H - 60);
  return new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
}
