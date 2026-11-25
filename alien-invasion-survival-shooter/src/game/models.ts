import * as THREE from 'three';
import type { WeaponId } from './config';

/* ---------- shared geometry / material caches (never disposed) ---------- */
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
export const SPH = new THREE.SphereGeometry(0.5, 12, 10);
export const CONE = new THREE.ConeGeometry(0.5, 1, 12);
export const CONE4 = new THREE.ConeGeometry(0.7071, 1, 4);
export const TORUS = new THREE.TorusGeometry(0.5, 0.06, 6, 20);
export const PLANE = new THREE.PlaneGeometry(1, 1);
export const OCTA = new THREE.OctahedronGeometry(0.5);
const OPEN_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1, true);

const lamCache = new Map<string, THREE.MeshLambertMaterial>();
export function lam(color: number, emissive = 0, ei = 1): THREE.MeshLambertMaterial {
  const k = `${color}-${emissive}-${ei}`;
  let m = lamCache.get(k);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei });
    lamCache.set(k, m);
  }
  return m;
}
const basicCache = new Map<string, THREE.MeshBasicMaterial>();
export function basic(color: number, opts: { add?: boolean; opacity?: number; side?: THREE.Side } = {}): THREE.MeshBasicMaterial {
  const k = `${color}-${opts.add}-${opts.opacity}-${opts.side}`;
  let m = basicCache.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: opts.add || opts.opacity !== undefined,
      opacity: opts.opacity ?? 1,
      blending: opts.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !opts.add,
      side: opts.side ?? THREE.FrontSide,
    });
    basicCache.set(k, m);
  }
  return m;
}
const stdCache = new Map<string, THREE.MeshStandardMaterial>();
/** Physically shaded material: used for car paint, glass, metalwork and roads so
 *  the streetlights produce real specular highlights instead of flat blocks. */
export function std(color: number, opts: { rough?: number; metal?: number; emissive?: number; ei?: number } = {}): THREE.MeshStandardMaterial {
  const k = `${color}|${opts.rough}|${opts.metal}|${opts.emissive}|${opts.ei}`;
  let m = stdCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.8,
      metalness: opts.metal ?? 0.05,
      emissive: opts.emissive ?? 0,
      emissiveIntensity: opts.ei ?? 1,
    });
    stdCache.set(k, m);
  }
  return m;
}

export const glowMat = (color: number, opacity = 0.7) => basic(color, { add: true, opacity });

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}
export const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => mesh(BOX, mat, w, h, d, x, y, z);

/* ---------------------------- canvas textures ---------------------------- */
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return t;
}

export function makeRoadTexture(): THREE.CanvasTexture {
  return canvasTex(256, 256, (c) => {
    c.fillStyle = '#2b2e37';
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.12)';
      c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    const lx = (m: number) => ((m + 6) / 12) * 256;
    c.fillStyle = '#d8d8d0';
    c.fillRect(lx(-5.75), 0, 4, 256);
    c.fillRect(lx(5.75) - 4, 0, 4, 256);
    for (const m of [-3, 3]) c.fillRect(lx(m) - 2, 0, 4, 96);
    c.fillStyle = '#e8b923';
    c.fillRect(lx(0) - 6, 0, 3, 256);
    c.fillRect(lx(0) + 3, 0, 3, 256);
  }, true);
}

export function makeGlowTexture(): THREE.CanvasTexture {
  return canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
}

const winCache = new Map<string, THREE.CanvasTexture>();
export function windowTexture(variant: string, idx: number): THREE.CanvasTexture {
  const key = `${variant}${idx}`;
  let t = winCache.get(key);
  if (t) return t;
  const cfg: Record<string, { wall: string; lit: number; cols: string[]; rows: number }> = {
    downtown: { wall: ['#0e1424', '#121a2e', '#0b1020'][idx % 3], lit: 0.5, cols: ['#ffe9a8', '#9fd8ff', '#ffd27a', '#cfe8ff'], rows: 4 },
    residential: { wall: ['#2a1f26', '#1f2530', '#2b2a22'][idx % 3], lit: 0.35, cols: ['#ffcf7a', '#ffb74d', '#ffe0a3'], rows: 3 },
    industrial: { wall: ['#2b2420', '#232a2b', '#2a2a2f'][idx % 3], lit: 0.18, cols: ['#ffb347', '#e6f0a0'], rows: 2 },
    highway: { wall: ['#10141e', '#141824', '#0d121c'][idx % 3], lit: 0.4, cols: ['#a8d8ff', '#ffe9a8'], rows: 4 },
  };
  const c = cfg[variant];
  t = canvasTex(256, 256, (g) => {
    g.fillStyle = c.wall;
    g.fillRect(0, 0, 256, 256);
    const rows = c.rows;
    const ch = 256 / rows;
    for (let r = 0; r < rows; r++)
      for (let q = 0; q < 4; q++) {
        const lit = Math.random() < c.lit;
        g.fillStyle = lit ? c.cols[Math.floor(Math.random() * c.cols.length)] : 'rgba(20,28,45,0.9)';
        g.fillRect(q * 64 + 10, r * ch + 10, 44, ch - 22);
        if (lit) {
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(q * 64 + 10, r * ch + ch / 2 - 1, 44, 2);
        }
      }
  }, true);
  winCache.set(key, t);
  return t;
}

const signCache = new Map<string, THREE.CanvasTexture>();
export function signTexture(text: string, color: string): THREE.CanvasTexture {
  const k = text + color;
  let t = signCache.get(k);
  if (t) return t;
  t = canvasTex(256, 96, (c) => {
    c.fillStyle = '#05060a';
    c.fillRect(0, 0, 256, 96);
    c.strokeStyle = color;
    c.lineWidth = 6;
    c.shadowColor = color;
    c.shadowBlur = 16;
    c.strokeRect(8, 8, 240, 80);
    c.fillStyle = color;
    c.font = 'bold 48px Arial Black, Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 128, 50);
  });
  signCache.set(k, t);
  return t;
}
export const SIGNS: [string, string][] = [
  ['BAR', '#ff3da5'], ['HOTEL', '#40e0ff'], ['24H', '#ffe14d'], ['PIZZA', '#ff7a30'], ['CLUB', '#b36bff'], ['DINER', '#5dff9a'], ['BANK', '#6ab7ff'], ['ARCADE', '#ff5252'],
];

const bGeoCache = new Map<string, THREE.BoxGeometry>();
export function buildingGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = `${w}|${h}|${d}`;
  let g = bGeoCache.get(key);
  if (g) return g;
  g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const faceW = [d, d, 1, 1, w, w];
  for (let f = 0; f < 6; f++) {
    const su = Math.max(1, Math.round(faceW[f] / 12));
    const sv = Math.max(1, Math.round(h / 14));
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (f === 2 || f === 3) uv.setXY(i, 0.1, 0.1);
      else uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  bGeoCache.set(key, g);
  return g;
}

