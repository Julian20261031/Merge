import './style.css';
import { buildTextures, redrawTextTextures, FD } from './render/textures';
import { hs } from './core/noise';
import { Game } from './game';
import { showStart } from './ui/screens';

// paper grain over everything, like the art samples
(function grain() {
  const g = document.createElement('canvas');
  g.width = g.height = 256;
  const x = g.getContext('2d')!, id = x.createImageData(256, 256);
  for (let i = 0; i < 65536; i++) { const n = 205 + Math.floor(hs(i, 77) * 50); id.data[i * 4] = n; id.data[i * 4 + 1] = n - 2; id.data[i * 4 + 2] = n - 8; id.data[i * 4 + 3] = 255; }
  x.putImageData(id, 0, 0);
  document.getElementById('grain')!.style.backgroundImage = `url(${g.toDataURL()})`;
})();

async function boot() {
  const fonts = document.fonts
    ? Promise.race([document.fonts.load(`40px ${FD}`, '锈海零件滨海大道出口燃料'), new Promise((r) => setTimeout(r, 2500))]).catch(() => undefined)
    : Promise.resolve();
  // let the loading text paint before the (blocking) texture generation
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  buildTextures();
  const ui = document.getElementById('ui')!;
  const game = new Game(document.getElementById('gl') as HTMLCanvasElement, ui);
  game.startRun();
  game.state = 'idle';
  game.hud.show(false);
  await fonts;
  redrawTextTextures();
  document.getElementById('loading')?.remove();
  showStart(ui, () => game.startRun());
  (window as unknown as { game: Game }).game = game;
}
boot();
