import * as THREE from 'three';
import { basic, box, CONE, CYL, glowSprite, lam, makeHumanoid, mesh, OCTA, SPH, std, TORUS } from './models';

/* -------------------------------------------------------------------------- */
/*  Player fighter                                                            */
/* -------------------------------------------------------------------------- */
let wingG: THREE.BufferGeometry | null = null;
/** Swept delta wing — an extruded outline, not a box. */
function wingGeo(): THREE.BufferGeometry {
  if (wingG) return wingG;
  const s = new THREE.Shape();
  s.moveTo(0.3, -0.9);
  s.lineTo(3.9, 1.2);
  s.lineTo(3.9, 1.9);
  s.lineTo(3.1, 2.2);
  s.lineTo(0.3, 1.9);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.07, 0);
  g.computeVertexNormals();
  wingG = g;
  return g;
}

export interface FighterRig {
  group: THREE.Group;
  canopy: THREE.Group;
  pilot: THREE.Object3D;
  flames: THREE.Mesh[];
  thrusters: { m: THREE.Mesh; sx: number; sy: number }[];
  muzzles: THREE.Object3D[];
  pylons: THREE.Object3D[];
  parts: Record<string, THREE.Object3D>;
  bodyMat: THREE.MeshStandardMaterial;
  baseColor: THREE.Color;
}

