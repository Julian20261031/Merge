import './style.css';
import { buildTextures, redrawTextTextures, FD } from './render/textures';
import { hs } from './core/noise';
import { loadSave, writeSave } from './core/save';
import { Layout } from './inventory/modules';
import { MAPS } from './world/maps';
import { Game } from './game';
import { Hub } from './ui/hub';
import { showResult } from './ui/screens';
import { fitStage } from './core/view';

// paper grain over everything, like the art samples
(function grain() {
  const g = document.createElement('canvas');
  g.width = g.height = 256;
  const x = g.getContext('2d')!, id = x.createImageData(256, 256);
  for (let i = 0; i < 65536; i++) { const n = 205 + Math.floor(hs(i, 77) * 50); id.data[i * 4] = n; id.data[i * 4 + 1] = n - 2; id.data[i * 4 + 2] = n - 8; id.data[i * 4 + 3] = 255; }
  x.putImageData(id, 0, 0);
  document.getElementById('grain')!.style.backgroundImage = `url(${g.toDataURL()})`;
})();
fitStage();

async function boot() {
  const fonts = document.fonts
    ? Promise.race([document.fonts.load(`40px ${FD}`, '锈海零件滨海大道出口燃料'), new Promise((r) => setTimeout(r, 2500))]).catch(() => undefined)
    : Promise.resolve();
  // let the loading text paint before the (blocking) texture generation
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  buildTextures();

  const save = loadSave();
  const layout = Layout.from(save.layout, save.owned);
  const persist = () => { save.layout = layout.toJSON(); save.owned = layout.owned; writeSave(save); };

  const ui = document.getElementById('ui')!;
  const game = new Game(document.getElementById('gl') as HTMLCanvasElement, ui);
  const hub = new Hub(ui, layout, save.stash, () => save.lifetime);
  const toCamp = () => { game.load(MAPS[0], layout, false, 7); hub.show('sail'); };

  hub.onSave = () => { persist(); game.rebuildBoat(layout); };
  hub.onDepart = (map) => { hub.hide(); persist(); game.load(map, layout, true); };
  game.onRunEnd = (r) => {
    for (const it of r.kept) save.stash[it.def.kind] = (save.stash[it.def.kind] ?? 0) + 1;
    save.lifetime += r.kept.reduce((s, i) => s + i.def.value, 0);
    save.runs++;
    persist();
    showResult(ui, { win: r.win, sunk: r.reason === 'sunk', kept: r.kept, lostCount: r.lost, lifetime: save.lifetime }, toCamp);
  };

  game.load(MAPS[0], layout, false, 7);
  await fonts;
  redrawTextTextures();
  document.getElementById('loading')?.remove();
  hub.show('sail');
  (window as unknown as { game: Game; hub: Hub; layout: Layout }).game = game;
  Object.assign(window, { hub, layout });
}
boot();
