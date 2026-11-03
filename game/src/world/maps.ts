// The waters you can sail to from camp. Danger is a placeholder until enemies arrive.
import { StrKey } from '../i18n/zh';
import type { EnemyKind } from '../combat/enemies';

export interface MapDef {
  id: string; name: StrKey; desc: StrKey;
  radius: number; roofs: number; spots: number;
  rich: [number, number];       // richness near → far
  danger: 1 | 2 | 3;
  enemies: Record<EnemyKind, number>;
}

export const MAPS: MapDef[] = [
  { id: 'shoal', name: 'map_shoal', desc: 'map_shoal_d', radius: 140, roofs: 13, spots: 10, rich: [0, 0.4], danger: 1, enemies: { rammer: 2, harpoon: 0, gunboat: 0 } },
  { id: 'oldtown', name: 'map_oldtown', desc: 'map_oldtown_d', radius: 175, roofs: 16, spots: 13, rich: [0.15, 0.8], danger: 2, enemies: { rammer: 2, harpoon: 2, gunboat: 1 } },
  { id: 'deep', name: 'map_deep', desc: 'map_deep_d', radius: 210, roofs: 11, spots: 14, rich: [0.45, 1], danger: 3, enemies: { rammer: 3, harpoon: 2, gunboat: 3 } },
];