/** Single-seat fighter. Forward is -Z. Visible cockpit + pilot, twin engines, thrusters, cannons. */
export function makeFighter(o: { suit: number; accent: number; skin: number; paint?: number }): FighterRig {
  const g = new THREE.Group();
  const hullColor = o.paint ?? 0x8f98a8;
  const bodyMat = new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.28, metalness: 0.85 });
  const panelMat = new THREE.MeshStandardMaterial({ color: o.suit, roughness: 0.38, metalness: 0.7 });
  const accMat = new THREE.MeshStandardMaterial({ color: o.accent, roughness: 0.4, metalness: 0.3, emissive: o.accent, emissiveIntensity: 0.6 });
  const dark = std(0x1b1e27, { rough: 0.5, metal: 0.8 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x5ec8ff, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.38, emissive: 0x0a2a44, emissiveIntensity: 0.6, depthWrite: false,
  });
  const parts: Record<string, THREE.Object3D> = {};

  // fuselage: elongated body, tapering nose, dorsal spine, belly intake
  g.add(mesh(SPH, bodyMat, 1.5, 1.0, 5.4, 0, 0, 0.3));
  const nose = mesh(CONE, bodyMat, 0.95, 3.2, 0.95, 0, -0.02, -3.5);
  nose.rotation.x = -Math.PI / 2;
  g.add(nose);
  g.add(box(0.2, 0.34, 3.2, panelMat, 0, 0.55, 1.4));
  g.add(box(1.0, 0.26, 2.4, panelMat, 0, -0.52, 0.2));

  // swept wings with glowing leading edges
  const wR = new THREE.Mesh(wingGeo(), panelMat);
  wR.position.set(0.55, -0.12, 0.2);
  const wL = new THREE.Mesh(wingGeo(), panelMat);
  wL.position.set(-0.55, -0.12, 0.2);
  wL.scale.x = -1;
  g.add(wR, wL);
  for (const s of [-1, 1]) {
    const edge = box(0.07, 0.06, 4.2, accMat, s * 2.65, -0.06, 0.35);
    edge.rotation.y = s * 1.04;
    g.add(edge);
    const tip = box(0.1, 0.7, 1.0, accMat, s * 4.4, 0.3, 1.55); // damageable wing-tip fin
    tip.rotation.z = -s * 0.3;
    g.add(tip);
    parts[s < 0 ? 'wingtipL' : 'wingtipR'] = tip;
    const fin = box(0.12, 1.1, 1.3, panelMat, s * 0.8, 0.75, 2.5); // damageable tail fin
    fin.rotation.z = -s * 0.32;
    g.add(fin);
    parts[s < 0 ? 'finL' : 'finR'] = fin;
  }

  // twin engines + flames
  const flames: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const nac = mesh(CYL, dark, 0.72, 2.7, 0.72, s * 0.98, -0.05, 2.35);
    nac.rotation.x = Math.PI / 2;
    g.add(nac);
    const ring = new THREE.Mesh(TORUS, accMat);
    ring.scale.setScalar(0.85);
    ring.position.set(s * 0.98, -0.05, 3.7);
    g.add(ring);
    const fo = mesh(CONE, basic(0xff7a2a, { add: true, opacity: 0.75 }), 0.62, 2.4, 0.62, s * 0.98, -0.05, 4.9);
    fo.rotation.x = Math.PI / 2;
    const fi = mesh(CONE, basic(0xbfe9ff, { add: true, opacity: 0.95 }), 0.32, 1.5, 0.32, s * 0.98, -0.05, 4.4);
    fi.rotation.x = Math.PI / 2;
    g.add(fo, fi);
    flames.push(fo, fi);
    const halo = new THREE.Sprite(glowSprite(0x66b8ff, 0.7));
    halo.scale.set(2.6, 2.6, 1);
    halo.position.set(s * 0.98, -0.05, 3.9);
    g.add(halo);
    parts[s < 0 ? 'engineL' : 'engineR'] = nac;
  }

  // maneuvering thrusters (lateral + vertical)
  const thrusters: FighterRig['thrusters'] = [];
  const tm = basic(0x7be8ff, { add: true, opacity: 0.9 });
  const spec: [number, number, number, number, number][] = [
    [-0.55, 0.1, -2.3, -1, 0], [0.55, 0.1, -2.3, 1, 0], [-4.55, 0.1, 2.0, -1, 0], [4.55, 0.1, 2.0, 1, 0],
    [-4.4, 0.35, 2.0, 0, 1], [4.4, 0.35, 2.0, 0, 1], [-0.7, -0.55, 3.0, 0, -1], [0.7, -0.55, 3.0, 0, -1],
  ];
  for (const [x, y, z, sx, sy] of spec) {
    const m = mesh(SPH, tm, 0.3, 0.3, 0.3, x, y, z);
    m.scale.setScalar(0.05);
    g.add(m);
    thrusters.push({ m, sx, sy });
  }

  // laser cannons (muzzles 0/1 + nose emitter 2) and missile pylons
  const muzzles: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    g.add(box(0.3, 0.3, 1.3, dark, s * 1.9, -0.2, -0.1));
    const barrel = mesh(CYL, dark, 0.12, 2.4, 0.12, s * 1.9, -0.2, -1.55);
    barrel.rotation.x = Math.PI / 2;
    g.add(barrel);
    g.add(box(0.16, 0.16, 0.12, basic(0x66ffee), s * 1.9, -0.2, -2.78));
    const m = new THREE.Object3D();
    m.position.set(s * 1.9, -0.2, -2.9);
    g.add(m);
    muzzles.push(m);
  }
  const nm = new THREE.Object3D();
  nm.position.set(0, -0.1, -5.0);
  g.add(nm);
  muzzles.push(nm);
  const pylons: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    g.add(box(0.14, 0.2, 1.1, dark, s * 3.0, -0.25, 0.9));
    const p = new THREE.Object3D();
    p.position.set(s * 3.0, -0.4, 0.4);
    g.add(p);
    pylons.push(p);
  }

  // cockpit canopy (hinged at its rear edge so it can open for ejection) + seated pilot
  const canopy = new THREE.Group();
  canopy.position.set(0, 0.5, 0.35);
  canopy.add(mesh(SPH, glass, 1.05, 0.85, 2.3, 0, 0.12, -1.15));
  canopy.add(box(0.06, 0.06, 2.1, accMat, 0, 0.62, -1.2));
  canopy.add(box(1.1, 0.07, 0.08, accMat, 0, 0.35, -0.2));
  g.add(canopy);
  const hum = makeHumanoid({ skin: o.skin, suit: o.suit, accent: o.accent, eye: 0x111111, scale: 0.36, helmet: true });
  hum.body.position.y = 0.55;
  hum.legL.rotation.x = 1.45;
  hum.legR.rotation.x = 1.45;
  hum.armL.rotation.x = 1.15;
  hum.armR.rotation.x = 1.15;
  hum.root.position.set(0, 0.22, -0.75);
  g.add(hum.root);
  parts.canopy = canopy;

  return { group: g, canopy, pilot: hum.root, flames, thrusters, muzzles, pylons, parts, bodyMat, baseColor: bodyMat.color.clone() };
}

