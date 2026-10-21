// Avatar "looks": pre-made pictures in public/avatars/<id>.svg (made by scripts/gen-avatars.ts).
// Players pick from LOOK_SETS; bots get BOT_LOOKS so they're easy to tell apart.

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => prefix + String(i + 1).padStart(2, "0"));

/** Groups shown as tabs in the picker. `id` is also the prefix of each look id. */
export const LOOK_SETS = [
  { id: "v", label: "Voxel", looks: ids("v", 24) },
  { id: "x", label: "Pixel", looks: ids("x", 18) },
  { id: "o", label: "Peeps", looks: ids("o", 18) },
  { id: "c", label: "Critters", looks: ids("c", 18) },
  { id: "e", label: "Emoji", looks: ids("e", 18) },
  { id: "a", label: "Cartoon", looks: ids("a", 18) },
  { id: "t", label: "Avataaars", looks: ids("t", 18) },
] as const;

export const PLAYER_LOOKS: string[] = LOOK_SETS.flatMap((s) => s.looks);
export const BOT_LOOKS = ids("b", 12);

/** A look a player may choose (bot looks are kept for bots). */
export const isPlayerLook = (x: unknown): x is string => typeof x === "string" && PLAYER_LOOKS.includes(x);

/** A look that has a picture. */
export const isLook = (x: unknown): x is string => isPlayerLook(x) || (typeof x === "string" && BOT_LOOKS.includes(x));

/** The picker tab a look belongs to. */
export const lookSet = (look: string | null) => LOOK_SETS.find((s) => look?.startsWith(s.id)) ?? LOOK_SETS[0];

export const lookUrl = (look: string) => `/avatars/${look}.svg`;
