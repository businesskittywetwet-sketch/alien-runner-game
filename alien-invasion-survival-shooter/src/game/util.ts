export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Target {
  kind: 'enemy' | 'ship' | 'obst';
  dead: boolean;
  box: Box;
  vx: number;
  vz: number;
  hurt(dmg: number, p: V3, from?: string): void;
}

export function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const randi = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const damp = (cur: number, target: number, k: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-k * dt));

let T0 = 0;
let T1 = 1;
function slab(o: number, d: number, mn: number, mx: number): boolean {
  if (Math.abs(d) < 1e-8) return o >= mn && o <= mx;
  let ta = (mn - o) / d;
  let tb = (mx - o) / d;
  if (ta > tb) {
    const s = ta;
    ta = tb;
    tb = s;
  }
  if (ta > T0) T0 = ta;
  if (tb < T1) T1 = tb;
  return T0 <= T1;
}

/** Segment vs AABB. Returns entry t in [0,1] or -1. */
export function segBox(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  b: Box, pad = 0,
): number {
  T0 = 0;
  T1 = 1;
  if (!slab(ax, bx - ax, b.x0 - pad, b.x1 + pad)) return -1;
  if (!slab(ay, by - ay, b.y0 - pad, b.y1 + pad)) return -1;
  if (!slab(az, bz - az, b.z0 - pad, b.z1 + pad)) return -1;
  return T0;
}

export function boxOverlap(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0 && a.z0 < b.z1 && a.z1 > b.z0;
}

export const newBox = (): Box => ({ x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 });

export function setBox(b: Box, cx: number, y0: number, cz: number, hw: number, h: number, hl: number) {
  b.x0 = cx - hw;
  b.x1 = cx + hw;
  b.y0 = y0;
  b.y1 = y0 + h;
  b.z0 = cz - hl;
  b.z1 = cz + hl;
}