/* ------------------------------ humanoids ------------------------------ */
export interface Humanoid {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  hand: THREE.Group;
  mats: THREE.MeshLambertMaterial[];
  height: number;
}
export interface HumanoidOpts {
  skin: number;
  suit: number;
  accent: number;
  eye?: number;
  scale?: number;
  bulk?: number;
  headS?: number;
  limb?: number;
  helmet?: boolean;
}

export function makeHumanoid(o: HumanoidOpts): Humanoid {
  const bulk = o.bulk ?? 1;
  const limb = o.limb ?? 1;
  const headS = o.headS ?? 1;
  const skin = new THREE.MeshLambertMaterial({ color: o.skin });
  const suit = new THREE.MeshLambertMaterial({ color: o.suit });
  const accent = new THREE.MeshLambertMaterial({ color: o.accent });
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.95 * limb;
  root.add(body);
  const torso = box(0.62 * bulk, 0.7, 0.34 * bulk, suit, 0, 0.42, 0);
  body.add(torso);
  body.add(box(0.64 * bulk, 0.16, 0.36 * bulk, accent, 0, 0.12, 0)); // belt
  body.add(box(0.4 * bulk, 0.5, 0.14, accent, 0, 0.5, 0.2 * bulk)); // pack on back (+z side)
  const head = box(0.38 * headS, 0.38 * headS, 0.38 * headS, skin, 0, 0.98 + (headS - 1) * 0.1, 0);
  body.add(head);
  if (o.helmet) head.add(mesh(BOX, accent, 1.12, 0.55, 1.12, 0, 0.28, 0));
  const eyeM = new THREE.MeshBasicMaterial({ color: o.eye ?? 0x222222 });
  head.add(mesh(BOX, eyeM, 0.22, 0.12, 0.05, -0.2, 0.05, -0.52));
  head.add(mesh(BOX, eyeM, 0.22, 0.12, 0.05, 0.2, 0.05, -0.52));
  const mkArm = (sx: number) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.42 * bulk, 0.7, 0);
    g.add(box(0.2 * bulk, 0.65 * limb, 0.2 * bulk, suit, 0, -0.3 * limb, 0));
    g.add(box(0.2 * bulk, 0.16, 0.2 * bulk, skin, 0, -0.66 * limb, 0));
    body.add(g);
    return g;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  const hand = new THREE.Group();
  hand.position.set(0, -0.66 * limb, 0);
  armR.add(hand);
  const mkLeg = (sx: number) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.17 * bulk, 0, 0);
    g.add(box(0.25 * bulk, 0.95 * limb, 0.27 * bulk, suit, 0, -0.475 * limb, 0));
    g.add(box(0.27 * bulk, 0.14, 0.38 * bulk, accent, 0, -0.9 * limb, -0.04));
    body.add(g);
    return g;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);
  const s = o.scale ?? 1;
  root.scale.setScalar(s);
  return { root, body, torso, head, armL, armR, legL, legR, hand, mats: [skin, suit, accent], height: (0.95 * limb + 1.2 * headS) * s };
}

export function flashHumanoid(h: { mats: THREE.MeshLambertMaterial[] }, v: number, color = 0xffffff) {
  for (const m of h.mats) {
    m.emissive.setHex(color);
    m.emissiveIntensity = v;
  }
}

/* --------------------------------- guns --------------------------------- */
export function makeGun(id: WeaponId, tint: number): THREE.Group {
  const g = new THREE.Group();
  const dark = lam(0x20232a);
  const body = lam(tint);
  const glow = (c: number) => basic(c);
  switch (id) {
    case 'pistol':
      g.add(box(0.1, 0.14, 0.34, body, 0, 0, -0.17), box(0.09, 0.2, 0.1, dark, 0, -0.14, -0.03));
      break;
    case 'rifle':
      g.add(box(0.11, 0.15, 0.8, body, 0, 0, -0.38), box(0.09, 0.22, 0.12, dark, 0, -0.17, -0.3), box(0.1, 0.17, 0.3, dark, 0, -0.02, 0.1), box(0.05, 0.05, 0.3, dark, 0, 0.04, -0.9));
      break;
    case 'smg':
      g.add(box(0.12, 0.16, 0.5, body, 0, 0, -0.22), box(0.08, 0.34, 0.1, dark, 0, -0.22, -0.22), box(0.08, 0.2, 0.1, dark, 0, -0.14, 0));
      break;
    case 'shotgun':
      g.add(box(0.11, 0.13, 0.7, body, 0, 0, -0.3), mesh(CYL, dark, 0.07, 0.8, 0.07, 0, -0.07, -0.42).rotateX(Math.PI / 2), box(0.14, 0.12, 0.26, lam(0x6d4c2f), 0, -0.07, -0.45), box(0.1, 0.16, 0.3, lam(0x6d4c2f), 0, -0.02, 0.15));
      break;
    case 'sniper':
      g.add(box(0.1, 0.14, 1.2, body, 0, 0, -0.5), mesh(CYL, dark, 0.09, 0.4, 0.09, 0, 0.14, -0.3).rotateX(Math.PI / 2), box(0.1, 0.18, 0.35, dark, 0, -0.02, 0.2), box(0.04, 0.04, 0.4, dark, 0, 0.0, -1.3));
      break;
    case 'plasma': {
      g.add(box(0.15, 0.2, 0.7, body, 0, 0, -0.3), mesh(SPH, glow(0x40ffd0), 0.2, 0.2, 0.3, 0, 0.04, -0.4), box(0.12, 0.12, 0.3, dark, 0, 0, -0.78), box(0.1, 0.2, 0.1, dark, 0, -0.16, -0.1));
      break;
    }
    case 'rocket':
      g.add(mesh(CYL, body, 0.26, 1.1, 0.26, 0, 0.05, -0.4).rotateX(Math.PI / 2), mesh(CYL, glow(0xff7043), 0.18, 0.1, 0.18, 0, 0.05, -0.97).rotateX(Math.PI / 2), box(0.1, 0.18, 0.1, dark, 0, -0.14, -0.2));
      break;
    case 'laser':
      g.add(box(0.13, 0.18, 0.75, body, 0, 0, -0.32), box(0.08, 0.08, 0.3, glow(0xff3d5a), 0, 0.0, -0.78), box(0.18, 0.04, 0.4, glow(0xff3d5a), 0, 0.11, -0.3), box(0.09, 0.2, 0.1, dark, 0, -0.16, -0.05));
      break;
    case 'railgun':
      g.add(box(0.1, 0.14, 1.0, body, 0, 0, -0.5), box(0.16, 0.06, 0.5, glow(0xc77dff), 0, 0.1, -0.45), box(0.14, 0.14, 0.22, dark, 0, 0, -0.06), box(0.1, 0.2, 0.1, dark, 0, -0.17, -0.16));
      for (let i = 0; i < 3; i++) g.add(box(0.2, 0.2, 0.07, glow(0xc77dff), 0, 0, -0.3 - i * 0.24));
      g.add(box(0.05, 0.05, 0.5, glow(0xffffff), 0, 0.02, -1.15));
      break;
    case 'sunlance':
      g.add(box(0.14, 0.2, 0.8, body, 0, 0, -0.36), mesh(OCTA, glow(0xff4dd2), 0.3, 0.3, 0.5, 0, 0.05, -0.62), box(0.1, 0.1, 0.36, glow(0xffb3ff), 0, 0, -0.86), box(0.1, 0.2, 0.1, dark, 0, -0.16, -0.1));
      break;
  }
  const muzzleZ: Record<WeaponId, number> = { pistol: -0.36, rifle: -0.95, smg: -0.5, shotgun: -0.8, sniper: -1.5, plasma: -0.9, rocket: -1.05, laser: -0.95, railgun: -1.4, sunlance: -1.0 };
  const mz = new THREE.Object3D();
  mz.position.set(0, 0, muzzleZ[id]);
  g.add(mz);
  g.userData.muzzle = mz;
  return g;
}