/* -------------------------------------------------------------------------- */
/*  Alien mothership (boss)                                                   */
/* -------------------------------------------------------------------------- */
export interface BossRig {
  group: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  lights: THREE.MeshBasicMaterial[];
  coreMat: THREE.MeshBasicMaterial;
}

/** ~84 m wide, ~110 m long. Faces -Z; the player sees the engines, turrets, hangar and reactor core. */
export function makeBossShip(): BossRig {
  const g = new THREE.Group();
  const hull = std(0x1d202c, { rough: 0.45, metal: 0.85 });
  const hull2 = std(0x2b3042, { rough: 0.4, metal: 0.8 });
  const trim = std(0x0f1118, { rough: 0.6, metal: 0.7 });
  const lights: THREE.MeshBasicMaterial[] = [];
  const L = (c: number) => {
    const m = new THREE.MeshBasicMaterial({ color: c });
    lights.push(m);
    return m;
  };
  const parts: Record<string, THREE.Object3D> = {};

  g.add(mesh(SPH, hull, 84, 15, 108));
  g.add(mesh(SPH, hull2, 54, 12, 72, 0, 6, -6));
  const prow = mesh(CONE, hull2, 26, 56, 26, 0, 0, -80);
  prow.rotation.x = -Math.PI / 2;
  g.add(prow);
  for (let i = 0; i < 9; i++) g.add(box(18 - i * 1.1, 2.4, 5.5, trim, 0, 11.8 - Math.abs(i - 4) * 0.35, -34 + i * 8.5));
  for (const s of [-1, 1]) {
    const py = box(36, 3.2, 30, hull2, s * 46, -1, 12);
    py.rotation.z = s * 0.1;
    g.add(py);
    g.add(box(34, 0.5, 0.7, L(0x66ffcc), s * 46, 0.9, 27.4));
    g.add(box(0.8, 2.4, 20, trim, s * 62, 0.2, 12));
  }
  g.add(box(9, 9, 13, hull2, 0, 13, -24));
  g.add(mesh(SPH, L(0x66ffcc), 8, 5, 9, 0, 18.5, -24));
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    g.add(mesh(SPH, L(i % 3 ? 0x66ffcc : 0xff3366), 2.2, 2.2, 2.2, Math.cos(a) * 41, -2 + Math.sin(a * 3) * 1.5, Math.sin(a) * 52));
  }
  g.add(box(58, 11, 6, hull, 0, 0, 49));

  // hangar bay (where fighters are launched)
  const bay = new THREE.Group();
  bay.position.set(0, -3.5, 52.6);
  bay.add(box(26, 11, 2, trim, 0, 0, 0));
  bay.add(box(22, 7.5, 2.3, basic(0x03040a), 0, 0, 0.3));
  for (let i = 0; i < 5; i++) bay.add(box(1.2, 8.5, 0.4, L(0xff8a30), -9 + i * 4.5, 0, 1.6));
  g.add(bay);
  parts.bay = bay;

  // reactor core (weak point)
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xff3366 });
  const core = new THREE.Group();
  core.position.set(0, 2.0, 51.5);
  core.add(mesh(SPH, coreMat, 8, 8, 4));
  const ch = new THREE.Sprite(glowSprite(0xff3366, 0.8));
  ch.scale.set(26, 26, 1);
  core.add(ch);
  g.add(core);
  parts.core = core;

  // engines
  for (const s of [-1, 1]) {
    const eng = new THREE.Group();
    eng.position.set(s * 27, 0, 46);
    const nac = mesh(CYL, hull2, 14, 18, 14);
    nac.rotation.x = Math.PI / 2;
    eng.add(nac);
    const ring = new THREE.Mesh(TORUS, L(0xff7a30));
    ring.scale.setScalar(16);
    ring.position.z = 9.2;
    eng.add(ring);
    const fl = mesh(CONE, basic(0xff7a2a, { add: true, opacity: 0.7 }), 11, 30, 11, 0, 0, 25);
    fl.rotation.x = Math.PI / 2;
    const fl2 = mesh(CONE, basic(0xfff1cc, { add: true, opacity: 0.9 }), 5.5, 18, 5.5, 0, 0, 18);
    fl2.rotation.x = Math.PI / 2;
    eng.add(fl, fl2);
    const halo = new THREE.Sprite(glowSprite(0xff8a30, 0.75));
    halo.scale.set(36, 36, 1);
    halo.position.z = 10;
    eng.add(halo);
    g.add(eng);
    parts[s < 0 ? 'engineL' : 'engineR'] = eng;
  }

  // dorsal gun turrets
  for (const s of [-1, 1]) {
    const tur = new THREE.Group();
    tur.position.set(s * 17, 10.5, 24);
    tur.add(mesh(CYL, trim, 7, 3, 7));
    tur.add(mesh(SPH, hull2, 5.5, 3.6, 5.5, 0, 1.6, 0));
    for (const b of [-1, 1]) {
      tur.add(box(1, 1, 9, trim, b * 1.4, 2.0, 4.8));
      tur.add(box(1.3, 1.3, 0.5, L(0xff3366), b * 1.4, 2.0, 9.4));
    }
    const mz = new THREE.Object3D();
    mz.position.set(0, 2.0, 10);
    tur.add(mz);
    tur.userData.muzzle = mz;
    g.add(tur);
    parts[s < 0 ? 'turretL' : 'turretR'] = tur;
  }
  return { group: g, parts, lights, coreMat };
}

