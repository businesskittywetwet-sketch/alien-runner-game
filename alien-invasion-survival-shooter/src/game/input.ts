import type { Game } from './game';

/** Touch-first input: one swipe gesture = exactly one action; a quick tap fires the weapon. */
const SWIPE_MIN = 28; // px of travel before a gesture counts as a swipe
const LANE_COOLDOWN = 250; // ms — minimum gap between two lane changes
const VERT_COOLDOWN = 150; // ms — minimum gap between jump / slide swipes
const TAP_MAX_MS = 280;

export class Input {
  private g: Game;
  private down = false;
  private id = -1;
  private sx = 0;
  private sy = 0;
  private t0 = 0;
  private fired = false; // true once this touch has already produced an action
  private lx = 0;
  private ly = 0;
  private lastLane = 0;
  private lastVert = 0;
  private cleanup: (() => void)[] = [];

  constructor(g: Game, el: HTMLElement) {
    this.g = g;

    const pd = (e: PointerEvent) => {
      if (this.g.state !== 'playing') return;
      this.down = true;
      this.fired = false;
      this.id = e.pointerId;
      this.sx = e.clientX;
      this.sy = e.clientY;
      this.lx = e.clientX;
      this.ly = e.clientY;
      this.t0 = performance.now();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const pm = (e: PointerEvent) => {
      if (this.g.mode === 'air') {
        // spacecraft: continuous, fluid steering (swipe / drag) — no lanes
        if (!this.down || e.pointerId !== this.id || this.g.state !== 'playing') return;
        const ddx = e.clientX - this.lx;
        const ddy = e.clientY - this.ly;
        this.lx = e.clientX;
        this.ly = e.clientY;
        this.g.flight.steer(ddx, ddy);
        if (Math.abs(e.clientX - this.sx) + Math.abs(e.clientY - this.sy) > 14) this.fired = true; // a drag, not a tap
        return;
      }
      if (!this.down || e.pointerId !== this.id || this.fired || this.g.state !== 'playing') return;
      const dx = e.clientX - this.sx;
      const dy = e.clientY - this.sy;
      if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
      // The gesture is now decided. No matter how far or hard the finger keeps
      // travelling, it can only ever trigger ONE action until the finger lifts.
      this.fired = true;
      const now = performance.now();
      if (Math.abs(dx) > Math.abs(dy)) {
        if (now - this.lastLane < LANE_COOLDOWN) return;
        this.lastLane = now;
        this.g.moveLane(Math.sign(dx)); // exactly one lane, clamped to the road in Player.moveLane
      } else if (dy < 0) {
        if (now - this.lastVert < VERT_COOLDOWN) return;
        this.lastVert = now;
        this.g.jump();
      } else {
        if (now - this.lastVert < VERT_COOLDOWN) return;
        this.lastVert = now;
        this.g.slide();
      }
    };

    const pu = (e: PointerEvent) => {
      if (e.pointerId !== this.id) return;
      const wasTap = this.down && !this.fired && performance.now() - this.t0 < TAP_MAX_MS;
      this.down = false;
      if (wasTap && e.type === 'pointerup' && this.g.state === 'playing') this.g.tapShoot();
    };

    el.addEventListener('pointerdown', pd);
    el.addEventListener('pointermove', pm);
    el.addEventListener('pointerup', pu);
    el.addEventListener('pointercancel', pu);
    this.cleanup.push(() => {
      el.removeEventListener('pointerdown', pd);
      el.removeEventListener('pointermove', pm);
      el.removeEventListener('pointerup', pu);
      el.removeEventListener('pointercancel', pu);
    });
  }

  dispose() {
    this.cleanup.forEach((f) => f());
  }
}