/* ------------------------------- vehicles ------------------------------- */
export function makeCar(color: number, kind: 'normal' | 'burnt' | 'police' = 'normal'): { group: THREE.Group; flashers: THREE.MeshBasicMaterial[] } {
  const g = new THREE.Group();
  const flashers: THREE.MeshBasicMaterial[] = [];
  const burnt = kind === 'burnt';
  const bodyC = burnt ? 0x141414 : kind === 'police' ? 0x15181f : color;
  const bm = std(bodyC, { rough: burnt ? 1 : 0.35, metal: burnt ? 0.1 : 0.72, emissive: burnt ? 0x2a0c00 : 0, ei: 1 });
  // lower body with slightly tapered nose and tail
  g.add(box(2.0, 0.52, 4.5, bm, 0, 0.62, 0));
  g.add(box(1.9, 0.2, 4.66, bm, 0, 0.36, 0)); // rocker panel
  const nose = box(1.86, 0.36, 1.0, bm, 0, 0.86, -1.72);
  nose.rotation.x = 0.12;
  g.add(nose);
  const tail = box(1.86, 0.34, 0.9, bm, 0, 0.84, 1.78);
  tail.rotation.x = -0.1;
  g.add(tail);
  // cabin with raked windscreen and rear glass
  g.add(box(1.78, 0.62, 2.3, bm, 0, 1.14, 0.15));
  const glass = std(0x0a1622, { rough: 0.08, metal: 0.6, emissive: 0x0a1a2a, ei: 0.6 });
  const ws = box(1.72, 0.5, 0.06, glass, 0, 1.16, -1.02);
  ws.rotation.x = -0.55;
  g.add(ws);
  const rw = box(1.72, 0.44, 0.06, glass, 0, 1.18, 1.28);
  rw.rotation.x = 0.6;
  g.add(rw);
  for (const sx of [-1, 1]) g.add(box(0.06, 0.44, 2.1, glass, sx * 0.87, 1.18, 0.15));
  g.add(box(1.6, 0.09, 2.0, bm, 0, 1.47, 0.2)); // roof
  for (const sx of [-1, 1]) for (const sz of [-1.35, 1.42]) {
    const w = mesh(CYL, lam(0x0a0a0a), 0.72, 0.32, 0.72, sx * 1.0, 0.36, sz).rotateZ(Math.PI / 2);
    g.add(w);
    g.add(mesh(CYL, std(0x8d939c, { rough: 0.3, metal: 0.9 }), 0.34, 0.34, 0.34, sx * 1.02, 0.36, sz).rotateZ(Math.PI / 2));
  }
  const headM = basic(burnt ? 0x330000 : 0xfff6d0);
  for (const sx of [-0.62, 0.62]) {
    g.add(box(0.44, 0.16, 0.08, headM, sx, 0.82, -2.27));
    if (!burnt) {
      const gl = new THREE.Sprite(glowSprite(0xfff0c0, 0.5));
      gl.scale.set(1.5, 0.9, 1);
      gl.position.set(sx, 0.82, -2.4);
      g.add(gl);
    }
  }
  for (const sx of [-0.62, 0.62]) g.add(box(0.4, 0.14, 0.07, basic(burnt ? 0x330000 : 0xff2a1a), sx, 0.86, 2.26));
  if (kind === 'police') {
    g.add(box(2.02, 0.4, 1.3, lam(0xe8e8e8), 0, 0.75, 0.6));
    const r = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const b = new THREE.MeshBasicMaterial({ color: 0x2244ff });
    flashers.push(r, b);
    g.add(box(0.5, 0.18, 0.3, r, -0.4, 1.66, 0.2), box(0.5, 0.18, 0.3, b, 0.4, 1.66, 0.2));
  }
  return { group: g, flashers };
}

export function makeTruck(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.6, 2.0, 6.2, lam(0xc9ccd2), 0, 1.4, 0.9)); // cargo box (top 2.4)
  g.add(box(2.62, 0.2, 6.22, lam(0x39414f), 0, 0.5, 0.9));
  g.add(box(2.4, 1.3, 1.9, lam(0xb3382c), 0, 1.15, -3.1)); // cab (top 1.8)
  g.add(box(2.42, 0.5, 0.1, basic(0x0b1a2a), 0, 1.45, -4.07));
  g.add(box(2.6, 0.5, 0.5, lam(0x222222), 0, 0.5, -3.7));
  g.add(box(2.2, 0.4, 0.05, basic(0xff6a00), 0, 1.4, 4.02)); // rear stripe
  for (const sx of [-1, 1]) for (const sz of [-3.2, 0.6, 2.2]) g.add(mesh(CYL, lam(0x0a0a0a), 0.9, 0.4, 0.9, sx * 1.2, 0.45, sz).rotateZ(Math.PI / 2));
  return g;
}

