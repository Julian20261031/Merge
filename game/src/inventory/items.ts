// Loot definitions. Values and weights are prototype placeholders, tuned later.
import { t, StrKey } from '../i18n/zh';

export type ItemKind = 'crate' | 'scrap' | 'cans' | 'water' | 'battery' | 'solar' | 'pipes' | 'med' | 'tarp';
export interface ItemDef {
  kind: ItemKind;
  w: number; h: number;      // footprint in grid cells (unrotated)
  value: number;
  weight: number;
  color: string;              // tile colour in the grid panel
  rare?: boolean;
  chance: number;             // relative drop weight
}

export const ITEMS: Record<ItemKind, ItemDef> = {
  scrap:   { kind: 'scrap',   w: 1, h: 1, value: 15,  weight: 2, color: '#8a5a3a', chance: 10 },
  cans:    { kind: 'cans',    w: 1, h: 1, value: 30,  weight: 1, color: '#9c8f62', chance: 8 },
  crate:   { kind: 'crate',   w: 2, h: 1, value: 60,  weight: 3, color: '#b89668', chance: 7 },
  water:   { kind: 'water',   w: 1, h: 2, value: 50,  weight: 3, color: '#4f86a8', chance: 6 },
  tarp:    { kind: 'tarp',    w: 2, h: 1, value: 35,  weight: 1, color: '#3e6a8c', chance: 5 },
  pipes:   { kind: 'pipes',   w: 1, h: 3, value: 45,  weight: 3, color: '#6f7a72', chance: 4 },
  med:     { kind: 'med',     w: 1, h: 1, value: 90,  weight: 1, color: '#d8d4c8', chance: 3 },
  solar:   { kind: 'solar',   w: 2, h: 2, value: 140, weight: 2, color: '#2f4a6a', chance: 2 },
  battery: { kind: 'battery', w: 1, h: 1, value: 220, weight: 2, color: '#f2c230', chance: 1, rare: true },
};

export const itemName = (k: ItemKind) => t(`item_${k}` as StrKey);

/** Pick a loot item; `richness` (0..1) shifts the odds toward rare things, used for far-away salvage. */
export function rollItem(rand: () => number, richness: number): ItemDef {
  const defs = Object.values(ITEMS);
  const weights = defs.map((d) => d.chance * (d.value >= 90 ? 1 + richness * 3 : 1));
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < defs.length; i++) { r -= weights[i]; if (r <= 0) return defs[i]; }
  return defs[0];
}