/* -------------------------------------------------------------------------- */
/*  Small enemy spacecraft                                                    */
/* -------------------------------------------------------------------------- */
export type AirType = 'interceptor' | 'gunship' | 'kamikaze' | 'heavy' | 'elite' | 'target';

/** Built facing -Z; callers rotate by PI so the nose points at the player. */
export function makeAirEnemy(type: AirType): { group: THREE.Group; lights: THREE.MeshBasicMaterial[] } {
  const g = new THREE.Group();
  const lights: THREE.MeshBasicMaterial[] = [];
  const L = (c: number) => {
    const m = new THREE.MeshBasicMaterial({ color: c });
    lights.push(m);
    return m;
  };
  const dark = std(0x23262f, { rough: 0.4, metal: 0.8 });
  switch (type) {
    case 'interceptor': {
      const hm = std(0x8a1f2d, { rough: 0.35, metal: 0.8 });
      g.add(mesh(SPH, hm, 1.1, 0.8, 4.2));
      const n = mesh(CONE, hm, 0.9, 1.8, 0.9, 0, 0, -2.9);
      n.rotation.x = -Math.PI / 2;
      g.add(n);
      for (const s of [-1, 1]) {
        const w = box(3.8, 0.12, 1.5, dark, s * 1.9, 0, 0.9);
        w.rotation.y = s * -0.45;
        g.add(w);
        g.add(mesh(SPH, L(0xff5030), 0.4, 0.4, 0.9, s * 0.5, 0, 2.2));
      }
      g.add(mesh(SPH, L(0xffee44), 0.5, 0.4, 1.0, 0, 0.45, -0.6));
      break;
    }
    case 'gunship': {
      const hm = std(0x8a5a1f, { rough: 0.4, metal: 0.75 });
      g.add(box(2.2, 1.2, 5, hm));
      g.add(mesh(SPH, hm, 2.4, 1.4, 5.4, 0, 0.1, 0));
      for (const s of [-1, 1]) {
        g.add(box(3.6, 0.3, 2.2, dark, s * 2.9, 0, 0.8));
        const cn = mesh(CYL, dark, 0.3, 2.6, 0.3, s * 3.6, -0.2, -0.6);
        cn.rotation.x = Math.PI / 2;
        g.add(cn);
        g.add(mesh(SPH, L(0xffa030), 0.5, 0.5, 0.5, s * 3.6, -0.2, -1.9));
      }
      g.add(mesh(SPH, L(0xffcc66), 0.8, 0.6, 1.2, 0, 0.7, -1.0));
      break;
    }
    case 'kamikaze': {
      g.add(mesh(SPH, dark, 2.2, 2.2, 2.2));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const sp = mesh(CONE, dark, 0.4, 1.4, 0.4, Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0);
        sp.rotation.z = a - Math.PI / 2;
        g.add(sp);
      }
      g.add(mesh(SPH, L(0xff2a2a), 1.1, 1.1, 1.1, 0, 0, -0.9));
      const h = new THREE.Sprite(glowSprite(0xff3a2a, 0.9));
      h.scale.set(4.5, 4.5, 1);
      g.add(h);
      break;
    }
    case 'heavy': {
      const hm = std(0x4a2a6e, { rough: 0.4, metal: 0.8 });
      g.add(box(4.2, 2.0, 7.5, hm));
      g.add(mesh(SPH, hm, 3.4, 1.8, 6, 0, 0.4, 0));
      for (const s of [-1, 1]) {
        g.add(box(1.4, 1.0, 5.5, dark, s * 3.1, -0.2, 0.5));
        for (const o of [-0.5, 0.5]) {
          const b = mesh(CYL, dark, 0.28, 3.0, 0.28, s * 3.1 + o, -0.6, -2.4);
          b.rotation.x = Math.PI / 2;
          g.add(b);
        }
        g.add(mesh(SPH, L(0xc16bff), 1.2, 1.2, 1.2, s * 1.3, 0, 3.8));
      }
      g.add(mesh(SPH, L(0xff4dd2), 1.0, 0.7, 1.4, 0, 1.1, -1.8));
      break;
    }
    case 'elite': {
      const hm = std(0xc9a227, { rough: 0.25, metal: 0.9 });
      g.add(mesh(SPH, hm, 1.0, 0.7, 4.8));
      const n = mesh(CONE, hm, 0.7, 2.0, 0.7, 0, 0, -3.2);
      n.rotation.x = -Math.PI / 2;
      g.add(n);
      for (const s of [-1, 1]) {
        const w = box(4.6, 0.1, 1.3, hm, s * 2.4, 0, 0.3);
        w.rotation.y = s * 0.6;
        g.add(w);
        g.add(box(4.0, 0.08, 0.14, L(0x40e0ff), s * 2.2, 0.07, -0.1)).rotation.y = s * 0.6;
        g.add(mesh(SPH, L(0x40e0ff), 0.5, 0.5, 0.9, s * 4.1, 0, 1.3));
      }
      const r = new THREE.Mesh(TORUS, L(0x40e0ff));
      r.scale.setScalar(2.4);
      r.position.z = 1.2;
      g.add(r);
      break;
    }
    case 'target': {
      const disc = (r: number, c: number, z: number) => {
        const m = mesh(CYL, basic(c), r * 2, 0.4, r * 2, 0, 0, z);
        m.rotation.x = Math.PI / 2;
        g.add(m);
      };
      disc(4, 0xff3a2a, 0);
      disc(3, 0xffffff, -0.05);
      disc(2, 0xff3a2a, -0.1);
      disc(1, 0xffffff, -0.15);
      const h = new THREE.Sprite(glowSprite(0xff5a40, 0.5));
      h.scale.set(11, 11, 1);
      g.add(h);
      break;
    }
  }
  return { group: g, lights };
}