export function makeRamp(w: number, l: number, h: number): THREE.Group {
  const g = new THREE.Group();
  // wedge: high end at z=-l/2 (far), low at +l/2 (near player)
  const hw = w / 2, hl = l / 2;
  const v = [
    -hw, 0, hl, hw, 0, hl, -hw, 0, -hl, hw, 0, -hl, -hw, h, -hl, hw, h, -hl,
  ];
  const tri = [
    [0, 1, 5], [0, 5, 4], // slope
    [2, 4, 5], [2, 5, 3], // back wall
    [0, 4, 2], // left
    [1, 3, 5], // right
    [0, 2, 3], [0, 3, 1], // bottom
  ];
  const pos: number[] = [];
  for (const t of tri) for (const i of t) pos.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, lam(0x4b5563, 0x0a0f18, 1)));
  const n = Math.max(3, Math.floor(l / 2.2));
  const ang = Math.atan2(h, l);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const m = box(w * 0.7, 0.05, 0.28, basic(i % 2 ? 0xffc400 : 0xff6a00), 0, h * t + 0.03, hl - l * t);
    m.rotation.x = ang;
    g.add(m);
  }
  g.add(box(0.12, 0.12, l, basic(0xffc400), -hw, 0.06, 0), box(0.12, 0.12, l, basic(0xffc400), hw, 0.06, 0));
  return g;
}

export function makeBarrier(): { group: THREE.Group; light: THREE.MeshBasicMaterial } {
  const g = new THREE.Group();
  const ob = lam(0xff6a00, 0x331100, 1), wh = lam(0xf2f2f2);
  g.add(box(2.4, 0.18, 0.28, ob, 0, 0.75, 0), box(2.4, 0.18, 0.28, wh, 0, 0.5, 0), box(2.4, 0.18, 0.28, ob, 0, 0.3, 0));
  g.add(box(0.12, 0.9, 0.5, lam(0x333333), -1.1, 0.45, 0), box(0.12, 0.9, 0.5, lam(0x333333), 1.1, 0.45, 0));
  const light = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
  g.add(mesh(SPH, light, 0.22, 0.22, 0.22, 0, 1.0, 0));
  return { group: g, light };
}

export function makeCrate(s: number, color = 0x8a6a3c): THREE.Group {
  const g = new THREE.Group();
  g.add(box(s, s, s, lam(color), 0, s / 2, 0));
  const e = lam(0x4a3820);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.08 * s, s * 1.01, 0.08 * s, e, sx * s * 0.46, s / 2, sz * s * 0.46));
  g.add(box(s * 1.01, 0.08 * s, s * 1.01, e, 0, s * 0.96, 0), box(s * 1.01, 0.08 * s, s * 1.01, e, 0, s * 0.04, 0));
  return g;
}

export function makeBarrel(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(CYL, lam(0xc62828, 0x300000), 0.8, 1.1, 0.8, 0, 0.55, 0));
  g.add(mesh(CYL, lam(0xffd600), 0.82, 0.12, 0.82, 0, 0.55, 0));
  g.add(mesh(CYL, basic(0xffee00), 0.4, 0.04, 0.4, 0, 1.12, 0));
  return g;
}

export function makeDebris(): THREE.Group {
  const g = new THREE.Group();
  const m = [lam(0x5a5650), lam(0x44413d), lam(0x6b665e)];
  for (let i = 0; i < 7; i++) {
    const b = box(0.5 + Math.random() * 0.9, 0.3 + Math.random() * 0.5, 0.5 + Math.random() * 0.8, m[i % 3], (Math.random() - 0.5) * 2.0, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 1.6);
    b.rotation.set(Math.random(), Math.random(), Math.random());
    g.add(b);
  }
  g.add(box(2.4, 0.15, 0.15, lam(0x884422), 0.2, 0.6, 0.2).rotateY(0.5));
  return g;
}

export function makeLowWall(w = 2.8): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, 1.0, 0.6, lam(0x6e7076), 0, 0.5, 0));
  g.add(box(w + 0.1, 0.12, 0.7, lam(0x8a8c92), 0, 1.0, 0));
  g.add(box(w * 0.8, 0.1, 0.04, basic(0xffc400), 0, 0.55, 0.32));
  return g;
}

export function makeRailing(w = 2.8): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, 0.1, 0.1, lam(0xb0b6c0), 0, 1.0, 0));
  g.add(box(w, 0.06, 0.06, lam(0xb0b6c0), 0, 0.82, 0));
  for (const sx of [-1, 1]) g.add(box(0.1, 1.0, 0.1, lam(0x6a707a), sx * (w / 2 - 0.1), 0.5, 0));
  g.add(box(w * 0.5, 0.05, 0.12, basic(0x40e0ff), 0, 1.07, 0));
  return g;
}

export function makeFallenLight(w: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(CYL, lam(0x4d535c), 0.28, w, 0.28, 0, 1.25, 0).rotateZ(Math.PI / 2));
  g.add(box(0.7, 0.3, 1.2, lam(0x303640), -w / 2 + 0.2, 1.2, 0.2));
  g.add(box(0.5, 0.2, 0.8, basic(0xffcc80), -w / 2 + 0.2, 1.02, 0.2));
  g.add(box(w, 0.06, 0.06, basic(0xffd600), 0, 0.88, -0.2));
  g.add(mesh(CYL, lam(0x4d535c), 0.4, 0.7, 0.4, w / 2 - 0.1, 0.35, 0.3));
  return g;
}

export function makePipe(w: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(CYL, lam(0x7a5a3a, 0x110800), 0.5, w, 0.5, 0, 1.4, 0).rotateZ(Math.PI / 2));
  for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) {
    g.add(box(0.25, 1.9, 0.25, lam(0x3d3f45), x, 0.95, 0));
  }
  for (let i = 0; i < 4; i++) g.add(mesh(CYL, lam(0x55575d), 0.62, 0.15, 0.62, -w / 2 + (i + 0.5) * (w / 4), 1.4, 0).rotateZ(Math.PI / 2));
  g.add(box(w, 0.05, 0.05, basic(0xffd600), 0, 0.98, 0.3));
  return g;
}

export function makeBillboard(w: number, txt: string, colr: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, 1.5, 0.3, std(0x14161f, { rough: 0.6, metal: 0.4 }), 0, 1.85, 0));
  const face = new THREE.MeshBasicMaterial({ map: signTexture(txt, colr) });
  for (const s of [-1, 1]) {
    const p = mesh(PLANE, face, w * 0.96, 1.3, 1, 0, 1.85, s * 0.16);
    if (s < 0) p.rotation.y = Math.PI;
    g.add(p);
  }
  const hexc = parseInt(colr.slice(1), 16);
  g.add(box(w * 0.92, 0.07, 0.07, basic(hexc), 0, 1.07, 0.18));
  for (const s of [-1, 1]) {
    g.add(box(0.28, 3.7, 0.28, lam(0x3b414c), s * (w / 2 + 0.2), 1.85, 0));
    g.add(box(0.06, 1.0, 0.06, lam(0x9aa0a8), s * (w / 2 - 0.5), 3.1, 0));
  }
  g.add(box(w + 0.7, 0.22, 0.3, lam(0x3b414c), 0, 3.7, 0));
  g.add(mesh(SPH, glowMat(hexc, 0.25), w * 0.9, 1.6, 1.2, 0, 1.85, 0));
  return g;
}

