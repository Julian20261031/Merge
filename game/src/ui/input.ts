// Floating virtual stick on the left of the screen, plus WASD / arrow keys on desktop.
export class Input {
  x = 0;
  z = 0;
  private keys = new Set<string>();
  private pid: number | null = null;
  private ox = 0;
  private oy = 0;
  private sx = 0;
  private sz = 0;
  private base: HTMLElement;
  private knob: HTMLElement;
  enabled = true;
  onAction: (() => void) | null = null;
  private readonly R = 56;

  constructor(layer: HTMLElement) {
    this.base = document.createElement('div');
    this.base.className = 'stick';
    this.knob = document.createElement('div');
    this.knob.className = 'stick-knob';
    this.base.appendChild(this.knob);
    layer.appendChild(this.base);
    this.restStick();

    layer.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.pid !== null) return;
      if (e.clientX > window.innerWidth * 0.6) return;
      this.pid = e.pointerId;
      layer.setPointerCapture(e.pointerId);
      this.ox = e.clientX; this.oy = e.clientY;
      this.base.style.left = `${this.ox}px`; this.base.style.top = `${this.oy}px`;
      this.base.classList.add('active');
      this.move(e.clientX, e.clientY);
    });
    layer.addEventListener('pointermove', (e) => { if (e.pointerId === this.pid) this.move(e.clientX, e.clientY); });
    const end = (e: PointerEvent) => { if (e.pointerId === this.pid) { this.pid = null; this.sx = this.sz = 0; this.restStick(); } };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if ((k === ' ' || k === 'e') && this.onAction) { e.preventDefault(); this.onAction(); return; }
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private restStick() {
    this.base.classList.remove('active');
    this.base.style.left = '';
    this.base.style.top = '';
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  private move(cx: number, cy: number) {
    let dx = cx - this.ox, dy = cy - this.oy;
    const d = Math.hypot(dx, dy);
    if (d > this.R) { dx *= this.R / d; dy *= this.R / d; }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // screen right = +x on the water, screen down = +z (the camera looks north)
    this.sx = dx / this.R;
    this.sz = dy / this.R;
  }

  update() {
    let kx = 0, kz = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) kx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) kx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) kz -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) kz += 1;
    const kl = Math.hypot(kx, kz);
    if (!this.enabled) { this.x = this.z = 0; return; }
    if (kl > 0) { this.x = kx / kl; this.z = kz / kl; }
    else { this.x = this.sx; this.z = this.sz; }
  }

  reset() { this.pid = null; this.sx = this.sz = 0; this.keys.clear(); this.restStick(); }
}
