// Local save on the device. Every access is guarded: private mode or cleared storage simply starts fresh.
const KEY = 'rustsea.save.v1';

export interface SaveData {
  layout: { type: string; c: number; r: number; rot: boolean }[] | null;
  owned: Record<string, number> | null;
  stash: Record<string, number>;
  lifetime: number;
  runs: number;
  xp: number;
  mapId: string;
  hull: string;
}

export function loadSave(): SaveData {
  const fresh: SaveData = { layout: null, owned: null, stash: {}, lifetime: 0, runs: 0, xp: 0, mapId: 'shoal', hull: 'trawler' };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    return { ...fresh, ...JSON.parse(raw) };
  } catch {
    return fresh;
  }
}

export function writeSave(d: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* keep playing without persistence */ }
}