export function makeScaffold(w: number): THREE.Group {
  const g = new THREE.Group();
  const m = std(0x8d949e, { rough: 0.5, metal: 0.8 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(box(0.13, 3.0, 0.13, m, sx * (w / 2 - 0.1), 1.5, sz * 0.8));
  g.add(box(w, 0.1, 1.8, lam(0x9c7a4a), 0, 2.58, 0)); // overhead planks
  for (const y of [1.2, 2.45]) for (const sz of [-1, 1]) g.add(box(w, 0.09, 0.09, m, 0, y, sz * 0.8));
  for (const sx of [-1, 1]) {
    const br = box(0.06, 3.0, 0.06, m, sx * (w / 2 - 0.1), 1.5, 0);
    br.rotation.x = 0.95;
    g.add(br);
  }
  g.add(box(w, 0.16, 0.05, basic(0xffc400), 0, 1.2, 0.86));
  g.add(box(w * 0.5, 0.3, 0.04, basic(0xff3a1a), 0, 2.2, 0.86));
  return g;
}

export function makeCrater(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(CYL, lam(0x050507), 3.4, 0.1, 3.4, 0, 0.04, 0));
  g.add(mesh(CYL, basic(0xff5a10, { add: true, opacity: 0.5 }), 2.4, 0.02, 2.4, 0, 0.1, 0));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    g.add(box(0.5, 0.35, 0.5, lam(0x3a3631), Math.cos(a) * 1.8, 0.15, Math.sin(a) * 1.8));
  }
  return g;
}

export function makeBarricade(w: number): THREE.Group {
  const g = new THREE.Group();
  const crys = lam(0x5b2a86, 0x2a0a50, 1);
  const n = Math.max(2, Math.round(w / 1.2));
  for (let i = 0; i < n; i++) {
    const h = 3 + Math.random() * 1.4;
    const m = mesh(CONE4, crys, 1.3, h, 1.1, -w / 2 + (i + 0.5) * (w / n), h / 2, 0);
    m.rotation.y = Math.PI / 4 + Math.random() * 0.2;
    g.add(m);
  }
  g.add(box(w, 1.6, 1.4, lam(0x2c1b44, 0x1a0a30), 0, 0.8, 0));
  g.add(box(w * 0.95, 0.12, 0.08, basic(0xd66bff), 0, 1.3, 0.72));
  g.add(box(w * 0.95, 0.12, 0.08, basic(0xd66bff), 0, 0.5, 0.72));
  return g;
}

export function makeHighWall(w: number, h: number, l: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, h, l, lam(0x4e5662, 0x080a10), 0, h / 2, 0));
  g.add(box(w + 0.15, 0.2, l + 0.15, lam(0x7b8494), 0, h, 0));
  g.add(box(w, 0.3, l + 0.02, basic(0xffc400), 0, 0.25, 0));
  g.add(box(0.25, 0.6, l * 0.6, basic(0x40e0ff), -w / 2 + 0.2, h + 0.4, 0));
  return g;
}

export function makeLadder(h: number): THREE.Group {
  const g = new THREE.Group();
  const m = lam(0xd0d4da);
  g.add(box(0.1, h, 0.1, m, -0.45, h / 2, 0), box(0.1, h, 0.1, m, 0.45, h / 2, 0));
  for (let y = 0.3; y < h; y += 0.42) g.add(box(0.9, 0.07, 0.07, m, 0, y, 0));
  g.add(box(1.0, 0.1, 0.1, basic(0x40e0ff), 0, h + 0.1, 0));
  return g;
}

export function makeGantry(width: number, y: number, withLights = true): THREE.Group {
  const g = new THREE.Group();
  const m = lam(0x3b414c);
  for (const sx of [-1, 1]) g.add(box(0.5, y + 0.5, 0.5, m, sx * (width / 2), (y + 0.5) / 2, 0));
  g.add(box(width + 0.8, 0.6, 0.6, m, 0, y + 0.2, 0));
  if (withLights)
    for (let i = 0; i < 6; i++) g.add(box(0.5, 0.1, 0.5, basic(i % 2 ? 0xff2200 : 0xffaa00), -width / 2 + (i + 0.5) * (width / 6), y - 0.2, 0.35));
  return g;
}

export function makeHookPoint(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(TORUS, basic(0x40ffff)).rotateY(Math.PI / 2));
  g.children[0].scale.setScalar(1.6);
  g.add(mesh(SPH, glowMat(0x40ffff, 0.9), 0.5, 0.5, 0.5));
  g.add(mesh(SPH, glowMat(0x40ffff, 0.2), 2.4, 2.4, 2.4));
  return g;
}

export function makeWarningStripe(w: number, l: number): THREE.Mesh {
  const m = mesh(PLANE, basic(0xff2a2a, { add: true, opacity: 0.25 }), w, l, 1, 0, 0.06, 0);
  m.rotation.x = -Math.PI / 2;
  return m;
}

