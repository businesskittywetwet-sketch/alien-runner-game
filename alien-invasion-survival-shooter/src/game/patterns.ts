import * as THREE from 'three';
import type { Game } from './game';
import { LANE_X, WEAPONS, WEAPON_ORDER, type WeaponId } from './config';
import {
  basic, box, BOX, lam, makeBarricade, makeBarrel, makeBarrier, makeCar, makeCrate, makeCrater, makeDebris, makeBillboard, makeFallenLight, makeGantry, makeScaffold, SIGNS,
  makeHookPoint, makeLowWall, makePipe, makeRailing, makeRamp, makeTruck, mesh, PLANE, SPH, glowMat, type PickupKind,
} from './models';
import { store } from './progress';
import { pick, rand } from './util';

const CAR_COLORS = [0x8e1f1f, 0x1f4d8e, 0x6e6e72, 0x2a6a3a, 0xd0d0c8, 0x8a6a1a, 0x4a2a6a, 0xc9a227];
export type GapKind = 'rope' | 'zip' | 'bar' | 'plat' | 'grapple';

export class Patterns {
  g: Game;
  constructor(g: Game) {
    this.g = g;
  }

  /* ------------------------------- helpers ------------------------------- */
  lanes(n: number): number[] {
    const a = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    return a.slice(0, n).sort();
  }
  adjacent(n: number): number[] {
    const s = Math.floor(Math.random() * (5 - n));
    return Array.from({ length: n }, (_, i) => s + i);
  }
  private cx(lanes: number[]) {
    return lanes.reduce((a, l) => a + LANE_X[l], 0) / lanes.length;
  }

  rewardKind(): PickupKind {
    const g = this.g;
    const p = g.player;
    const w: [PickupKind, number][] = [
      ['ammo', 18], ['energy', 11], ['grenade', 7], ['weapon', 9], ['armor', 6], ['shield', 6], ['speed', 4], ['special', 6],
      ['grapple', p.eq.grapple > 0 ? 1 : 5], ['zip', p.eq.zip > 0 ? 1 : 4], ['boots', 5], ['gloves', 4],
      ['buck', 9], ['buck3', 4], ['buckBundle', 1.2],
    ];
    let tot = 0;
    for (const [, x] of w) tot += x;
    let r = Math.random() * tot;
    for (const [k, x] of w) {
      r -= x;
      if (r <= 0) return k;
    }
    return 'ammo';
  }
  pickWeapon(): WeaponId {
    const unlocked = store.unlockedWeapons();
    const owned = this.g.weapons.owned;
    const fresh = unlocked.filter((w) => !owned.has(w));
    const pool = fresh.length && Math.random() < 0.75 ? fresh : unlocked.filter((w) => w !== 'pistol');
    return pick(pool.length ? pool : (['rifle'] as WeaponId[]));
  }
  lastHealthZ = 0;

  /** Med-kit spawn chance rises as the player's health falls (never at full health). */
  healthChance(hp: number, max: number): number {
    if (hp >= max) return 0;
    if (hp <= 15) return 0.6;
    if (hp <= 30) return 0.45;
    if (hp <= 50) return 0.3;
    if (hp <= 75) return 0.15;
    return 0.05;
  }

  reward(x: number, y: number, z: number, kind?: PickupKind) {
    const g = this.g;
    const hp = g.player.health;
    let k = kind;
    if (k === undefined) {
      // never two med kits in a row
      if (Math.abs(z - this.lastHealthZ) > 60 && Math.random() < this.healthChance(hp, g.player.maxHealth)) {
        k = 'health';
        this.lastHealthZ = z;
      } else k = this.rewardKind();
    }
    const tier = k === 'health' ? (hp >= 70 ? 0 : hp >= 40 ? 1 : 2) : 1;
    g.pickups.spawn(k, x, y, z, k === 'weapon' ? this.pickWeapon() : undefined, tier);
  }