/* -------------------------------------------------------------------------- */
/*  Launch pad, training props                                                */
/* -------------------------------------------------------------------------- */
export interface PadRig {
  group: THREE.Group;
  ship: FighterRig;
  marker: THREE.Mesh;
}

/** Landing pad with a parked one-person fighter. Replaces the old ladder platform. */
export function makeShipPad(o: { suit: number; accent: number; skin: number; paint?: number }): PadRig {
  const g = new THREE.Group();
  g.add(box(9.6, 0.4, 12.8, std(0x2a2f3b, { rough: 0.6, metal: 0.6 }), 0, 0.2, 0));
  g.add(box(9.0, 0.06, 12.2, std(0x161a23, { rough: 0.5, metal: 0.7 }), 0, 0.43, 0));
  for (let i = 0; i < 8; i++) {
    const c = i % 2 ? 0xffc400 : 0x14141a;
    g.add(box(1.2, 0.07, 0.55, basic(c), -4.2 + i * 1.2, 0.46, 6.0));
    g.add(box(1.2, 0.07, 0.55, basic(c), -4.2 + i * 1.2, 0.46, -6.0));
  }
  const ring = new THREE.Mesh(TORUS, basic(0x40ffe0, { add: true, opacity: 0.8 }));
  ring.rotation.x = Math.PI / 2;
  ring.scale.setScalar(9);
  ring.position.y = 0.5;
  g.add(ring);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(mesh(CYL, lam(0x3a4150), 0.5, 1.2, 0.5, sx * 4.5, 0.9, sz * 6.1));
      g.add(mesh(SPH, basic(0x40ffe0), 0.4, 0.4, 0.4, sx * 4.5, 1.6, sz * 6.1));
      const sp = new THREE.Sprite(glowSprite(0x40ffe0, 0.7));
      sp.scale.set(3, 3, 1);
      sp.position.set(sx * 4.5, 1.6, sz * 6.1);
      g.add(sp);
      g.add(box(0.25, 0.9, 0.25, lam(0x555b68), sx * 1.6, 0.85, sz * 1.6 + 0.4));
    }
  const rig = makeFighter(o);
  rig.group.scale.setScalar(1);
  rig.group.position.set(0, 1.35, 0.4);
  rig.canopy.rotation.x = 0.95;
  rig.pilot.visible = false;
  g.add(rig.group);
  const marker = mesh(OCTA, basic(0x40ffe0), 0.9, 1.3, 0.9, 0, 4.8, 0.4);
  g.add(marker);
  const mh = new THREE.Sprite(glowSprite(0x40ffe0, 0.8));
  mh.scale.set(3, 3, 1);
  mh.position.set(0, 4.8, 0.4);
  g.add(mh);
  return { group: g, ship: rig, marker };
}