/* ------------------------------- aliens -------------------------------- */
/** Extra silhouette detail so aliens read as creatures rather than boxes. */
function alienDetail(h: Humanoid, type: string) {
  const accent = h.mats[2];
  const dark = lam(0x14161c, 0x05060a, 1);
  const coreC: Record<string, number> = { scout: 0x7dff6a, soldier: 0xc16bff, brute: 0xff7043, hunter: 0x30e0d0, sniper: 0x40e0ff, commander: 0xffd54f };
  const core = new THREE.MeshBasicMaterial({ color: coreC[type] ?? 0xff2a2a });
  const shoulder = (s: number, r: number) => {
    const m = mesh(SPH, dark, r, r * 0.75, r, s * 0.46, 0.66, 0);
    h.body.add(m);
    return m;
  };
  switch (type) {
    case 'scout': {
      // swept crest + long claws
      h.head.add(mesh(CONE, accent, 0.16, 0.5, 0.16, 0, 0.34, 0.05).rotateX(0.5));
      h.head.add(mesh(CONE, accent, 0.12, 0.36, 0.12, 0, 0.3, -0.12).rotateX(0.9));
      for (const s of [-1, 1]) h.hand.add(mesh(CONE, lam(0xd8ffd0), 0.1, 0.36, 0.1, s * 0.05, -0.2, 0).rotateX(Math.PI));
      h.body.add(mesh(SPH, core, 0.16, 0.16, 0.1, 0, 0.5, -0.19));
      shoulder(-1, 0.2);
      shoulder(1, 0.2);
      break;
    }
    case 'soldier': {
      for (const s of [-1, 1]) h.body.add(mesh(SPH, accent, 0.3, 0.2, 0.3, s * 0.44, 0.68, 0));
      h.body.add(box(0.4, 0.3, 0.08, accent, 0, 0.5, -0.19));
      h.body.add(mesh(SPH, core, 0.14, 0.14, 0.1, 0, 0.5, -0.22));
      h.head.add(mesh(CONE, dark, 0.3, 0.26, 0.3, 0, 0.26, 0));
      for (const s of [-1, 1]) h.hand.add(mesh(CONE, lam(0xd0b8ff), 0.09, 0.3, 0.09, s * 0.04, -0.18, 0).rotateX(Math.PI));
      break;
    }
    case 'brute': {
      for (const s of [-1, 1]) {
        h.body.add(mesh(SPH, dark, 0.42, 0.3, 0.42, s * 0.5, 0.7, 0));
        h.body.add(mesh(CONE, accent, 0.16, 0.5, 0.16, s * 0.56, 0.9, 0).rotateZ(s * 0.5));
        h.body.add(mesh(CONE, accent, 0.13, 0.4, 0.13, s * 0.5, 0.86, -0.18).rotateX(-0.5));
      }
      h.body.add(box(0.5, 0.4, 0.1, accent, 0, 0.5, -0.2));
      h.body.add(mesh(SPH, core, 0.26, 0.26, 0.14, 0, 0.5, -0.24));
      h.head.add(mesh(CONE, accent, 0.34, 0.3, 0.34, 0, 0.28, 0));
      break;
    }
    case 'hunter': {
      for (const s of [-1, 1]) {
        h.body.add(mesh(SPH, dark, 0.26, 0.18, 0.3, s * 0.44, 0.68, 0));
        const blade = box(0.07, 0.1, 0.7, accent, s * 0.44, 0.72, -0.4);
        h.body.add(blade);
      }
      h.body.add(mesh(SPH, core, 0.18, 0.18, 0.1, 0, 0.5, -0.2));
      h.head.add(mesh(CONE, accent, 0.14, 0.42, 0.14, 0, 0.3, 0).rotateX(-0.35));
      for (const s of [-1, 1]) h.hand.add(mesh(CONE, lam(0xb0fff4), 0.1, 0.42, 0.1, s * 0.05, -0.22, 0).rotateX(Math.PI));
      break;
    }
    case 'sniper': {
      for (const s of [-1, 1]) h.body.add(mesh(SPH, accent, 0.24, 0.16, 0.26, s * 0.42, 0.68, 0));
      h.head.add(box(0.3, 0.1, 0.34, dark, 0.16, 0.06, -0.1));
      h.body.add(box(0.3, 0.36, 0.07, accent, 0, 0.5, -0.19));
      h.body.add(mesh(SPH, core, 0.1, 0.1, 0.08, -0.14, 0.56, -0.2));
      break;
    }
    default: {
      // commander: crown of spikes + mantle
      for (let i = -2; i <= 2; i++) h.head.add(mesh(CONE, accent, 0.1, 0.42 - Math.abs(i) * 0.06, 0.1, i * 0.1, 0.3, Math.abs(i) * 0.03));
      for (const s of [-1, 1]) h.body.add(mesh(SPH, dark, 0.44, 0.3, 0.4, s * 0.5, 0.72, 0));
      h.body.add(box(0.56, 0.44, 0.1, accent, 0, 0.5, -0.2));
      h.body.add(mesh(SPH, core, 0.2, 0.2, 0.12, 0, 0.5, -0.24));
      h.body.add(mesh(SPH, glowMat(0xffd54f, 0.4), 1.0, 1.0, 1.0, 0, 0.5, 0));
      break;
    }
  }
}

export function makeAlien(type: string): Humanoid {
  const h = makeHumanoidBase(type);
  alienDetail(h, type);
  return h;
}

function makeHumanoidBase(type: string): Humanoid {
  switch (type) {
    case 'scout': return makeHumanoid({ skin: 0x6fd36f, suit: 0x2e5c3a, accent: 0x9cff7a, eye: 0xff2a2a, headS: 1.35, limb: 1.05, scale: 0.95 });
    case 'soldier': return makeHumanoid({ skin: 0x7a68c8, suit: 0x3a2f6a, accent: 0xc16bff, eye: 0xffee00, headS: 1.2, helmet: true, bulk: 1.15 });
    case 'brute': return makeHumanoid({ skin: 0xc2584a, suit: 0x5a2420, accent: 0xff7043, eye: 0xffee00, headS: 0.9, bulk: 1.7, scale: 1.8, limb: 0.9 });
    case 'hunter': return makeHumanoid({ skin: 0x2f8f8f, suit: 0x12292e, accent: 0xff6a00, eye: 0xff2a2a, headS: 1.1, limb: 1.2, bulk: 0.9, scale: 1.0 });
    case 'sniper': return makeHumanoid({ skin: 0x9a9ab0, suit: 0x23232d, accent: 0x40e0ff, eye: 0x40e0ff, headS: 1.15, helmet: true });
    default: return makeHumanoid({ skin: 0xe0c060, suit: 0x6a1f3a, accent: 0xffd54f, eye: 0xff2a2a, headS: 1.3, helmet: true, bulk: 1.3, scale: 1.55 });
  }
}

export function makeAlienGun(color: number, size = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.12 * size, 0.16 * size, 0.7 * size, lam(0x2a2a35), 0, 0, -0.3 * size));
  g.add(box(0.08 * size, 0.08 * size, 0.2 * size, basic(color), 0, 0.02, -0.7 * size));
  const mz = new THREE.Object3D();
  mz.position.set(0, 0, -0.8 * size);
  g.add(mz);
  g.userData.muzzle = mz;
  return g;
}

export function makeDroneMesh(color = 0xff4d6d): { group: THREE.Group; ring: THREE.Mesh } {
  const g = new THREE.Group();
  g.add(mesh(SPH, lam(0x2a2d3a, 0x0a0a10), 0.9, 0.55, 0.9, 0, 0, 0));
  const ring = new THREE.Mesh(TORUS, basic(color));
  ring.rotation.x = Math.PI / 2;
  ring.scale.setScalar(2.1);
  g.add(ring);
  g.add(mesh(SPH, basic(color), 0.32, 0.32, 0.32, 0, -0.05, -0.42));
  g.add(mesh(SPH, glowMat(color, 0.35), 1.6, 1.6, 1.6));
  for (const s of [-1, 1]) g.add(box(0.1, 0.5, 0.1, lam(0x2a2d3a), s * 0.5, 0.3, 0.1));
  return { group: g, ring };
}

export function makeCompanion(color: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(SPH, lam(0x30343f, 0x080810), 0.5, 0.4, 0.5));
  const r = new THREE.Mesh(TORUS, basic(color));
  r.rotation.x = Math.PI / 2;
  r.scale.setScalar(1.2);
  g.add(r);
  g.add(mesh(SPH, basic(color), 0.2, 0.2, 0.2, 0, 0, -0.25));
  g.add(mesh(SPH, glowMat(color, 0.4), 1.1, 1.1, 1.1));
  return g;
}

