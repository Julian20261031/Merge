// Start card and end-of-run results.
import { t } from '../i18n/zh';
import { Item } from '../inventory/grid';
import { itemName } from '../inventory/items';

function card(parent: HTMLElement, cls: string, html: string) {
  const wrap = document.createElement('div');
  wrap.className = `screen ${cls}`;
  wrap.innerHTML = `<div class="card">${html}</div>`;
  parent.appendChild(wrap);
  return wrap;
}

export function showStart(parent: HTMLElement, onGo: () => void) {
  const w = card(parent, 'start', `
    <h1>${t('startTitle')}</h1>
    <p class="sub">${t('startSub')}</p>
    <p>${t('startHow')}</p>
    <p class="keys">${t('startKeys')}</p>
    <button type="button" class="btn-primary">${t('startGo')}</button>`);
  w.querySelector('button')!.addEventListener('click', () => { w.remove(); onGo(); });
}

export interface RunResult { win: boolean; kept: Item[]; lostCount: number; lifetime: number }

export function showResult(parent: HTMLElement, r: RunResult, onAgain: () => void) {
  const groups = new Map<string, { name: string; n: number; v: number; rare: boolean }>();
  for (const it of r.kept) {
    const g = groups.get(it.def.kind) ?? { name: itemName(it.def.kind), n: 0, v: 0, rare: !!it.def.rare };
    g.n++; g.v += it.def.value;
    groups.set(it.def.kind, g);
  }
  const rows = [...groups.values()].sort((a, b) => b.v - a.v)
    .map((g) => `<li class="${g.rare ? 'rare' : ''}"><span>${g.name}${g.n > 1 ? ` ×${g.n}` : ''}</span><b>${g.v}</b></li>`).join('');
  const total = r.kept.reduce((s, i) => s + i.def.value, 0);
  const w = card(parent, `result ${r.win ? 'win' : 'lose'}`, `
    <h1>${r.win ? t('resultWin') : t('resultLose')}</h1>
    <p class="sub">${r.win ? t('resultWinSub') : t('resultLoseSub')}</p>
    ${rows ? `<ul class="loot">${rows}</ul>` : `<p class="empty">${t('nothing')}</p>`}
    ${r.lostCount ? `<p class="lost">${t('lost')} ${r.lostCount}</p>` : ''}
    <div class="totals"><span>${t('total')}</span><b>${total}</b></div>
    <div class="totals small"><span>${t('lifetime')}</span><b>${r.lifetime}</b></div>
    <button type="button" class="btn-primary">${t('again')}</button>`);
  w.querySelector('button')!.addEventListener('click', () => { w.remove(); onAgain(); });
}