  /* ------------------------------- simple ------------------------------- */
  car(z: number): number {
    const o = this.g.obstacles;
    const lanes = this.lanes(Math.random() < 0.35 ? 2 : 1);
    for (const l of lanes) {
      const { group } = makeCar(pick(CAR_COLORS));
      group.rotation.y = rand(-0.05, 0.05);
      o.make('car', LANE_X[l], z - 3, 2.1, 4.6, 1.55, group, { walk: true, hurt: 25, label: 'Car Roof' });
      if (Math.random() < 0.3) this.reward(LANE_X[l], 1.55, z - 3);
    }
    return 10;
  }
  burning(z: number): number {
    const g = this.g;
    const lanes = this.adjacent(Math.random() < 0.4 ? 2 : 1);
    for (const l of lanes) {
      const { group } = makeCar(0, 'burnt');
      const x = LANE_X[l];
      const ob = g.obstacles.make('burning', x, z - 3, 2.1, 4.6, 2.3, group, { hurt: 32 });
      const flameGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.world.glowTex, color: 0xff7a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      flameGlow.scale.set(7, 7, 1);
      flameGlow.position.y = 1.6;
      group.add(flameGlow);
      ob.onUpdate = (o) => {
        if (Math.abs(o.box.z0 - g.player.z) < 130) {
          g.fx.flame({ x: x + rand(-0.8, 0.8), y: 1.0, z: z - 3 + rand(-1.8, 1.8) }, 1.3);
          if (Math.random() < 0.35) g.fx.smokePuff({ x, y: 2.0, z: z - 3 }, 1.2, 0.4);
        }
      };
    }
    return 10;
  }
  barrier(z: number): number {
    const g = this.g;
    const lanes = this.lanes(Math.random() < 0.5 ? 2 : 1);
    for (const l of lanes) {
      const { group, light } = makeBarrier();
      const ob = g.obstacles.make('barrier', LANE_X[l], z - 2, 2.5, 0.6, 0.95, group, { hurt: 15, hp: 40, shootable: true });
      ob.onUpdate = (_o, _dt, t) => light.color.setHex(Math.floor(t * 4) % 2 ? 0xffaa00 : 0x442200);
    }
    return 6;
  }
  debris(z: number): number {
    const lanes = this.lanes(Math.random() < 0.5 ? 2 : 1);
    for (const l of lanes) this.g.obstacles.make('debris', LANE_X[l], z - 2, 2.4, 2.4, 0.95, makeDebris(), { hurt: 15, hp: 60, shootable: true });
    return 6;
  }
  fallenLight(z: number): number {
    const g = this.g;
    const n = Math.random() < 0.3 ? 4 : Math.random() < 0.5 ? 3 : 2;
    const lanes = this.adjacent(n);
    const w = n * 3 - 0.3;
    const x = this.cx(lanes);
    const ob = g.obstacles.make('beam', x, z - 2, w, 1.0, 0.9, makeFallenLight(w), { y0: 0.85, hurt: 20, label: 'Slide' });
    ob.box.y1 = 1.75;
    ob.onUpdate = (o) => {
      if (Math.abs(o.box.z0 - g.player.z) < 90 && Math.random() < 0.08)
        g.fx.sparks({ x: x - w / 2 + 0.4, y: 1.0, z: z - 1.8 }, 0xffe080, 5, 4);
    };
    return 7;
  }
  billboard(z: number): number {
    const n = 2 + Math.floor(Math.random() * 3);
    const lanes = this.adjacent(n);
    const w = n * 3 - 0.3;
    const [txt, colr] = pick(SIGNS);
    this.g.obstacles.make('beam', this.cx(lanes), z - 2, w, 0.5, 1.7, makeBillboard(w, txt, colr), { y0: 0.9, hurt: 20, label: 'Slide' });
    return 7;
  }
  scaffold(z: number): number {
    const n = 2 + Math.floor(Math.random() * 2);
    const lanes = this.adjacent(n);
    const w = n * 3 - 0.3;
    this.g.obstacles.make('beam', this.cx(lanes), z - 2, w, 1.8, 1.7, makeScaffold(w), { y0: 0.9, hurt: 20, label: 'Slide' });
    return 7;
  }
  crater(z: number): number {
    const lanes = this.lanes(Math.random() < 0.4 ? 2 : 1);
    for (const l of lanes) this.g.obstacles.make('crater', LANE_X[l], z - 2, 3.2, 3.2, 0.3, makeCrater(), { contact: 'crater', hurt: 18 });
    return 7;
  }
  lowWall(z: number): number {
    const n = 1 + Math.floor(Math.random() * 4);
    const lanes = n === 4 ? [0, 1, 2, 3] : this.adjacent(n);
    for (const l of lanes) this.g.obstacles.make('wall', LANE_X[l], z - 2, 2.9, 0.6, 1.0, makeLowWall(2.8), { walk: true, contact: 'vault', hurt: 0 });
    return 6;
  }
  railing(z: number): number {
    const n = 1 + Math.floor(Math.random() * 4);
    const lanes = n === 4 ? [0, 1, 2, 3] : this.adjacent(n);
    for (const l of lanes) {
      const ob = this.g.obstacles.make('rail', LANE_X[l], z - 2, 2.9, 0.3, 0.35, makeRailing(2.8), { y0: 0.8, hurt: 12 });
      ob.box.y1 = 1.12;
    }
    return 6;
  }
  pipe(z: number): number {
    const n = 2 + Math.floor(Math.random() * 3);
    const lanes = this.adjacent(n);
    const w = n * 3 - 0.2;
    const ob = this.g.obstacles.make('pipe', this.cx(lanes), z - 2, w, 1.0, 1.0, makePipe(w), { y0: 0.95, hurt: 18 });
    ob.box.y1 = 1.95;
    return 7;
  }
  crates(z: number): number {
    const o = this.g.obstacles;
    const l = Math.floor(Math.random() * 4);
    const x = LANE_X[l];
    if (Math.random() < 0.45) {
      o.make('crate', x, z - 2, 1.7, 1.7, 1.3, makeCrate(1.3), { walk: true, hurt: 14, hp: 45, shootable: true, label: 'Crate' });
      return 6;
    }
    // staircase: low crate -> tall crate -> low crate
    o.make('crate', x, z - 2, 1.7, 1.7, 1.2, makeCrate(1.2), { walk: true, hurt: 14, hp: 50, shootable: true, label: 'Crate' });
    o.make('crate', x, z - 6.2, 2.4, 2.4, 2.2, makeCrate(2.2, 0x6b7a8f), { walk: true, hurt: 20, hp: 90, shootable: true, label: 'Crate Stack' });
    this.reward(x, 2.2, z - 6.2);
    return 11;
  }
  barrels(z: number): number {
    const g = this.g;
    const lanes = this.lanes(Math.random() < 0.5 ? 2 : 1);
    for (const l of lanes) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        g.obstacles.make('barrel', LANE_X[l] + (i - (n - 1) / 2) * 0.95, z - 2 - (i % 2) * 0.6, 0.95, 0.95, 1.15, makeBarrel(), {
          contact: 'explode', hp: 1, shootable: true, aim: true, explosive: true,
        });
      }
    }
    return 7;
  }
  electric(z: number): number {
    const g = this.g;
    const n = 2 + Math.floor(Math.random() * 2);
    const lanes = this.adjacent(n);
    const w = n * 3 - 0.2;
    const x = this.cx(lanes);
    const grp = new THREE.Group();
    for (const s of [-1, 1]) {
      grp.add(box(0.45, 2.6, 0.45, lam(0x3a4150), s * (w / 2 + 0.1), 1.3, 0));
      grp.add(mesh(SPH, basic(0x80ffff), 0.5, 0.5, 0.5, s * (w / 2 + 0.1), 2.7, 0));
    }
    const arc = mesh(BOX, basic(0x9ff4ff, { add: true, opacity: 0.95 }), w, 0.16, 0.16, 0, 1.2, 0);
    const arc2 = mesh(BOX, basic(0xffffff, { add: true, opacity: 0.9 }), w, 0.07, 0.07, 0, 1.2, 0);
    grp.add(arc, arc2);
    const off = Math.random() * 2.6;
    const ob = g.obstacles.make('electric', x, z - 2, w, 0.7, 1.9, grp, { contact: 'timed', active: true, hurt: 22, label: 'Timing' });
    ob.onUpdate = (o, _dt, t) => {
      const ph = (t + off) % 2.6;
      o.active = ph < 1.2;
      const warn = ph > 2.3;
      arc.visible = o.active || (warn && Math.floor(t * 30) % 2 === 0);
      arc2.visible = arc.visible;
      arc.position.y = arc2.position.y = 1.2 + Math.sin(t * 40) * 0.25;
      if (o.active && Math.abs(o.box.z0 - g.player.z) < 80 && Math.random() < 0.3) g.fx.sparks({ x: x + rand(-w / 2, w / 2), y: 1.2, z: z - 2 }, 0x9ff4ff, 2, 3);
    };
    return 7;
  }
  debrisFall(z: number): number {
    const g = this.g;
    const l = Math.floor(Math.random() * 4);
    const x = LANE_X[l];
    const mdl = makeDebris();
    mdl.scale.setScalar(1.15);
    const marker = mesh(BOX, basic(0xff2a1a, { add: true, opacity: 0.5 }), 3.2, 0.03, 3.2, 0, 0.08, 0);
    mdl.add(marker);
    const ob = g.obstacles.make('rubble', x, z - 2, 2.4, 2.4, 1.3, mdl, { contact: 'timed', active: false, hurt: 28, label: '' });
    mdl.position.y = 30;
    let t = -1;
    let landed = false;
    const T = 1.4;
    ob.onUpdate = (o, dt, tm) => {
      if (landed) return;
      if (t < 0 && g.player.z - (z - 2) < 44) t = 0;
      (marker.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.4 * Math.abs(Math.sin(tm * 9));
      if (t >= 0) {
        t += dt;
        mdl.position.y = Math.max(0, 30 * (1 - t / T));
        marker.position.y = -mdl.position.y + 0.08;
        g.fx.smokePuff({ x, y: mdl.position.y, z: z - 2 }, 1.2, 0.4);
        if (t >= T) {
          landed = true;
          mdl.position.y = 0;
          marker.visible = false;
          o.active = true;
          g.fx.explosion({ x, y: 0.5, z: z - 2 }, 0.8, 0xc0a080);
          g.audio.explosion();
          g.shake(0.4);
        }
      } else marker.position.y = -mdl.position.y + 0.08;
    };
    return 8;
  }

  /* ------------------------------ traversal ------------------------------ */
  ramp(z: number, lane: number, len: number, h: number) {
    const x = LANE_X[lane];
    return this.g.obstacles.make('ramp', x, z - len / 2, 2.8, len, h, makeRamp(2.8, len, h), {
      walk: true, contact: 'none', ramp: { zStart: z, zEnd: z - len, h0: 0, h1: h }, avoidable: false,
    });
  }

  truckRamp(z: number): number {
    const o = this.g.obstacles;
    const l = Math.floor(Math.random() * 4);
    const x = LANE_X[l];
    this.ramp(z, l, 10, 2.4);
    const zc = z - 14;
    const truck = makeTruck();
    o.make('truck', x, zc, 2.7, 0.1, 0.1, truck, { contact: 'none', hurt: 0, avoidable: false }).spent = true;
    o.make('cargo', x, zc + 0.9, 2.7, 6.2, 2.4, undefined, { walk: true, hurt: 26, heavy: true, label: 'Truck' });
    o.make('cab', x, zc - 3.1, 2.5, 1.9, 1.8, undefined, { walk: true, hurt: 20, heavy: true });
    this.reward(x, 2.4, zc + 1.2, Math.random() < 0.5 ? 'weapon' : undefined);
    return 22;
  }

  /** A landing pad with a parked one-person fighter — run into it to board. */
  shipPad(z: number): number {
    const l0 = Math.random() < 0.5 ? 0 : 1;
    this.g.flight.spawnPad(l0, z - 9);
    this.g.director.lastPadZ = z;
    return 22;
  }

  barricade(z: number): number {
    const g = this.g;
    const o = g.obstacles;
    const open = Math.floor(Math.random() * 4);
    const blocked = [0, 1, 2, 3].filter((l) => l !== open);
    // group contiguous lanes
    const groups: number[][] = [];
    for (const l of blocked) {
      const last = groups[groups.length - 1];
      if (last && last[last.length - 1] === l - 1) last.push(l);
      else groups.push([l]);
    }
    for (const grp of groups) {
      const w = grp.length * 3 - 0.2;
      const ob = o.make('barricade', this.cx(grp), z - 2, w, 1.6, 4.2, makeBarricade(w), { hurt: 35, hp: 150, shootable: true, aim: true, heavy: true });
      void ob;
    }
    this.addCrossing(z - 2, z, z - 4, 'barricade');
    return 12;
  }

  /* --------------------------- gaps & crossings --------------------------- */
  addCrossing(zMid: number, z0: number, z1: number, kind: string, withGantry = true) {
    const o = this.g.obstacles;
    const objs: THREE.Object3D[] = [];
    if (withGantry) {
      const gt = makeGantry(14, 8.6);
      gt.position.z = zMid;
      objs.push(gt);
    }
    for (let i = 0; i < 4; i++) {
      const h = makeHookPoint();
      h.position.set(LANE_X[i], 7.9, zMid + 0.9);
      objs.push(h);
    }
    for (const m of objs) o.group.add(m);
    o.crossings.push({ z0, z1, hookZ: zMid + 0.9, hookY: 7.9, kind, objs });
  }

  gap(z: number, kind: GapKind): number {
    const g = this.g;
    const o = g.obstacles;
    const lanes = this.adjacent(2);
    const gapLen = { rope: 12, zip: 24, bar: 16, plat: 22, grapple: 15 }[kind];
    const rampLen = kind === 'plat' ? 5 : 8;
    const rampH = kind === 'plat' ? 1.2 : 2.0;
    const zs = z - rampLen; // gap start
    const ze = zs - gapLen; // gap end
    for (const l of lanes) this.ramp(z, l, rampLen, rampH);

    // pit visual + collision
    const grp = new THREE.Group();
    grp.add(mesh(PLANE, basic(0x010103), 12.6, gapLen, 1, 0, 0.07, 0).rotateX(-Math.PI / 2));
    grp.add(mesh(PLANE, basic(0xff4a10, { add: true, opacity: 0.32 }), 10, gapLen - 1.5, 1, 0, 0.085, 0).rotateX(-Math.PI / 2));
    for (const s of [-1, 1]) grp.add(box(12.6, 0.35, 0.7, lam(0x2a2c33), 0, 0.12, s * (gapLen / 2)));
    for (let i = 0; i < 12; i++) grp.add(box(1.05, 0.04, 0.5, basic(i % 2 ? 0xffc400 : 0x111111), -6 + i * 1.05 + 0.5, 0.1, gapLen / 2 + 0.6));
    const gp = o.make('gap', 0, zs - gapLen / 2, 12.6, gapLen, 0.1, grp, { gap: true, contact: 'none', avoidable: true });
    gp.onUpdate = (ob) => {
      if (Math.abs(ob.box.z1 - g.player.z) < 140 && Math.random() < 0.5)
        g.fx.flame({ x: rand(-5.5, 5.5), y: 0.1, z: rand(ob.box.z0, ob.box.z1) }, 1.4);
    };

    const mid = zs - gapLen / 2;
    this.addCrossing(kind === 'rope' ? zs - 5.5 : mid, zs, ze, kind, true);

    if (kind === 'rope') {
      for (const l of lanes) g.traversal.addRope(LANE_X[l], zs - 5.5);
    } else if (kind === 'zip') {
      for (const l of lanes) g.traversal.addZip(LANE_X[l], zs + 2, ze - 2, 3.8, 1.9, false);
    } else if (kind === 'bar') {
      for (const l of lanes) g.traversal.addZip(LANE_X[l], zs + 2, ze - 1.5, 3.7, 3.7, true);
    } else if (kind === 'plat') {
      for (const l of lanes) {
        for (let i = 0; i < 3; i++) {
          const pz = zs - 2.5 - i * 7.5; // centre (platform length 5)
          const grp2 = new THREE.Group();
          grp2.add(box(2.8, 0.5, 5, lam(0x59606e, 0x0a0c10), 0, 0.95, 0));
          grp2.add(box(2.9, 0.08, 5.1, basic(0x40e0ff), 0, 1.22, 0));
          for (const s of [-1, 1]) grp2.add(box(0.06, 3.2, 0.06, lam(0x30343c), s * 1.2, 2.8, 0));
          o.make('platform', LANE_X[l], pz, 2.8, 5, 1.2, grp2, { walk: true, hurt: 22, heavy: true, label: 'Platform' });
          if (i === 1 && l === lanes[0] && Math.random() < 0.8) this.reward(LANE_X[l], 1.2, pz);
        }
      }
      // platform 1 starts exactly where the ramp ends
    }
    return rampLen + gapLen + 14;
  }

  /* ---------------------------- pattern picker ---------------------------- */
  gapKinds: GapKind[] = ['rope', 'zip', 'bar', 'plat', 'grapple'];
}

void WEAPONS;
void WEAPON_ORDER;
void glowMat;