/* -------------------------------- ships -------------------------------- */
export function makeShip(kind: 'scout' | 'fighter' | 'transport' | 'bomber'): { group: THREE.Group; lights: THREE.MeshBasicMaterial[] } {
  const g = new THREE.Group();
  const hull = lam(0x2b2f3d, 0x07080c, 1);
  const lights: THREE.MeshBasicMaterial[] = [];
  const mk = (c: number) => {
    const m = new THREE.MeshBasicMaterial({ color: c });
    lights.push(m);
    return m;
  };
  if (kind === 'scout') {
    g.add(mesh(SPH, hull, 4.2, 1.1, 4.2));
    g.add(mesh(SPH, mk(0x76ff9a), 1.8, 1.3, 1.8, 0, 0.35, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(mesh(SPH, mk(0xffffff), 0.3, 0.3, 0.3, Math.cos(a) * 2.0, 0, Math.sin(a) * 2.0));
    }
    g.add(mesh(CYL, mk(0xbfffd0), 0.8, 0.12, 0.8, 0, -0.6, 0));
  } else if (kind === 'fighter') {
    g.add(mesh(CONE, hull, 1.4, 5, 1.4, 0, 0, 0).rotateX(-Math.PI / 2));
    g.add(box(6.5, 0.18, 2.2, hull, 0, 0, 0.8));
    g.add(box(0.2, 0.9, 1.4, hull, -3.1, 0.3, 1.3), box(0.2, 0.9, 1.4, hull, 3.1, 0.3, 1.3));
    g.add(mesh(SPH, mk(0xff4d6d), 0.7, 0.5, 1.3, 0, 0.35, -0.4));
    g.add(mesh(SPH, mk(0xff8a3d), 0.6, 0.6, 1.0, -2.0, 0, 2.0), mesh(SPH, mk(0xff8a3d), 0.6, 0.6, 1.0, 2.0, 0, 2.0));
    g.add(box(0.1, 0.1, 5, mk(0xff4d6d), 0, -0.12, 0));
  } else if (kind === 'transport') {
    g.add(box(6.5, 2.2, 14, hull, 0, 0, 0));
    g.add(box(8, 0.5, 8, hull, 0, -0.5, 1));
    g.add(mesh(SPH, hull, 6, 3, 5, 0, 0.5, -6.5));
    for (const s of [-1, 1]) g.add(mesh(CYL, mk(0xffb347), 2.0, 0.4, 2.0, s * 4.2, -0.3, 2.5), mesh(CYL, mk(0xffb347), 2.0, 0.4, 2.0, s * 4.2, -0.3, -2.5));
    g.add(box(2.6, 0.12, 4, mk(0x9affd0), 0, -1.15, 0));
    for (let i = 0; i < 6; i++) g.add(box(0.3, 0.3, 0.3, mk(i % 2 ? 0xff2a2a : 0xffffff), -3.3, 0.3, -5 + i * 2), box(0.3, 0.3, 0.3, mk(i % 2 ? 0xffffff : 0xff2a2a), 3.3, 0.3, -5 + i * 2));
  } else {
    g.add(mesh(SPH, hull, 9, 2.4, 6));
    for (let i = -2; i <= 2; i++) g.add(mesh(SPH, mk(0xff5a3a), 1.2, 1.2, 1.2, i * 2.0, -1.2, 0));
    g.add(mesh(SPH, mk(0xff2a2a), 1.5, 0.9, 1.5, 0, 0.9, 0));
    g.add(box(10, 0.15, 0.4, mk(0xff7043), 0, 0.2, 2.8));
  }
  return { group: g, lights };
}

export function makeMothership(): { group: THREE.Group; lights: THREE.MeshBasicMaterial[] } {
  const g = new THREE.Group();
  const hull = new THREE.MeshLambertMaterial({ color: 0x1b1e2b, emissive: 0x0a0c14, fog: false });
  g.add(mesh(SPH, hull, 150, 22, 150));
  g.add(mesh(SPH, hull, 70, 40, 70, 0, 12, 0));
  const lights: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.MeshBasicMaterial({ color: i % 3 ? 0x66ffcc : 0xff3366, fog: false });
    lights.push(m);
    const a = (i / 24) * Math.PI * 2;
    g.add(mesh(SPH, m, 5, 3, 5, Math.cos(a) * 68, -2, Math.sin(a) * 68));
  }
  const core = new THREE.MeshBasicMaterial({ color: 0xff3366, fog: false });
  lights.push(core);
  g.add(mesh(SPH, core, 26, 8, 26, 0, -11, 0));
  g.add(mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xff3366, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), 50, 30, 50, 0, -14, 0));
  return { group: g, lights };
}

/* ------------------------------- pickups -------------------------------- */
export type PickupKind =
  | 'ammo' | 'health' | 'energy' | 'grenade' | 'weapon' | 'armor' | 'shield' | 'speed' | 'special'
  | 'grapple' | 'zip' | 'boots' | 'gloves'
  | 'buck' | 'buck3' | 'buckBundle' | 'missile';

/** Pickup palette — every category has its own controlled colour. */
export const PICKUP_COLOR: Record<PickupKind, number> = {
  ammo: 0xffb300, health: 0x39ff6a, energy: 0x00b0ff, grenade: 0x8bc34a, weapon: 0x2979ff, armor: 0x90a4ae,
  shield: 0x00e5ff, speed: 0xff6d00, special: 0xa855f7, grapple: 0xa855f7, zip: 0xa855f7, boots: 0xa855f7, gloves: 0xa855f7,
  buck: 0xffc400, buck3: 0xffc400, buckBundle: 0xffd600, missile: 0xff7a1a,
};
export const PICKUP_LABEL: Record<PickupKind, string> = {
  ammo: 'AMMO', health: 'MED KIT', energy: 'ENERGY CELL', grenade: 'GRENADES', weapon: 'WEAPON', armor: 'ARMOR', shield: 'ENERGY SHIELD',
  speed: 'SPEED BOOST', special: 'ABILITY CHARGE', grapple: 'GRAPPLING HOOK', zip: 'ZIPLINE LAUNCHER', boots: 'JUMP BOOTS', gloves: 'MAGNETIC GLOVES',
  buck: '+10 ALIEN BUCKS', buck3: '+30 ALIEN BUCKS', buckBundle: '+75 ALIEN BUCKS', missile: 'MISSILES',
};

let glowSpriteTex: THREE.CanvasTexture | null = null;
const spriteCache = new Map<number, THREE.SpriteMaterial>();
export function glowSprite(color: number, opacity = 0.55): THREE.SpriteMaterial {
  if (!glowSpriteTex) glowSpriteTex = makeGlowTexture();
  let m = spriteCache.get(color);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: glowSpriteTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity });
    spriteCache.set(color, m);
  }
  return m;
}

