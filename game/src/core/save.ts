// Local save on the device. Every access is guarded: private mode or cleared storage simply starts fresh.
const KEY = 'rustsea.save.v1';
/** Bumped when the starting boat changes: older saves keep stash and XP but start over on the new boat. */
const SAVE_VER = 2;

export interface SaveData {
  layout: { type: string; c: number; r: number; rot: boolean }[] | null;
  owned: Record<string, number> | null;
  stash: Record<string, number>;
  lifetime: number;
  runs: number;
  xp: number;
  mapId: string;
  hull: string;
  ver: number;
}

export function loadSave(): SaveData {
  const fresh: SaveData = { layout: null, owned: null, stash: {}, lifetime: 0, runs: 0, xp: 0, mapId: 'shoal', hull: 'dinghy', ver: SAVE_VER };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const old = JSON.parse(raw);
    const d: SaveData = { ...fresh, ...old };
    if (old.ver !== SAVE_VER) Object.assign(d, { layout: null, hull: fresh.hull, ver: SAVE_VER });
    return d;
  } catch {
    return fresh;
  }
}

export function writeSave(d: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* keep playing without persistence */ }
}
