// The game always draws into a landscape "stage". If the window around it is taller than it is wide
// (an iPad with a side panel open, a portrait phone), the stage keeps a landscape shape and is letterboxed.
const MIN_ASPECT = 1.45;   // narrower than this and we letterbox
const FIT_ASPECT = 1.6;    // the shape we fall back to

export const view = { w: 0, h: 0 };

export function stageEl(): HTMLElement { return document.getElementById('stage')!; }

export function fitStage() {
  const el = stageEl();
  const W = window.innerWidth, H = window.innerHeight;
  let w = W, h = H;
  if (W / H < MIN_ASPECT) h = Math.round(W / FIT_ASPECT);
  Object.assign(el.style, { width: `${w}px`, height: `${h}px`, top: `${Math.round((H - h) / 2)}px` });
  el.classList.toggle('compact', h < 460);
  el.classList.toggle('letterboxed', h < H);
  view.w = w;
  view.h = h;
}

/** Pointer position inside the stage. */
export function toStage(clientX: number, clientY: number) {
  const r = stageEl().getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

window.addEventListener('resize', fitStage);