export function makePickup(kind: PickupKind, weapon?: WeaponId, tier = 1, air = false): { group: THREE.Group; item: THREE.Group } {
  const c = PICKUP_COLOR[kind];
  const g = new THREE.Group();
  const item = new THREE.Group();
  const em = (col: number) => lam(col, col, 0.8);
  switch (kind) {
    case 'ammo':
      item.add(box(0.66, 0.42, 0.48, em(0xb08d1a)));
      for (let i = 0; i < 4; i++) item.add(mesh(CYL, basic(0xffe082), 0.1, 0.3, 0.1, -0.24 + i * 0.16, 0.34, 0));
      break;
    case 'health':
      item.scale.setScalar([0.7, 1, 1.24][tier] ?? 1);
      item.add(box(0.7, 0.7, 0.3, lam(0xf5f5f5, 0x444444)), box(0.5, 0.14, 0.32, basic(0x39ff6a)), box(0.14, 0.5, 0.32, basic(0x39ff6a)));
      item.add(mesh(SPH, glowMat(0x39ff6a, 0.35), 1.0, 1.0, 1.0, 0, 0.1, 0));
      break;
    case 'buck':
    case 'buck3':
    case 'buckBundle': {
      const n = kind === 'buck' ? 1 : kind === 'buck3' ? 3 : 6;
      for (let i = 0; i < n; i++) {
        const px = (i % 3) * 0.24 - 0.24;
        const py = Math.floor(i / 3) * 0.13;
        const pz = ((i * 7) % 5) * 0.05 - 0.1;
        const coin = mesh(CYL, em(0xc8920a), 0.66, 0.1, 0.66, px, py, pz);
        coin.rotation.x = Math.PI / 2;
        item.add(coin);
        item.add(mesh(OCTA, basic(0xffe680), 0.17, 0.17, 0.17, px, py, pz - 0.07));
      }
      break;
    }
    case 'energy':
      item.add(mesh(CYL, em(0x1e88a8), 0.4, 0.7, 0.4), mesh(CYL, basic(0x80ffff), 0.3, 0.74, 0.3));
      break;
    case 'grenade':
      item.add(mesh(SPH, em(0x558b2f), 0.5, 0.5, 0.5), mesh(CYL, lam(0x333333), 0.18, 0.2, 0.18, 0, 0.3, 0));
      break;
    case 'weapon': {
      const gun = makeGun(weapon ?? 'rifle', 0x8a8f9c);
      gun.scale.setScalar(1.5);
      gun.rotation.y = Math.PI / 2;
      gun.position.x = 0.5;
      item.add(gun);
      break;
    }
    case 'armor':
      item.add(box(0.7, 0.8, 0.3, em(0x3d6fd0)), box(0.4, 0.4, 0.34, basic(0xa8c8ff)));
      break;
    case 'shield':
      item.add(mesh(SPH, basic(0x7df9ff, { add: true, opacity: 0.55 }), 0.95, 0.95, 0.95), mesh(OCTA, basic(0xffffff), 0.5, 0.5, 0.5));
      break;
    case 'speed':
      item.add(mesh(CONE, em(0xff7a00), 0.5, 0.6, 0.5, 0, 0.2, 0), mesh(CONE, em(0xffb74d), 0.5, 0.6, 0.5, 0, -0.2, 0));
      break;
    case 'missile':
      for (const sx of [-0.2, 0.2]) {
        item.add(mesh(CYL, em(0xb5532a), 0.2, 0.9, 0.2, sx, 0, 0).rotateZ(Math.PI / 2));
        item.add(mesh(CONE, basic(0xffd0a0), 0.2, 0.3, 0.2, sx - 0.55, 0, 0).rotateZ(Math.PI / 2));
        item.add(box(0.06, 0.34, 0.04, basic(0xff7a1a), sx + 0.38, 0, 0));
      }
      break;
    case 'special':
      item.add(mesh(OCTA, basic(0xd9a3ff), 1.1, 1.4, 1.1), mesh(OCTA, glowMat(0xc77dff, 0.5), 1.7, 2.0, 1.7));
      break;
    case 'grapple':
      item.add(new THREE.Mesh(TORUS, basic(0x40ffff)).rotateY(0.3), mesh(CYL, lam(0x555a66), 0.12, 0.8, 0.12, 0.3, -0.2, 0));
      item.children[0].scale.setScalar(1.3);
      break;
    case 'zip':
      item.add(mesh(CYL, em(0xb09b00), 0.34, 0.8, 0.34).rotateZ(Math.PI / 2), mesh(CYL, basic(0xffee58), 0.1, 1.2, 0.1).rotateZ(Math.PI / 2));
      break;
    case 'boots':
      item.add(box(0.35, 0.4, 0.7, em(0xc4482a), -0.22, 0, 0), box(0.35, 0.4, 0.7, em(0xc4482a), 0.22, 0, 0), box(0.5, 0.1, 0.8, basic(0xffcc80), 0, -0.25, 0));
      break;
    case 'gloves':
      item.add(box(0.4, 0.5, 0.25, em(0x6a7680), -0.25, 0, 0), box(0.4, 0.5, 0.25, em(0x6a7680), 0.25, 0, 0), mesh(SPH, basic(0xff4d4d), 0.14, 0.14, 0.14, -0.25, 0.28, -0.14), mesh(SPH, basic(0x4d79ff), 0.14, 0.14, 0.14, 0.25, 0.28, -0.14));
      break;
  }
  item.position.y = 0.95;
  g.add(item);
  if (!air) {
    // restrained lighting: a small ground ring and a short soft beam
    const ring = new THREE.Mesh(CYL, glowMat(c, 0.32));
    ring.scale.set(1.15, 0.03, 1.15);
    ring.position.y = 0.05;
    g.add(ring);
    const pillar = new THREE.Mesh(OPEN_CYL, basic(c, { add: true, opacity: 0.07, side: THREE.DoubleSide }));
    pillar.scale.set(0.42, 1.9, 0.42);
    pillar.position.y = 0.95;
    g.add(pillar);
  } else {
    item.scale.multiplyScalar(2.1); // readable from far away while flying
    item.position.y = 0;
  }
  const halo = new THREE.Sprite(glowSprite(c));
  halo.scale.set(air ? 3.4 : 1.5, air ? 3.4 : 1.5, 1);
  halo.position.y = air ? 0 : 0.95;
  g.add(halo);
  g.add(mesh(SPH, glowMat(c, 0.3), air ? 1.6 : 0.7, air ? 1.6 : 0.7, air ? 1.6 : 0.7, 0, air ? 0 : 0.95, 0));
  g.userData.item = item;
  return { group: g, item };
}
