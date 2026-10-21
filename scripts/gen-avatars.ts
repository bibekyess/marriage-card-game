// Makes the avatar pictures in public/avatars/ from DiceBear styles. The output is committed;
// rerun only to change the set:  npx tsx scripts/gen-avatars.ts
//
// Licences (credited in the avatar picker where needed):
//   Voxel Art, Voxel Bot, Pixel Art, Open Peeps, Critters: CC0 1.0
//   Fun Emoji (Davis Uche), Adventurer (Lisa Wischofsky): CC BY 4.0
//   Avataaars (Pablo Stanley): free for personal and commercial use
import { Avatar, Style, type StyleOptions } from "@dicebear/core";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { BOT_LOOKS, LOOK_SETS } from "../src/shared/looks";

const require = createRequire(import.meta.url);
const style = (name: string) => new Style(JSON.parse(readFileSync(require.resolve(`@dicebear/styles/${name}.json`), "utf8")));

// DiceBear style and options for each picker tab. Voxel Art is cropped to head and shoulders so it reads at 20px.
const SOURCES: Record<string, { style: string; options?: Partial<StyleOptions> }> = {
  v: { style: "voxel-art", options: { scale: 1.35, translateY: 12 } },
  x: { style: "pixel-art" },
  o: { style: "open-peeps" },
  c: { style: "critters" },
  e: { style: "fun-emoji" },
  a: { style: "adventurer" },
  t: { style: "avataaars" },
};

// Seeds just pick a varied set; change one to swap a picture.
const SEEDS = [
  "Anisha", "Rohan", "Maya", "Sujan", "Bibek", "Pema", "Kiran", "Nima",
  "Sita", "Hari", "Gita", "Ram", "Laxmi", "Dawa", "Asha", "Bikash",
  "Sarita", "Prakash", "Mina", "Tenzing", "Rita", "Suman", "Puja", "Arjun",
];
const BOT_SEEDS = ["Rob", "Chip", "Bolt", "Gear", "Byte", "Nut", "Spark", "Pixel", "Volt", "Cog", "Zip", "Dot"];

const out = new URL("../public/avatars/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.endsWith(".svg")) rmSync(new URL(f, out));

const write = (id: string, s: Style, seed: string, options: Partial<StyleOptions> = {}) =>
  // No background: the seat colour shows behind the picture.
  writeFileSync(new URL(`${id}.svg`, out), new Avatar(s, { seed, backgroundColor: [], ...options }).toString());

let n = 0;
for (const set of LOOK_SETS) {
  const src = SOURCES[set.id];
  const s = style(src.style);
  set.looks.forEach((id, i) => write(id, s, SEEDS[i % SEEDS.length] + (i >= SEEDS.length ? i : ""), src.options));
  n += set.looks.length;
}
const bot = style("voxel-bot");
BOT_LOOKS.forEach((id, i) => write(id, bot, BOT_SEEDS[i]));
console.log(`Wrote ${n + BOT_LOOKS.length} avatars to public/avatars/`);