/** Shooting-range target for the ground training lessons. */
export function makeTargetBoard(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.14, 1.2, 0.14, lam(0x555b68), 0, 0.6, 0));
  const mk = (r: number, c: number, z: number) => {
    const m = mesh(CYL, basic(c), r * 2, 0.12, r * 2, 0, 1.55, z);
    m.rotation.x = Math.PI / 2;
    g.add(m);
  };
  mk(0.95, 0xff3a2a, 0);
  mk(0.72, 0xffffff, 0.07);
  mk(0.5, 0xff3a2a, 0.14);
  mk(0.26, 0xffffff, 0.21);
  const sp = new THREE.Sprite(glowSprite(0xff5a40, 0.5));
  sp.scale.set(3.2, 3.2, 1);
  sp.position.set(0, 1.55, 0.3);
  g.add(sp);
  return g;
}

/** Training ring for the flight lesson — own material so it can change colour. */
export function makeRing3D(r: number, color: number): THREE.Mesh {
  const m = new THREE.Mesh(
    TORUS,
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.scale.setScalar(r * 2);
  return m;
}

let chuteGeo: THREE.SphereGeometry | null = null;
export function makeParachute(): THREE.Group {
  const g = new THREE.Group();
  if (!chuteGeo) chuteGeo = new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const canopy = new THREE.Mesh(chuteGeo, new THREE.MeshLambertMaterial({ color: 0xff7a1a, side: THREE.DoubleSide, emissive: 0x331100 }));
  canopy.scale.set(7, 4, 7);
  canopy.position.y = 4.6;
  g.add(canopy);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const line = box(0.04, 4.8, 0.04, basic(0xdddddd), Math.cos(a) * 1.7, 2.3, Math.sin(a) * 1.7);
    line.rotation.z = -Math.cos(a) * 0.37;
    line.rotation.x = Math.sin(a) * 0.37;
    g.add(line);
  }
  return g;
}
