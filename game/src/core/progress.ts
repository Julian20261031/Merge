// Captain level: experience comes from what you bring home, a little from surviving and from sinking raiders.
export const XP_WIN = 30, XP_KILL = 15;
const need = (lv: number) => 100 + (lv - 1) * 60;

export function levelOf(xp: number) {
  let lv = 1, rest = Math.max(0, Math.floor(xp));
  while (rest >= need(lv)) { rest -= need(lv); lv++; }
  return { lv, into: rest, need: need(lv) };
}

export function runXp(value: number, win: boolean, kills: number) {
  return Math.round(value * 0.5) + (win ? XP_WIN : 0) + kills * XP_KILL;
}
