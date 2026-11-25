import * as THREE from 'three';
import type { Game } from './game';
import { AIR_WEAPONS, CHARACTERS, LANE_X, OUTFITS, type AirWeaponDef, type AirWeaponId } from './config';
import { basic, BOX, glowMat, glowSprite, makePickup, mesh, PICKUP_COLOR, SPH, type PickupKind } from './models';
import {
  makeAirEnemy, makeBossShip, makeFighter, makeParachute, makeRing3D, makeShipPad, type AirType, type BossRig, type FighterRig, type PadRig,
} from './airmodels';
import { store } from './progress';
import { boxOverlap, clamp, damp, newBox, rand, segBox, setBox, type Box, type V3 } from './util';

/* ----------------------------------------------------------------------------
 * Aerial spacecraft combat.
 *
 * Fully separate from the ground runner: own camera, own physics, own health,
 * own controls. World z keeps advancing so distance, time and the city below
 * stay consistent; the four-lane system is not used in the air at all.
 * -------------------------------------------------------------------------- */
export const ALT = 125;
export const Y_MIN = 98;
export const Y_MAX = 158;
export const X_LIM = 30;
export const AIR_SPEED = 34;
const ease = (t: number) => {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};

interface AT {
  dead: boolean;
  box: Box;
  kind: 'enemy' | 'boss' | 'missile';
  hurt(d: number, p: V3, tag?: string): void;
}
export interface Pad {
  x: number;
  z: number;
  rig: PadRig;
  t: number;
}
type Phase = 'launch' | 'fly' | 'eject' | 'victory' | 'descend' | 'dead' | 'done';

export interface AirHud {
  hull: number;
  stage: number;
  shield: number;
  energy: number;
  missiles: number;
  missileCap: number;
  weapon: { id: AirWeaponId; name: string; temp: boolean; tempLeft: number };
  weapons: { id: AirWeaponId; name: string; active: boolean }[];
  charge: number;
  phase: string;
  meltdown: number;
  ejectArmed: boolean;
  ejectPrompt: boolean;
  boss: { name: string; hp: number; sections: { name: string; alive: boolean }[] } | null;
  warn: string;
  barrage: boolean;
  altitude: number;
  enemies: number;
  training: boolean;
  controllable: boolean;
}

/* ------------------------------ enemy craft ------------------------------ */
const EDEF: Record<AirType, { hp: number; hw: number; hh: number; hl: number; score: number; bucks: number; name: string; scale: number }> = {
  interceptor: { hp: 28, hw: 2.4, hh: 0.9, hl: 2.4, score: 150, bucks: 3, name: 'Interceptor', scale: 1 },
  gunship: { hp: 60, hw: 3.4, hh: 1.2, hl: 2.8, score: 220, bucks: 6, name: 'Gunship', scale: 1 },
  kamikaze: { hp: 18, hw: 1.7, hh: 1.7, hl: 1.7, score: 120, bucks: 2, name: 'Kamikaze Drone', scale: 1 },
  heavy: { hp: 190, hw: 4.6, hh: 2.0, hl: 4.4, score: 450, bucks: 15, name: 'Heavy Fighter', scale: 1.35 },
  elite: { hp: 110, hw: 2.8, hh: 1.0, hl: 2.8, score: 600, bucks: 20, name: 'Elite Fighter', scale: 1.1 },
  target: { hp: 20, hw: 4.2, hh: 4.2, hl: 0.6, score: 50, bucks: 0, name: 'Target Drone', scale: 1 },
};

class AirEnemy implements AT {
  kind = 'enemy' as const;
  dead = false;
  box: Box = newBox();
  type: AirType;
  hp: number;
  maxHp: number;
  holder = new THREE.Group();
  model: THREE.Group;
  lights: THREE.MeshBasicMaterial[];
  lightBase: number[];
  x: number;
  y: number;
  rel: number;
  vx = 0;
  vy = 0;
  vrel = 0;
  t = Math.random() * 6;
  life = 0;
  fireT = 1 + Math.random();
  dashT = 1.5;
  burst = 0;
  mode = 0;
  dir = 1;
  hold = 70;
  flash = 0;
  ph = Math.random() * 6.28;
  private f: Flight;
  constructor(f: Flight, type: AirType, x: number, y: number, rel: number) {
    this.f = f;
    this.type = type;
    this.x = x;
    this.y = y;
    this.rel = rel;
    this.hp = this.maxHp = EDEF[type].hp;
    const m = makeAirEnemy(type);
    this.model = m.group;
    this.lights = m.lights;
    this.lightBase = m.lights.map((l) => l.color.getHex());
    this.model.rotation.y = Math.PI;
    this.holder.add(this.model);
    this.holder.scale.setScalar(EDEF[type].scale);
  }
  hurt(d: number, p: V3, _tag?: string) {
    void _tag;
    if (this.dead) return;
    this.hp -= d;
    this.flash = 0.1;
    this.f.g.fx.sparks(p, 0xffc080, 3, 6, 0.35);
    if (this.hp <= 0) this.f.killEnemy(this);
  }
}

/* ------------------------------- projectiles ------------------------------ */
interface PBolt {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  dmg: number;
  life: number;
  pierce: number;
  splash: number;
  color: number;
  kind: 'laser' | 'plasma' | 'charge' | 'missile';
  hit: Set<AT>;
  target: AT | null;
}
interface EProj {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  dmg: number;
  life: number;
  kind: 'bolt' | 'missile';
  color: number;
  pad: number;
  at: (AT & { hp: number }) | null;
}
interface AirPick {
  group: THREE.Group;
  item: THREE.Group;
  kind: PickupKind;
  x: number;
  y: number;
  z: number;
  t: number;
}
interface Debris {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}
interface Ring {
  x: number;
  y: number;
  z: number;
  r: number;
  mesh: THREE.Mesh;
  state: 0 | 1 | 2;
}
interface Sec {
  name: string;
  hp: number;
  max: number;
  alive: boolean;
  local: V3;
  half: V3;
  obj: THREE.Object3D;
  bonus: number;
  at: AT;
}
interface BossState {
  rig: BossRig;
  lightBase: number[];
  x: number;
  y: number;
  rel: number;
  hp: number;
  maxHp: number;
  t: number;
  dying: boolean;
  dyT: number;
  sections: Sec[];
  hull: AT;
  hullBox: Box;
  fanT: number;
  wallT: number;
  msT: number;
  depT: number;
  flankT: number;
  passive: boolean;
  flash: number;
}

const _m = new THREE.Vector3();
const _d = new THREE.Vector3();
const _v = new THREE.Vector3();

export class Flight {
  g: Game;
  group = new THREE.Group();
  padGroup = new THREE.Group();
  pads: Pad[] = [];
  active = false;
  training = false;
  allowDamage = false;
  phase: Phase = 'done';
  t = 0;
  // ship
  rig: FighterRig | null = null;
  x = 0;
  y = ALT;
  z = 0;
  tx = 0;
  ty = ALT;
  vx = 0;
  vy = 0;
  roll = 0;
  pitch = 0;
  speed = AIR_SPEED;
  prevZ = 0;
  pbox: Box = newBox();
  // vitals
  hull = 100;
  shield = 0;
  energy = 100;
  missiles = 4;
  missileCap = 4;
  invuln = 0;
  meltdownT = 0;
  ejectArm = 0;
  stage = 0;
  weapon: AirWeaponId = 'laser';
  tempWeapon: AirWeaponId | null = null;
  tempT = 0;
  fireHeld = false;
  tapT = 0;
  cd = 0;
  cdM = 0;
  charge = 0;
  alt = 0;
  mAlt = 0;
  // run counters (also read by the tutorial)
  kills = 0;
  ringsPassed = 0;
  ringsMissed = 0;
  ejected = false;
  landed = false;
  bossDown = false;
  // world objects
  enemies: AirEnemy[] = [];
  bolts: PBolt[] = [];
  eprojs: EProj[] = [];
  pickups: AirPick[] = [];
  debris: Debris[] = [];
  rings: Ring[] = [];
  boss: BossState | null = null;
  // phases / timers
  warnT = 0;
  barrageT = 0;
  alarmT = 0;
  sparkT = 0;
  pkT = 6;
  victoryT = 0;
  descT = 0;
  descY0 = 0;
  ejT = 0;
  pilot: THREE.Object3D | null = null;
  pilotVel = new THREE.Vector3();
  chute: THREE.Group | null = null;
  pilotLaunched = false;
  shipGone = false;
  finT = 0;
  detached = { finL: false, wingtipR: false };
  flameBase: number[] = [];
  private tcache: AT[] = [];
  private cam = new THREE.Vector3();
  private camInit = false;
  private frame = 0;

  constructor(g: Game) {
    this.g = g;
    g.scene.add(this.group, this.padGroup);
  }

  /* ------------------------------- helpers ------------------------------- */
  private look() {
    const ch = store.character();
    const of = OUTFITS.find((o) => o.id === store.save.eq.outfit) ?? OUTFITS[0];
    void CHARACTERS;
    return {
      suit: of.suit >= 0 ? of.suit : ch.suit,
      accent: of.accent >= 0 ? of.accent : ch.accent,
      skin: ch.skin,
      paint: store.owns('fw_phantom') ? 0x5b3fb0 : undefined,
    };
  }
  available(): AirWeaponDef[] {
    return AIR_WEAPONS.filter((w) => !w.unlock || store.owns(w.unlock) || this.tempWeapon === w.id);
  }
  get controllable() {
    return this.phase === 'fly' || this.phase === 'victory';
  }
  private liveEnemies() {
    let n = 0;
    for (const e of this.enemies) if (!e.dead && e.type !== 'target') n++;
    return n;
  }

  /* ------------------------------ landing pads ----------------------------- */
  spawnPad(l0: number, z: number) {
    const rig = makeShipPad(this.look());
    const cx = (LANE_X[l0] + LANE_X[l0 + 2]) / 2;
    rig.group.position.set(cx, 0, z);
    this.padGroup.add(rig.group);
    this.pads.push({ x: cx, z, rig, t: Math.random() * 6 });
    // reserves the space so pickups / obstacles are never placed on the pad
    this.g.obstacles.make('pad', cx, z, 9.6, 12.8, 0.4, undefined, { contact: 'none', avoidable: false });
  }
  padPrompt(): string {
    const p = this.g.player;
    for (const pad of this.pads) {
      const d = p.z - pad.z;
      if (d > -4 && d < 26 && Math.abs(p.x - pad.x) < 5.2) return 'RUN INTO THE FIGHTER TO BOARD';
    }
    return '';
  }
  clearPads() {
    for (const p of this.pads) this.padGroup.remove(p.rig.group);
    this.pads.length = 0;
  }
  updatePads(dt: number) {
    const g = this.g;
    const p = g.player;
    for (let i = this.pads.length - 1; i >= 0; i--) {
      const pad = this.pads[i];
      pad.t += dt;
      pad.rig.marker.rotation.y = pad.t * 2.2;
      pad.rig.marker.position.y = 4.8 + Math.sin(pad.t * 3) * 0.35;
      pad.rig.ship.flames.forEach((f, k) => (f.scale.y = (k % 2 ? 1.5 : 2.4) * (0.35 + 0.12 * Math.sin(pad.t * 14 + k))));
      if (pad.z > p.z + 40) {
        this.padGroup.remove(pad.rig.group);
        this.pads.splice(i, 1);
        continue;
      }
      if (this.active || p.state !== 'run') continue;
      if (Math.abs(p.x - pad.x) < 4.7 && p.z < pad.z + 3.3 && p.z > pad.z - 7 && p.y < 3) {
        g.enterAir(pad);
        return;
      }
    }
  }

  /* -------------------------------- lifecycle ------------------------------- */
  reset() {
    this.active = false;
    this.phase = 'done';
    if (this.rig) this.group.remove(this.rig.group);
    this.rig = null;
    for (const e of this.enemies) this.group.remove(e.holder);
    for (const b of this.bolts) this.group.remove(b.mesh);
    for (const p of this.eprojs) this.group.remove(p.mesh);
    for (const p of this.pickups) this.group.remove(p.group);
    for (const d of this.debris) this.group.remove(d.mesh);
    for (const r of this.rings) this.group.remove(r.mesh);
    if (this.boss) this.group.remove(this.boss.rig.group);
    if (this.pilot) this.group.remove(this.pilot);
    if (this.chute) this.group.remove(this.chute);
    this.enemies.length = 0;
    this.bolts.length = 0;
    this.eprojs.length = 0;
    this.pickups.length = 0;
    this.debris.length = 0;
    this.rings.length = 0;
    this.boss = null;
    this.pilot = null;
    this.chute = null;
    this.fireHeld = false;
    this.g.world.fogTarget = 1;
    this.g.world.lookAhead = 2;
    this.g.camera.up.set(0, 1, 0);
  }

  begin(pad: Pad | null, training = false) {
    const g = this.g;
    const p = g.player;
    this.reset();
    this.active = true;
    this.training = training;
    this.allowDamage = false;
    this.phase = 'launch';
    this.t = 0;
    this.rig = makeFighter(this.look());
    this.rig.group.scale.setScalar(1);
    this.group.add(this.rig.group);
    this.flameBase = this.rig.flames.map((f) => f.scale.y);
    this.x = pad ? pad.x : p.x;
    this.y = 1.35;
    this.z = pad ? pad.z + 0.4 : p.z;
    this.prevZ = this.z;
    this.tx = this.x;
    this.ty = ALT;
    this.vx = this.vy = 0;
    this.roll = this.pitch = 0;
    this.speed = 12;
    this.hull = 100;
    this.shield = 0;
    this.energy = 100;
    this.missileCap = store.owns('fw_missiles') ? 8 : 4;
    this.missiles = this.missileCap;
    this.weapon = 'laser';
    this.tempWeapon = null;
    this.tempT = 0;
    this.meltdownT = 0;
    this.ejectArm = 0;
    this.stage = 0;
    this.invuln = 1;
    this.cd = this.cdM = this.charge = 0;
    this.kills = this.ringsPassed = this.ringsMissed = 0;
    this.ejected = this.landed = this.bossDown = false;
    this.detached = { finL: false, wingtipR: false };
    this.shipGone = false;
    this.pilotLaunched = false;
    this.pkT = 7;
    this.warnT = this.barrageT = 0;
    this.camInit = false;
    this.cam.copy(g.camera.position);
    if (pad) {
      pad.rig.ship.group.visible = false; // the parked fighter becomes the flying one
    }
    p.root.visible = false;
    g.world.fogTarget = 0.3;
    g.world.lookAhead = 3;
    g.stats.flights++;
    g.audio.grapple();
    g.audio.swoosh();
    g.banner('LAUNCH!', '#40ffe0', 2.4);
    g.toast(training ? 'Training flight — no damage' : 'Spacecraft online — destroy the mothership!', 'good');
  }

  /* --------------------------------- input -------------------------------- */
  steer(dx: number, dy: number) {
    if (!this.controllable) return;
    this.tx = clamp(this.tx + dx * 0.1, -X_LIM, X_LIM);
    this.ty = clamp(this.ty - dy * 0.085, Y_MIN, Y_MAX);
  }
  setFire(on: boolean) {
    this.fireHeld = on && this.controllable;
  }
  tapFire() {
    if (this.controllable) this.tapT = 0.3;
  }
  cycleWeapon() {
    const list = this.available();
    if (list.length < 2) return;
    const i = list.findIndex((w) => w.id === this.weapon);
    this.weapon = list[(i + 1) % list.length].id;
    this.charge = 0;
    this.g.audio.reload();
  }
  pressEject() {
    if (!this.active || (this.phase !== 'fly' && this.phase !== 'victory')) return;
    if (this.hull <= 30 || this.meltdownT > 0 || this.ejectArm > 0 || this.phase === 'victory') {
      this.startEject();
    } else {
      this.ejectArm = 2.4;
      this.g.toast('Tap EJECT again to confirm', 'bad');
    }
  }
  revive() {
    if (!this.rig) return;
    this.hull = 60;
    this.meltdownT = 0;
    this.invuln = 3;
    this.phase = 'fly';
    this.rig.group.visible = true;
    this.shipGone = false;
    this.updateStage(true);
  }

  /* ------------------------------ training API ------------------------------ */
  setHull(v: number) {
    this.hull = clamp(v, 0, 100);
    this.meltdownT = 0;
    this.updateStage(true);
  }
  spawnRings(list: { x: number; y: number; rel: number }[]) {
    for (const r of this.rings) this.group.remove(r.mesh);
    this.rings.length = 0;
    for (const s of list) {
      const m = makeRing3D(6.5, 0x40ffe0);
      m.position.set(s.x, s.y, this.z - s.rel);
      this.group.add(m);
      this.rings.push({ x: s.x, y: s.y, z: this.z - s.rel, r: 6.5, mesh: m, state: 0 });
    }
  }
  clearTraining() {
    for (const e of this.enemies) this.group.remove(e.holder);
    this.enemies.length = 0;
    for (const r of this.rings) this.group.remove(r.mesh);
    this.rings.length = 0;
    for (const p of this.pickups) this.group.remove(p.group);
    this.pickups.length = 0;
    for (const p of this.eprojs) this.group.remove(p.mesh);
    this.eprojs.length = 0;
  }
  spawnEnemy(type: AirType, x: number, y: number, rel: number, hold?: number): AirEnemy {
    const e = new AirEnemy(this, type, clamp(x, -70, 70), y, rel);
    if (hold !== undefined) e.hold = hold;
    this.enemies.push(e);
    this.group.add(e.holder);
    return e;
  }
  spawnPickup(kind: PickupKind, x: number, y: number, z: number) {
    const { group, item } = makePickup(kind, undefined, 1, true);
    group.position.set(x, y, z);
    this.group.add(group);
    this.pickups.push({ group, item, kind, x, y, z, t: Math.random() * 6 });
  }

  /* ------------------------------ mothership ------------------------------ */
  spawnBoss(opts: { hp?: number; passive?: boolean } = {}) {
    if (this.boss) return;
    const rig = makeBossShip();
    this.group.add(rig.group);
    const maxHp = opts.hp ?? 2600 + 400 * Math.min(3, store.save.totals.mothers);
    const sc = maxHp / 2600;
    const mk = (name: string, max: number, lx: number, ly: number, lz: number, hx: number, hy: number, hz: number, bonus: number, obj: THREE.Object3D): Sec => {
      const sec: Sec = {
        name, hp: max * sc, max: max * sc, alive: true, local: { x: lx, y: ly, z: lz }, half: { x: hx, y: hy, z: hz }, obj, bonus: bonus * sc,
        at: { dead: false, box: newBox(), kind: 'boss', hurt: (d, p) => this.hurtBoss(d, sec, p) },
      };
      return sec;
    };
    const parts = rig.parts;
    const sections = [
      mk('engineL', 320, -27, 0, 46, 8, 8, 9, 260, parts.engineL),
      mk('engineR', 320, 27, 0, 46, 8, 8, 9, 260, parts.engineR),
      mk('turretL', 260, -17, 10.5, 24, 5, 4, 6, 200, parts.turretL),
      mk('turretR', 260, 17, 10.5, 24, 5, 4, 6, 200, parts.turretR),
      mk('core', 420, 0, 1.5, 51, 7, 5, 3, 420, parts.core),
    ];
    const hullBox = newBox();
    const b: BossState = {
      rig, lightBase: rig.lights.map((l) => l.color.getHex()), x: 0, y: ALT + 9, rel: 260, hp: maxHp, maxHp, t: 0, dying: false, dyT: 0, sections,
      hull: { dead: false, box: hullBox, kind: 'boss', hurt: (d, p) => this.hurtBoss(d, null, p) }, hullBox,
      fanT: 3, wallT: 7, msT: 9, depT: 4, flankT: 6, passive: !!opts.passive, flash: 0,
    };
    this.boss = b;
    this.g.audio.screech();
    this.g.banner('ALIEN MOTHERSHIP', '#ff4d6d', 3);
  }

  private hurtBoss(dmg: number, sec: Sec | null, p: V3) {
    const b = this.boss;
    if (!b || b.dying) return;
    const g = this.g;
    g.stats.motherDmg += dmg;
    b.flash = 0.08;
    g.fx.sparks(p, 0xffb060, 3, 9, 0.5);
    if (sec) {
      sec.hp -= dmg;
      b.hp -= dmg * 0.5 * (sec.name === 'core' ? 1.8 : 1);
      if (sec.hp <= 0) this.destroySection(sec);
    } else b.hp -= dmg * 0.85;
    if (b.hp <= 0) this.startBossDeath();
  }
  private bossWorld(b: BossState, l: V3): V3 {
    return { x: b.x + l.x, y: b.y + l.y, z: this.z - b.rel + l.z };
  }
  private destroySection(sec: Sec) {
    const b = this.boss!;
    const g = this.g;
    sec.alive = false;
    sec.at.dead = true;
    sec.obj.visible = false;
    b.hp -= sec.bonus;
    const w = this.bossWorld(b, sec.local);
    g.fx.explosion(w, 3, 0xff8a30);
    g.fx.explosion({ x: w.x + 3, y: w.y + 2, z: w.z + 2 }, 2, 0xff4060);
    g.audio.explosion(true);
    g.shake(0.9);
    g.addScore(400);
    g.toast(`${sec.name.startsWith('engine') ? 'Engine' : sec.name.startsWith('turret') ? 'Turret' : 'Reactor core'} destroyed!`, 'good');
    for (let i = 0; i < 5; i++) this.debrisAt(w, 0x2b3042, 2.5);
  }
  private startBossDeath() {
    const b = this.boss!;
    const g = this.g;
    b.dying = true;
    b.dyT = 0;
    g.audio.explosion(true);
    g.banner('MOTHERSHIP CRITICAL!', '#ffd54f', 2.5);
    for (const e of this.enemies) if (!e.dead) this.killEnemy(e, true);
    for (const p of this.eprojs) this.group.remove(p.mesh);
    this.eprojs.length = 0;
  }

  /* ------------------------------ pickups / drops ----------------------------- */
  private dropKind(): PickupKind {
    const hurt = this.hull < 60;
    const w: [PickupKind, number][] = [
      ['health', hurt ? 40 : 14], ['energy', this.energy < 50 ? 30 : 16], ['missile', this.missiles < 2 ? 28 : 14], ['shield', 10], ['special', 8], ['buck', 18],
    ];
    let tot = 0;
    for (const [, x] of w) tot += x;
    let r = Math.random() * tot;
    for (const [k, x] of w) {
      r -= x;
      if (r <= 0) return k;
    }
    return 'buck';
  }
  private collect(k: AirPick) {
    const g = this.g;
    let msg = '';
    switch (k.kind) {
      case 'health':
        this.hull = Math.min(100, this.hull + 30);
        if (this.hull > 0) this.meltdownT = 0;
        this.updateStage(true);
        msg = '+30 HULL — repaired';
        break;
      case 'energy':
        this.energy = Math.min(100, this.energy + 55);
        msg = '+55 laser energy';
        break;
      case 'missile':
        this.missiles = Math.min(this.missileCap, this.missiles + 2);
        msg = '+2 homing missiles';
        break;
      case 'shield':
        this.shield = 40;
        msg = 'Energy shield online';
        break;
      case 'special': {
        const pool = AIR_WEAPONS.filter((w) => w.id !== 'laser' && !(w.unlock && store.owns(w.unlock)));
        const w = (pool.length ? pool : AIR_WEAPONS.filter((x) => x.id === 'plasma'))[Math.floor(Math.random() * Math.max(1, pool.length))];
        this.tempWeapon = w.id;
        this.tempT = 25;
        this.weapon = w.id;
        msg = `WEAPON UPGRADE: ${w.name} (25s)`;
        break;
      }
      default:
        if (!g.training) store.addBucks(25);
        msg = g.training ? '+25 Alien Bucks (practice)' : '+25 ALIEN BUCKS';
    }
    g.addScore(25);
    g.stats.pickups++;
    g.toast(msg, 'pickup', PICKUP_COLOR[k.kind]);
    g.audio.pickup(k.kind);
    g.fx.ring({ x: k.x, y: k.y, z: k.z }, PICKUP_COLOR[k.kind], 5);
    g.fx.sparks({ x: k.x, y: k.y, z: k.z }, PICKUP_COLOR[k.kind], 10, 8, 0.4);
  }

  /* -------------------------------- damage -------------------------------- */
  hit(raw: number) {
    const g = this.g;
    if (this.phase !== 'fly' && this.phase !== 'launch') return;
    if (this.invuln > 0) return;
    if (this.training && !this.allowDamage) {
      g.trainingHit();
      this.invuln = 0.6;
      return;
    }
    let d = raw * (store.owns('fw_hull') ? 0.8 : 1);
    if (this.shield > 0) {
      const a = Math.min(this.shield, d);
      this.shield -= a;
      d -= a;
      g.fx.ring({ x: this.x, y: this.y, z: this.z }, 0x7df9ff, 7);
      g.audio.hit();
    }
    if (d <= 0) {
      this.invuln = 0.15;
      return;
    }
    this.hull = Math.max(0, this.hull - d);
    this.invuln = 0.3;
    g.damageFlash = 1;
    g.shake(0.6);
    g.audio.hurt();
    this.updateStage(false);
    if (this.hull <= 0 && this.meltdownT <= 0 && this.phase === 'fly') {
      this.meltdownT = 5.5;
      g.audio.alert();
    }
  }
  updateStage(silent: boolean) {
    const g = this.g;
    const h = this.hull;
    const st = h <= 0 ? 4 : h > 75 ? 0 : h > 50 ? 1 : h > 30 ? 2 : h > 15 ? 3 : 4;
    const was = this.stage;
    this.stage = st;
    if (!silent && st > was) {
      const msg = ['', 'Minor damage — sparks from the wings', 'Hull damaged — smoke trailing', 'CRITICAL DAMAGE — be ready to EJECT', 'EJECT NOW — hull failing!'][st];
      g.toast(msg, st >= 3 ? 'bad' : 'info');
    }
    // exterior damage that persists until repaired
    const rig = this.rig;
    if (!rig) return;
    const k = 1 - Math.min(0.55, ((100 - h) / 100) * 0.7);
    rig.bodyMat.color.setRGB(rig.baseColor.r * k, rig.baseColor.g * k, rig.baseColor.b * k);
    const fin = rig.parts.finL;
    const tip = rig.parts.wingtipR;
    if (st >= 2 && !this.detached.finL) {
      this.detached.finL = true;
      fin.visible = false;
      this.debrisAt(this.shipPoint(-0.8, 0.75, 2.5), 0x8f98a8, 1.4);
    } else if (st < 2 && this.detached.finL) {
      this.detached.finL = false;
      fin.visible = true;
    }
    if (st >= 3 && !this.detached.wingtipR) {
      this.detached.wingtipR = true;
      tip.visible = false;
      this.debrisAt(this.shipPoint(4.4, 0.3, 1.55), 0xffa000, 1.4);
    } else if (st < 3 && this.detached.wingtipR) {
      this.detached.wingtipR = false;
      tip.visible = true;
    }
  }
  private shipPoint(lx: number, ly: number, lz: number): V3 {
    return { x: this.x + lx, y: this.y + ly, z: this.z + lz };
  }
  private debrisAt(p: V3, color: number, size: number) {
    if (this.debris.length > 60) return;
    const m = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ color }));
    m.scale.set(size * rand(0.5, 1.1), size * rand(0.2, 0.5), size * rand(0.5, 1.4));
    m.position.set(p.x, p.y, p.z);
    this.group.add(m);
    this.debris.push({
      mesh: m, vel: new THREE.Vector3(rand(-9, 9), rand(2, 10), rand(-6, 10)), spin: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), life: 2.4,
    });
  }

  /* ---------------------------- enemy bolts / kills --------------------------- */
  killEnemy(e: AirEnemy, silent = false) {
    if (e.dead) return;
    const g = this.g;
    e.dead = true;
    this.group.remove(e.holder);
    const pos = { x: e.x, y: e.y, z: this.z - e.rel };
    g.fx.explosion(pos, e.type === 'heavy' ? 1.5 : 0.85, 0xff8a30);
    if (!silent) {
      g.audio.explosion(e.type === 'heavy');
      g.shake(e.type === 'heavy' ? 0.5 : 0.2);
      const d = EDEF[e.type];
      g.stats.kills++;
      g.stats.airKills++;
      this.kills++;
      g.addScore(d.score);
      if (!g.training && d.bucks > 0) store.addBucks(d.bucks);
      if (!g.training && e.type !== 'target' && e.rel > 16 && Math.random() < (e.type === 'heavy' || e.type === 'elite' ? 0.6 : 0.24)) {
        this.spawnPickup(this.dropKind(), e.x, e.y, pos.z);
      }
    }
  }
  private enemyBolt(ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, speed: number, dmg: number, color: number, size = 0.5, pad = 0.3) {
    if (this.eprojs.length > 90) return;
    const dir = _v.set(tx - ox, ty - oy, tz - oz).normalize();
    const m = new THREE.Group();
    m.add(mesh(SPH, basic(0xffffff), size * 0.7, size * 0.7, size * 0.7), mesh(SPH, glowMat(color, 0.85), size * 2.8, size * 2.8, size * 2.8));
    m.position.set(ox, oy, oz);
    this.group.add(m);
    this.eprojs.push({
      mesh: m, pos: new THREE.Vector3(ox, oy, oz), prev: new THREE.Vector3(ox, oy, oz), vel: dir.clone().multiplyScalar(speed), dmg, life: 7, kind: 'bolt', color, pad, at: null,
    });
  }
  private enemyFire(e: AirEnemy, speed: number, dmg: number, color: number, size: number, spreadX = 0, spreadY = 0) {
    const oz = this.z - e.rel;
    const dist = Math.hypot(this.x - e.x, this.y - e.y, this.z - oz);
    const t = dist / speed;
    this.enemyBolt(e.x, e.y, oz, this.x + this.vx * t * 0.4 + spreadX, this.y + this.vy * t * 0.4 + spreadY, this.z - AIR_SPEED * t, speed, dmg, color, size);
    this.g.audio.tone(e.type === 'heavy' ? 180 : 520, 0.1, 'sawtooth', 0.04, 160);
  }
  private launchMissile(ox: number, oy: number, oz: number) {
    if (this.eprojs.length > 90) return;
    const m = new THREE.Group();
    m.add(mesh(BOX, basic(0xb0b0b8), 0.9, 0.9, 3.2), mesh(SPH, glowMat(0xff5a2a, 0.9), 2.2, 2.2, 2.2, 0, 0, 1.6));
    m.position.set(ox, oy, oz);
    this.group.add(m);
    const at: AT & { hp: number } = { dead: false, box: newBox(), kind: 'missile', hp: 14, hurt: (d, p) => {
      at.hp -= d;
      this.g.fx.sparks(p, 0xffc080, 3, 6, 0.4);
      if (at.hp <= 0) at.dead = true;
    } };
    this.eprojs.push({
      mesh: m, pos: new THREE.Vector3(ox, oy, oz), prev: new THREE.Vector3(ox, oy, oz), vel: new THREE.Vector3(0, -2, 26), dmg: 18, life: 9, kind: 'missile', color: 0xff5a2a, pad: 0.4, at,
    });
    this.g.audio.tone(260, 0.3, 'sawtooth', 0.06, 90);
  }

  /* ------------------------------ player weapons ------------------------------ */
  private targets(): AT[] {
    const out = this.tcache;
    out.length = 0;
    for (const e of this.enemies) if (!e.dead) out.push(e);
    const b = this.boss;
    if (b && !b.dying) {
      for (const s of b.sections) if (s.alive) out.push(s.at);
      out.push(b.hull);
    }
    for (const p of this.eprojs) if (p.at && !p.at.dead) out.push(p.at);
    return out;
  }
  private aimDir(origin: THREE.Vector3, out: THREE.Vector3, maxAng = 0.085, bend = 0.6) {
    let best: AT | null = null;
    let ba = maxAng;
    for (const t of this.targets()) {
      if (this.boss && t === this.boss.hull) continue;
      const cx = (t.box.x0 + t.box.x1) / 2;
      const cy = (t.box.y0 + t.box.y1) / 2;
      const cz = (t.box.z0 + t.box.z1) / 2;
      const dz = origin.z - cz;
      if (dz < 6) continue;
      const ang = Math.hypot(cx - origin.x, cy - origin.y) / dz;
      if (ang < ba) {
        ba = ang;
        best = t;
      }
    }
    out.set(0, 0, -1);
    if (best) {
      const cx = (best.box.x0 + best.box.x1) / 2 - origin.x;
      const cy = (best.box.y0 + best.box.y1) / 2 - origin.y;
      const cz = (best.box.z0 + best.box.z1) / 2 - origin.z;
      _v.set(cx, cy, cz).normalize();
      out.lerp(_v, bend).normalize();
    }
  }
  private spawnBolt(def: AirWeaponDef, origin: THREE.Vector3, dir: THREE.Vector3, power: number) {
    if (this.bolts.length > 90) return;
    const kind: PBolt['kind'] = def.id === 'plasma' ? 'plasma' : def.id === 'charge' ? 'charge' : 'laser';
    const vel = dir.clone().multiplyScalar(def.speed);
    vel.z -= AIR_SPEED;
    let m: THREE.Object3D;
    if (kind === 'plasma') {
      m = new THREE.Group();
      m.add(mesh(SPH, basic(0xffffff), 0.9, 0.9, 0.9), mesh(SPH, glowMat(def.color, 0.7), 2.8, 2.8, 2.8));
    } else if (kind === 'charge') {
      const s = 0.8 + power * 1.6;
      m = new THREE.Group();
      m.add(mesh(SPH, basic(0xffffff), s, s, s * 3.5), mesh(SPH, glowMat(def.color, 0.65), s * 3, s * 3, s * 8));
    } else m = mesh(BOX, basic(def.color), 0.17, 0.17, def.id === 'rapid' ? 2.2 : 3.2);
    m.position.copy(origin);
    m.lookAt(origin.x + vel.x, origin.y + vel.y, origin.z + vel.z);
    this.group.add(m);
    this.bolts.push({
      mesh: m, pos: origin.clone(), prev: origin.clone(), vel, dmg: def.dmg * (kind === 'charge' ? 0.15 + power * 0.85 : 1), life: 1.6,
      pierce: kind === 'charge' ? 6 : 1, splash: def.splash, color: def.color, kind, hit: new Set(), target: null,
    });
  }
  private fire() {
    const def = AIR_WEAPONS.find((w) => w.id === this.weapon)!;
    const rig = this.rig!;
    rig.group.updateMatrixWorld(true);
    const idx = def.id === 'dual' ? [0, 1] : [this.alt++ % 2];
    for (const i of idx) {
      rig.muzzles[i].getWorldPosition(_m);
      this.aimDir(_m, _d);
      this.spawnBolt(def, _m, _d, 1);
      this.g.fx.muzzle({ x: _m.x, y: _m.y, z: _m.z }, def.color, def.id === 'plasma' ? 1.8 : 1);
    }
    this.cd = 1 / def.rate;
    this.energy = Math.max(0, this.energy - def.energy);
    const A = this.g.audio;
    if (def.id === 'plasma') A.tone(320, 0.2, 'sine', 0.09, 110);
    else if (def.id === 'rapid') A.tone(1300, 0.035, 'square', 0.022, 700);
    else A.tone(900 + Math.random() * 80, 0.06, 'square', 0.03, 380);
  }
  private fireCharged(frac: number) {
    const def = AIR_WEAPONS.find((w) => w.id === 'charge')!;
    const rig = this.rig!;
    rig.group.updateMatrixWorld(true);
    rig.muzzles[2].getWorldPosition(_m);
    this.aimDir(_m, _d, 0.1, 0.7);
    this.spawnBolt(def, _m, _d, frac);
    this.g.fx.muzzle({ x: _m.x, y: _m.y, z: _m.z }, def.color, 2.4);
    this.g.fx.flash({ x: _m.x, y: _m.y, z: _m.z }, def.color, 18);
    this.energy = Math.max(0, this.energy - def.energy * frac);
    this.cd = 0.5;
    this.g.shake(0.25 + frac * 0.4);
    this.g.audio.noise(0.4, 0.2, 3000, 200, 'lowpass');
    this.g.audio.tone(140, 0.4, 'sawtooth', 0.12, 50);
  }
  fireMissile() {
    if (!this.controllable || this.cdM > 0) return;
    if (this.missiles <= 0) {
      this.g.toast('No missiles — find a missile pack', 'bad');
      return;
    }
    const rig = this.rig!;
    rig.group.updateMatrixWorld(true);
    rig.pylons[this.mAlt++ % 2].getWorldPosition(_m);
    let best: AT | null = null;
    let ba = 0.42;
    for (const t of this.targets()) {
      const cx = (t.box.x0 + t.box.x1) / 2;
      const cy = (t.box.y0 + t.box.y1) / 2;
      const cz = (t.box.z0 + t.box.z1) / 2;
      const dz = _m.z - cz;
      if (dz < 8) continue;
      const ang = Math.hypot(cx - _m.x, cy - _m.y) / dz + (t === this.boss?.hull ? 0.2 : 0);
      if (ang < ba) {
        ba = ang;
        best = t;
      }
    }
    this.missiles--;
    this.cdM = 0.6;
    const m = new THREE.Group();
    m.add(mesh(BOX, basic(0xcfd2d8), 0.4, 0.4, 2.0), mesh(SPH, glowMat(0xff8a30, 0.9), 1.4, 1.4, 1.8, 0, 0, 1.1));
    m.position.copy(_m);
    this.group.add(m);
    this.bolts.push({
      mesh: m, pos: _m.clone(), prev: _m.clone(), vel: new THREE.Vector3(0, -1, -(AIR_SPEED + 60)), dmg: 130, life: 5, pierce: 1, splash: 9, color: 0xff8a30,
      kind: 'missile', hit: new Set(), target: best,
    });
    this.g.audio.tone(200, 0.45, 'sawtooth', 0.09, 70);
    this.g.audio.noise(0.4, 0.15, 2500, 200, 'lowpass');
    this.g.fx.muzzle({ x: _m.x, y: _m.y, z: _m.z }, 0xffa040, 2);
  }
  private splash(p: V3, r: number, dmg: number, color: number) {
    const g = this.g;
    g.fx.explosion(p, r / 4.5, color);
    g.audio.explosion(r > 6);
    let bossBest: AT | null = null;
    let bossD = 1e9;
    const hits: { t: AT; d: number }[] = [];
    for (const t of this.targets()) {
      const b = t.box;
      const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1);
      const dy = Math.max(b.y0 - p.y, 0, p.y - b.y1);
      const dz = Math.max(b.z0 - p.z, 0, p.z - b.z1);
      const d = Math.hypot(dx, dy, dz);
      if (d > r) continue;
      if (t.kind === 'boss') {
        if (d < bossD) {
          bossD = d;
          bossBest = t;
        }
      } else hits.push({ t, d });
    }
    if (bossBest) hits.push({ t: bossBest, d: bossD });
    for (const h of hits) h.t.hurt(dmg * (1 - 0.55 * (h.d / r)), p, 'splash');
  }
  private steerMissile(b: PBolt, dt: number) {
    const t = b.target && !b.target.dead ? b.target : null;
    if (t) {
      const bx = t.box;
      _d.set((bx.x0 + bx.x1) / 2 - b.pos.x, (bx.y0 + bx.y1) / 2 - b.pos.y, (bx.z0 + bx.z1) / 2 - b.pos.z).normalize();
      const sp = b.vel.length();
      _v.copy(b.vel).normalize();
      const ang = _v.angleTo(_d);
      if (ang > 1e-3) _v.lerp(_d, Math.min(1, (3.6 * dt) / ang)).normalize();
      b.vel.copy(_v).multiplyScalar(Math.min(sp + 130 * dt, 190));
    } else b.vel.z = Math.min(b.vel.z, -150);
    b.mesh.lookAt(b.pos.x + b.vel.x, b.pos.y + b.vel.y, b.pos.z + b.vel.z);
  }

  /* --------------------------------- eject --------------------------------- */
  private startEject() {
    const g = this.g;
    const rig = this.rig!;
    this.phase = 'eject';
    this.ejT = 0;
    this.ejected = true;
    this.meltdownT = 0;
    this.fireHeld = false;
    for (const p of this.eprojs) this.group.remove(p.mesh);
    this.eprojs.length = 0;
    for (const b of this.bolts) this.group.remove(b.mesh);
    this.bolts.length = 0;
    for (const e of this.enemies) if (!e.dead) this.killEnemy(e, true);
    g.banner('EJECTING!', '#ffd54f', 2);
    g.audio.tone(240, 0.3, 'square', 0.1, 900);
    g.audio.noise(0.5, 0.3, 4000, 300, 'bandpass');
    g.shake(0.8);
    this.pilot = rig.pilot;
  }
  private updateEject(dt: number) {
    const g = this.g;
    const rig = this.rig!;
    this.ejT += dt;
    const t = this.ejT;
    rig.canopy.rotation.x = 1.05 * ease(t / 0.45);
    if (!this.shipGone) {
      // the abandoned craft keeps flying forward, smoking, then crashes
      this.z -= AIR_SPEED * dt;
      this.pitch = damp(this.pitch, -0.3, 1.5, dt);
      this.roll += dt * 0.6;
      g.fx.smokePuff({ x: this.x, y: this.y, z: this.z + 2 }, 2.4, 0.6);
      g.fx.flame({ x: this.x, y: this.y, z: this.z + 1.5 }, 2);
    }
    if (!this.pilotLaunched && t >= 0.5 && this.pilot) {
      this.pilotLaunched = true;
      const wp = new THREE.Vector3();
      this.pilot.getWorldPosition(wp);
      rig.group.remove(this.pilot);
      this.pilot.position.copy(wp);
      this.pilot.scale.setScalar(0.95);
      this.pilot.rotation.set(0, 0, 0);
      this.group.add(this.pilot);
      this.pilotVel.set(0, 22, -AIR_SPEED * 0.95);
      g.fx.ring({ x: wp.x, y: wp.y, z: wp.z }, 0xffd54f, 6);
      g.fx.sparks({ x: wp.x, y: wp.y, z: wp.z }, 0xffd54f, 16, 12, 0.5);
      g.audio.swoosh();
    }
    if (this.pilotLaunched && this.pilot) {
      const p = this.pilot;
      if (t < 1.5) {
        this.pilotVel.y += (4 - this.pilotVel.y) * Math.min(1, dt * 2.2);
        this.pilotVel.z += (-AIR_SPEED * 0.4 - this.pilotVel.z) * Math.min(1, dt * 1.2);
        p.position.addScaledVector(this.pilotVel, dt);
        g.fx.glow.emit(p.position.x, p.position.y - 0.6, p.position.z, 0, -4, 0, 1, 0.7, 0.2, 1.2, 0.35, -1, 0, 0.9);
      } else {
        if (!this.chute) {
          this.chute = makeParachute();
          this.chute.scale.setScalar(0.01);
          this.group.add(this.chute);
          g.audio.tone(500, 0.18, 'triangle', 0.1, 900);
          this.descY0 = p.position.y;
        }
        const k = ease((t - 1.5) / 2.6);
        p.position.y = this.descY0 + (1.2 - this.descY0) * k;
        this.pilotVel.z += (-AIR_SPEED * 0.25 - this.pilotVel.z) * Math.min(1, dt * 1.4);
        p.position.z += this.pilotVel.z * dt;
        // drift toward the nearest road lane so the landing is on the street
        let lane = LANE_X[0];
        for (const lx of LANE_X) if (Math.abs(lx - p.position.x) < Math.abs(lane - p.position.x)) lane = lx;
        p.position.x += (lane - p.position.x) * Math.min(1, dt * 1.6);
        p.rotation.z = Math.sin(t * 3) * 0.1;
        this.chute.position.copy(p.position);
        this.chute.scale.setScalar(Math.min(1, (t - 1.5) / 0.35) + 0.001);
        this.chute.rotation.z = Math.sin(t * 3) * 0.1;
      }
    }
    if (!this.shipGone && t >= 2.1) {
      this.shipGone = true;
      const pos = { x: this.x, y: this.y, z: this.z };
      g.fx.explosion(pos, 3.2, 0xff8a30);
      g.fx.explosion({ x: pos.x + 4, y: pos.y - 2, z: pos.z - 3 }, 2, 0xff4060);
      g.audio.explosion(true);
      g.shake(1);
      rig.group.visible = false;
      for (let i = 0; i < 8; i++) this.debrisAt(pos, 0x8f98a8, 2);
    }
    if (t >= 4.2 && this.pilot) {
      const px = this.pilot.position.x;
      const pz = this.pilot.position.z;
      g.exitAir('eject', px, pz);
    }
  }

  /* ---------------------------------- update ---------------------------------- */
  update(dt: number, raw: number) {
    if (!this.active || !this.rig) return;
    const g = this.g;
    const rig = this.rig;
    this.frame++;
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.cd = Math.max(0, this.cd - dt);
    this.cdM = Math.max(0, this.cdM - dt);
    this.tapT = Math.max(0, this.tapT - raw);
    this.warnT = Math.max(0, this.warnT - dt);
    this.barrageT = Math.max(0, this.barrageT - dt);
    if (this.ejectArm > 0) this.ejectArm = Math.max(0, this.ejectArm - raw);
    g.world.eventI += (0.45 - g.world.eventI) * Math.min(1, dt * 0.6);
    this.prevZ = this.z;

    // ---------------- ship motion by phase ----------------
    if (this.phase === 'launch') {
      const T = 2.8;
      const k = ease(this.t / T);
      this.y = 1.35 + (ALT - 1.35) * k;
      const ek = clamp(this.t / 2.2, 0, 1);
      this.speed = 12 + (AIR_SPEED - 12) * ek * ek;
      this.z -= this.speed * dt;
      this.pitch = 0.42 * Math.sin(Math.PI * Math.min(1, k * 1.05));
      rig.canopy.rotation.x = 0.95 * (1 - ease(this.t / 0.5));
      this.ty = ALT;
      this.tx = this.x;
      if (this.t > 0.4) g.fx.dust({ x: this.x, y: Math.max(0.2, 2.5 - this.t * 2), z: this.z + 3 }, 2);
      if (this.t >= 1.2 && !this.boss && !this.training) this.spawnBoss();
      if (this.t >= T) {
        this.phase = 'fly';
        this.vy = 0;
      }
    } else if (this.phase === 'fly' || this.phase === 'victory') {
      this.speed = damp(this.speed, AIR_SPEED, 3, dt);
      this.z -= this.speed * dt;
      this.vx = damp(this.vx, clamp((this.tx - this.x) * 3.2, -34, 34), 7, dt);
      this.vy = damp(this.vy, clamp((this.ty - this.y) * 3.2, -26, 26), 7, dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.roll = damp(this.roll, -this.vx * 0.018, 6, dt);
      this.pitch = damp(this.pitch, this.vy * 0.012, 6, dt);
    } else if (this.phase === 'descend') {
      this.descT += dt;
      const k = ease(this.descT / 3.2);
      this.y = this.descY0 + (3.2 - this.descY0) * k;
      this.speed = damp(this.speed, 24, 1.5, dt);
      this.z -= this.speed * dt;
      let lane = LANE_X[0];
      for (const lx of LANE_X) if (Math.abs(lx - this.x) < Math.abs(lane - this.x)) lane = lx;
      this.x += (lane - this.x) * Math.min(1, dt * 1.3);
      this.pitch = -0.35 * Math.sin(Math.PI * Math.min(1, k * 1.1));
      this.roll = damp(this.roll, 0, 4, dt);
      if (this.descT >= 3.2) {
        g.fx.ring({ x: this.x, y: 1, z: this.z }, 0x40ffe0, 8);
        g.exitAir('victory', this.x, this.z);
        return;
      }
    }

    if (this.phase !== 'dead') {
      rig.group.position.set(this.x, this.y, this.z);
      rig.group.rotation.set(this.pitch, 0, this.roll);
    }
    setBox(this.pbox, this.x, this.y - 1.0, this.z, 3.8, 2.1, 3.5);
    g.player.x = this.x;
    g.player.z = this.z;

    // engine flames + thrusters
    const thr = this.phase === 'eject' ? 0.3 : 0.75 + clamp((this.speed - 20) / 30, 0, 0.5);
    for (let i = 0; i < rig.flames.length; i++) rig.flames[i].scale.y = this.flameBase[i] * thr * (0.82 + Math.random() * 0.36);
    for (const t of rig.thrusters) {
      const act = t.sx !== 0 ? Math.max(0, (-t.sx * this.vx) / 28) : Math.max(0, (-t.sy * this.vy) / 20);
      t.m.scale.setScalar(0.05 + Math.min(1, act) * 0.55);
    }
    // visible condition effects
    if (this.phase !== 'eject' && this.phase !== 'dead') this.damageFx(dt);

    this.speedFx(dt);

    if (this.phase === 'eject') {
      this.updateEject(dt);
      this.updateDebris(dt);
      return;
    }
    if (this.phase === 'dead') {
      this.updateDebris(dt);
      return;
    }

    // ---------------- weapons ----------------
    this.energy = Math.min(100, this.energy + dt * 5);
    if (this.tempT > 0) {
      this.tempT -= dt;
      if (this.tempT <= 0 && this.tempWeapon) {
        if (this.weapon === this.tempWeapon && !this.available().some((w) => w.id === this.weapon)) this.weapon = 'laser';
        this.tempWeapon = null;
        g.toast('Weapon upgrade expired', 'info');
      }
    }
    if (this.controllable) {
      const def = AIR_WEAPONS.find((w) => w.id === this.weapon)!;
      const wantsFire = this.fireHeld || this.tapT > 0;
      if (this.weapon === 'charge') {
        if (this.fireHeld && this.energy > 3) {
          this.charge = Math.min(1, this.charge + dt / 1.1);
          if (this.frame % 4 === 0) g.fx.glow.emit(this.x + rand(-1.5, 1.5), this.y + rand(-1, 1), this.z - 6, 0, 0, 0, 0.75, 0.5, 1, 0.9 + this.charge, 0.18, -1, 0, 0.8);
        } else if (this.charge > 0.12 && this.cd <= 0) {
          this.fireCharged(this.charge);
          this.charge = 0;
        } else if (!this.fireHeld) this.charge = 0;
        if (this.tapT > 0 && this.cd <= 0 && this.energy >= 5) {
          this.fireCharged(0.35);
          this.tapT = 0;
        }
      } else if (wantsFire && this.cd <= 0 && this.energy >= def.energy) this.fire();
    }

    // ---------------- world objects ----------------
    if (this.boss) this.updateBoss(dt);
    this.updateEnemies(dt);
    this.updateBolts(dt);
    this.updateEProjs(dt);
    this.updatePickups(dt);
    this.updateRings();
    this.updateDebris(dt);

    // periodic supply drops (never in training)
    if (!this.training && this.phase === 'fly') {
      this.pkT -= dt;
      if (this.pkT <= 0) {
        this.pkT = rand(9, 14);
        this.spawnPickup(this.dropKind(), clamp(this.x + rand(-14, 14), -X_LIM, X_LIM), clamp(this.y + rand(-9, 9), Y_MIN + 2, Y_MAX - 2), this.z - 120);
      }
    }

    // ---------------- critical failure ----------------
    if (this.meltdownT > 0 && this.phase === 'fly') {
      this.meltdownT -= dt;
      if (this.meltdownT <= 0) this.destroyShip();
    }
    // ---------------- victory flow ----------------
    if (this.phase === 'victory') {
      this.victoryT += dt;
      if (this.victoryT > 3.2 && !this.training) {
        this.phase = 'descend';
        this.descT = 0;
        this.descY0 = this.y;
        g.toast('Returning to the street…', 'info');
      }
    }
    // ---------------- mothership retreat (safety valve) ----------------
    if (this.boss && !this.boss.dying && !this.training && this.boss.t > 190) {
      g.toast('The mothership escaped into hyperspace!', 'bad');
      this.group.remove(this.boss.rig.group);
      this.boss = null;
      this.phase = 'victory';
      this.victoryT = 0;
    }
  }

  private destroyShip() {
    const g = this.g;
    this.phase = 'dead';
    this.fireHeld = false;
    const pos = { x: this.x, y: this.y, z: this.z };
    g.fx.explosion(pos, 3.4, 0xff8a30);
    g.fx.explosion({ x: pos.x + 3, y: pos.y, z: pos.z - 3 }, 2.2, 0xffd060);
    g.audio.explosion(true);
    if (this.rig) this.rig.group.visible = false;
    for (let i = 0; i < 10; i++) this.debrisAt(pos, 0x8f98a8, 2);
    g.onAirDeath();
  }

  private damageFx(dt: number) {
    const g = this.g;
    const st = this.stage;
    this.sparkT -= dt;
    if (st >= 1 && this.sparkT <= 0) {
      this.sparkT = st >= 3 ? 0.12 : st === 2 ? 0.25 : 0.5;
      const s = Math.random() < 0.5 ? -1 : 1;
      g.fx.sparks(this.shipPoint(s * rand(1.5, 3.8), rand(0, 0.6), rand(0, 2.5)), 0xffd070, 4, 7, 0.35);
    }
    if (st >= 2) g.fx.smokePuff({ x: this.x + 0.8, y: this.y + 0.2, z: this.z + 3.4 }, st >= 3 ? 2.2 : 1.5, 0.5);
    if (st >= 3 && this.frame % 2 === 0) g.fx.flame({ x: this.x - 0.8, y: this.y + 0.3, z: this.z + 3.2 }, 1.6);
    if (st >= 3 || this.meltdownT > 0) {
      this.alarmT -= dt;
      if (this.alarmT <= 0) {
        this.alarmT = this.meltdownT > 0 ? 0.25 : 0.6;
        g.audio.tone(this.meltdownT > 0 ? 1100 : 880, 0.15, 'square', 0.07, 620);
      }
    }
  }

  private speedFx(dt: number) {
    void dt;
    const g = this.g;
    for (let i = 0; i < 2; i++)
      g.fx.glow.emit(this.x + rand(-34, 34), this.y + rand(-20, 20), this.z - rand(30, 100), 0, 0, AIR_SPEED * 2.3, 0.7, 0.85, 1, 0.45, 0.8, 0, 0, 0.5);
    if (this.frame % 5 === 0)
      g.fx.smoke.emit(this.x + rand(-60, 60), this.y + rand(-40, 30), this.z - rand(60, 160), 0, 0, AIR_SPEED * 0.9, 0.5, 0.58, 0.75, 22, 3.5, 6, 0, 0.14);
  }

  /* ---------------------------------- entities ---------------------------------- */
  private updateBoss(dt: number) {
    const b = this.boss!;
    const g = this.g;
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt);
    const frac = Math.max(0, b.hp / b.maxHp);
    const deadEng = b.sections.filter((s) => s.name.startsWith('engine') && !s.alive).length;
    const targetRel = (this.phase === 'launch' ? 230 : 185) - deadEng * 24 - (1 - frac) * 10 + Math.sin(b.t * 0.3) * 10;
    b.rel = damp(b.rel, targetRel, 1.2, dt);
    b.x = damp(b.x, Math.sin(b.t * 0.28) * (deadEng ? 9 : 16), 2, dt);
    b.y = damp(b.y, ALT + 9 + Math.sin(b.t * 0.42) * 6 - deadEng * 4, 2, dt);
    const z = this.z - b.rel;
    const grp = b.rig.group;
    grp.position.set(b.x, b.y, z);
    grp.rotation.z = Math.cos(b.t * 0.28) * 0.05 + (b.dying ? b.dyT * 0.12 : 0);
    grp.rotation.x = b.dying ? b.dyT * 0.05 : 0;
    setBox(b.hullBox, b.x, b.y - 7.5, z, 42, 15, 54);
    for (const s of b.sections) setBox(s.at.box, b.x + s.local.x, b.y + s.local.y - s.half.y, z + s.local.z, s.half.x, s.half.y * 2, s.half.z);
    // blinking hull lights, hot core
    if (this.frame % 3 === 0) {
      const l = b.rig.lights;
      for (let i = 0; i < l.length; i++) {
        l[i].color.setHex(b.lightBase[i]);
        if (Math.sin(b.t * 3 + i) < -0.2) l[i].color.multiplyScalar(0.3);
        if (b.flash > 0) l[i].color.setHex(0xffffff);
      }
      b.rig.coreMat.color.setHex(b.sections[4].alive ? (Math.sin(b.t * 6) > 0 ? 0xff3366 : 0xff7a99) : 0x331018);
    }
    // wreckage smoke from destroyed sections
    for (const s of b.sections) if (!s.alive && this.frame % 4 === 0) g.fx.smokePuff(this.bossWorld(b, s.local), 4, 0.5);
    // aim the turrets at the ship
    for (const s of b.sections)
      if (s.name.startsWith('turret') && s.alive) s.obj.rotation.y = clamp(Math.atan2(this.x - (b.x + s.local.x), b.rel), -0.6, 0.6) * 0.5;

    if (b.dying) {
      b.dyT += dt;
      b.y -= dt * 2.5;
      if (this.frame % 3 === 0) {
        const lp = { x: rand(-38, 38), y: rand(-6, 10), z: rand(-45, 50) };
        g.fx.explosion(this.bossWorld(b, lp), rand(1.5, 3), Math.random() < 0.5 ? 0xff8a30 : 0xff4060);
        g.audio.explosion(Math.random() < 0.4);
        g.shake(0.7);
      }
      if (b.dyT > 3.8) this.bossDestroyed();
      return;
    }
    if (this.phase !== 'fly') return;

    // ---------------- attack patterns (intensity rises as health drops) ----------------
    const turrets = b.sections.filter((s) => s.name.startsWith('turret') && s.alive);
    const k = 1 - frac;
    b.fanT -= dt;
    if (b.fanT <= 0 && turrets.length) {
      b.fanT = (3.1 - 1.5 * k) * (turrets.length === 1 ? 0.85 : 1);
      grp.updateMatrixWorld(true);
      for (const t of turrets) {
        (t.obj.userData.muzzle as THREE.Object3D).getWorldPosition(_m);
        const sp = 56;
        const dist = Math.hypot(this.x - _m.x, this.y - _m.y, this.z - _m.z);
        const tt = dist / sp;
        for (const off of [-9, 0, 9]) this.enemyBolt(_m.x, _m.y, _m.z, this.x + this.vx * tt * 0.4 + off, this.y, this.z - AIR_SPEED * tt, sp, 10, 0xff3366, 0.9);
      }
      g.audio.tone(150, 0.25, 'sawtooth', 0.09, 60);
    }
    if (b.passive) return;
    if (frac < 0.75) {
      b.wallT -= dt;
      if (b.wallT <= 0) {
        b.wallT = 8 - 3 * k;
        this.barrage(b, frac < 0.4 && Math.random() < 0.5);
      }
    }
    if (frac < 0.66) {
      b.msT -= dt;
      if (b.msT <= 0) {
        b.msT = 8.5 - 3 * k;
        const bay = this.bossWorld(b, { x: 0, y: -3.5, z: 54 });
        const n = frac < 0.33 ? 4 : 2;
        for (let i = 0; i < n; i++) this.launchMissile(bay.x + (i - (n - 1) / 2) * 5, bay.y, bay.z);
        g.toast('MISSILES INCOMING — shoot them down!', 'bad');
        g.audio.alert();
      }
    }
    b.depT -= dt;
    const cap = frac < 0.33 ? 8 : 6;
    if (b.depT <= 0) {
      b.depT = 6.2 - 2.6 * k;
      if (this.liveEnemies() < cap) {
        const n = 1 + (frac < 0.5 ? 1 : 0) + (Math.random() < 0.4 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const bay = this.bossWorld(b, { x: 0, y: -3.5, z: 54 });
          this.spawnEnemy(this.pickType(frac), bay.x + rand(-6, 6), bay.y + rand(-2, 2), b.rel - 52 + i * 6);
        }
        g.fx.ring(this.bossWorld(b, { x: 0, y: -3.5, z: 54 }), 0xff8a30, 10);
      }
    }
    b.flankT -= dt;
    if (b.flankT <= 0) {
      b.flankT = 9 - 3 * k;
      if (this.liveEnemies() < cap) this.flank(frac);
    }
  }
  private pickType(frac: number): AirType {
    const r = Math.random();
    if (frac > 0.66) return r < 0.5 ? 'interceptor' : r < 0.8 ? 'kamikaze' : 'gunship';
    if (frac > 0.33) return r < 0.28 ? 'interceptor' : r < 0.5 ? 'kamikaze' : r < 0.78 ? 'gunship' : 'heavy';
    return r < 0.2 ? 'interceptor' : r < 0.38 ? 'kamikaze' : r < 0.58 ? 'gunship' : r < 0.78 ? 'heavy' : 'elite';
  }
  /** enemies that come in from the sides, above, below and behind */
  private flank(frac: number) {
    const dir = Math.floor(Math.random() * 5);
    const t = this.pickType(frac);
    if (dir === 0) this.spawnEnemy(t, this.x - 55, this.y + rand(-8, 8), 70);
    else if (dir === 1) this.spawnEnemy(t, this.x + 55, this.y + rand(-8, 8), 70);
    else if (dir === 2) this.spawnEnemy(t, this.x + rand(-15, 15), this.y + 42, 80);
    else if (dir === 3) this.spawnEnemy(t, this.x + rand(-15, 15), this.y - 40, 80);
    else this.spawnEnemy(Math.random() < 0.5 ? 'interceptor' : 'kamikaze', this.x + rand(-12, 12), this.y + rand(-6, 6), -85);
  }
  private barrage(b: BossState, vertical: boolean) {
    const bay = this.bossWorld(b, { x: 0, y: -3.5, z: 54 });
    this.g.banner('INCOMING BARRAGE!', '#ff4d6d', 1.6);
    this.barrageT = 3;
    this.g.audio.alert();
    const gap = vertical ? clamp(this.y + rand(-10, 10), Y_MIN + 6, Y_MAX - 6) : clamp(this.x + rand(-14, 14), -22, 22);
    const speed = 30;
    if (vertical) {
      for (let y = Y_MIN - 10; y <= Y_MAX + 10; y += 6) {
        if (Math.abs(y - gap) < 7) continue;
        this.enemyBolt(this.x, y, bay.z, this.x, y, bay.z + 100, speed, 9, 0xff8a30, 1.0, 0.9);
      }
    } else {
      for (let x = -40; x <= 40; x += 6) {
        if (Math.abs(x - gap) < 7.5) continue;
        this.enemyBolt(x, bay.y + (this.y - bay.y), bay.z, x, this.y, bay.z + 100, speed, 9, 0xff8a30, 1.0, 0.9);
      }
    }
  }
  private bossDestroyed() {
    const b = this.boss!;
    const g = this.g;
    const w = { x: b.x, y: b.y, z: this.z - b.rel };
    for (let i = 0; i < 4; i++) g.fx.explosion({ x: w.x + rand(-20, 20), y: w.y + rand(-4, 6), z: w.z + rand(-30, 30) }, 4.5, i % 2 ? 0xffd060 : 0xff6030);
    g.fx.flash(w, 0xffd090, 60);
    g.audio.explosion(true);
    g.audio.fanfare();
    g.shake(1.4);
    for (let i = 0; i < 16; i++) this.debrisAt({ x: w.x + rand(-30, 30), y: w.y, z: w.z + rand(-30, 30) }, 0x2b3042, 5);
    this.group.remove(b.rig.group);
    this.boss = null;
    this.bossDown = true;
    g.stats.mothers++;
    g.addScore(8000);
    if (!g.training) store.addBucks(300);
    g.banner('MOTHERSHIP DESTROYED!', '#ffd54f', 3.5);
    g.toast(g.training ? 'Victory! (+8,000 score in a real run)' : 'VICTORY!  +8,000 score  +300 Alien Bucks', 'good');
    this.phase = 'victory';
    this.victoryT = 0;
  }

  private updateEnemies(dt: number) {
    const g = this.g;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) {
        this.enemies.splice(i, 1);
        continue;
      }
      this.aiEnemy(e, dt);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.rel += e.vrel * dt;
      const d = EDEF[e.type];
      const z = this.z - e.rel;
      setBox(e.box, e.x, e.y - d.hh, z, d.hw, d.hh * 2, d.hl);
      e.holder.position.set(e.x, e.y, z);
      e.model.rotation.z = clamp(-e.vx * 0.03, -0.7, 0.7) + (e.type === 'kamikaze' ? e.t * 6 : 0);
      if (e.flash > 0) for (const l of e.lights) l.color.setHex(0xffffff);
      else if (this.frame % 3 === 0) e.lights.forEach((l, k) => l.color.setHex(e.lightBase[k]));
      if (e.type !== 'target' && this.phase === 'fly' && boxOverlap(e.box, this.pbox)) {
        this.hit(e.type === 'kamikaze' ? 26 : e.type === 'heavy' ? 18 : 12);
        this.killEnemy(e, true);
        g.shake(0.8);
        continue;
      }
      if (Math.abs(e.rel) > 270 || (e.mode === 1 && Math.abs(e.rel) > 85) || (e.type === 'kamikaze' && e.life > 14)) {
        e.dead = true;
        this.group.remove(e.holder);
      }
    }
  }
  private aiEnemy(e: AirEnemy, dt: number) {
    const sx = this.x;
    const sy = this.y;
    e.t += dt;
    e.life += dt;
    e.flash = Math.max(0, e.flash - dt);
    switch (e.type) {
      case 'interceptor': {
        if (e.mode === 0) {
          e.vrel = e.rel >= 0 ? -44 : 44;
          e.vx = damp(e.vx, clamp((sx - e.x) * 1.5, -28, 28), 3, dt);
          e.vy = damp(e.vy, clamp((sy - e.y) * 1.5, -20, 20), 3, dt);
          e.fireT -= dt;
          if (e.fireT <= 0 && e.rel > 22 && e.rel < 120) {
            this.enemyFire(e, 62, 6, 0xff5a3a, 0.5);
            e.burst++;
            e.fireT = e.burst >= 3 ? 1.5 : 0.28;
            if (e.burst >= 3) e.burst = 0;
          }
          if (Math.abs(e.rel) < 14) {
            e.mode = 1;
            e.dir = e.x >= sx ? 1 : -1;
          }
        } else {
          e.vx = damp(e.vx, e.dir * 30, 2, dt);
          e.vy = damp(e.vy, 10, 2, dt);
        }
        break;
      }
      case 'gunship': {
        e.vrel = e.mode === 2 ? 45 : clamp((58 - e.rel) * 0.9, -34, 34);
        e.vx = damp(e.vx, clamp((sx + Math.sin(e.t * 0.8 + e.ph) * 15 - e.x) * 1.2, -18, 18), 3, dt);
        e.vy = damp(e.vy, clamp((sy + Math.cos(e.t * 0.6 + e.ph) * 7 - e.y) * 1.2, -12, 12), 3, dt);
        e.fireT -= dt;
        if (e.fireT <= 0 && e.rel > 20 && e.mode !== 2) {
          this.enemyFire(e, 58, 8, 0xffa030, 0.55);
          e.fireT = 1.5 + Math.random() * 0.5;
        }
        if (e.life > 24 && e.mode !== 2) e.mode = 2;
        break;
      }
      case 'heavy': {
        e.vrel = e.mode === 2 ? 40 : clamp((78 - e.rel) * 0.5, -16, 16);
        e.vx = damp(e.vx, clamp((sx + Math.sin(e.t * 0.4 + e.ph) * 10 - e.x) * 0.8, -10, 10), 2, dt);
        e.vy = damp(e.vy, clamp((sy + 3 - e.y) * 0.8, -8, 8), 2, dt);
        e.fireT -= dt;
        if (e.fireT <= 0 && e.rel > 24 && e.mode !== 2) {
          for (const off of [-7, 0, 7]) this.enemyFire(e, 48, 10, 0xc16bff, 0.8, off);
          e.fireT = 2.6;
        }
        if (e.life > 30 && e.mode !== 2) e.mode = 2;
        break;
      }
      case 'elite': {
        e.vrel = e.mode === 2 ? 50 : clamp((46 - e.rel) * 1.0, -36, 36);
        e.vx = damp(e.vx, clamp((sx + Math.cos(e.t * 1.4 + e.ph) * 17 - e.x) * 1.8, -34, 34), 4, dt);
        e.vy = damp(e.vy, clamp((sy + Math.sin(e.t * 1.9 + e.ph) * 9 - e.y) * 1.8, -24, 24), 4, dt);
        e.dashT -= dt;
        if (e.dashT <= 0) {
          e.vx += (Math.random() < 0.5 ? -1 : 1) * 38;
          e.dashT = 2 + Math.random();
        }
        e.fireT -= dt;
        if (e.fireT <= 0 && e.rel > 18 && e.mode !== 2) {
          this.enemyFire(e, 64, 8, 0x40e0ff, 0.5, -2.2);
          this.enemyFire(e, 64, 8, 0x40e0ff, 0.5, 2.2);
          e.fireT = 1.15;
        }
        if (e.life > 28 && e.mode !== 2) e.mode = 2;
        break;
      }
      case 'kamikaze': {
        const dx = sx - e.x;
        const dy = sy - e.y;
        const dr = -e.rel;
        const d = Math.hypot(dx, dy, dr) || 1;
        const sp = 46;
        e.vx = damp(e.vx, (dx / d) * sp, 5, dt);
        e.vy = damp(e.vy, (dy / d) * sp, 5, dt);
        e.vrel = damp(e.vrel, (dr / d) * sp, 5, dt);
        break;
      }
      case 'target': {
        e.vrel = clamp((e.hold - e.rel) * 2, -20, 20);
        e.vx = damp(e.vx, Math.sin(e.t * 0.7 + e.ph) * 1.5, 2, dt);
        e.vy = damp(e.vy, Math.cos(e.t * 0.9 + e.ph) * 1.5, 2, dt);
        break;
      }
    }
  }

  private updateBolts(dt: number) {
    const g = this.g;
    const tg = this.targets();
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.prev.copy(b.pos);
      if (b.kind === 'missile') this.steerMissile(b, dt);
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      b.mesh.position.copy(b.pos);
      if (b.kind === 'missile') {
        g.fx.trail(b.pos, 0xffa040, 1.1);
        if (this.frame % 2 === 0) g.fx.smokePuff(b.pos, 1.1, 0.4);
      } else if (b.kind === 'plasma') g.fx.trail(b.pos, b.color, 0.9);
      else if (b.kind === 'charge') g.fx.trail(b.pos, b.color, 1.4);
      let kill = b.life <= 0;
      let bestK = 2;
      let bestT: AT | null = null;
      for (const t of tg) {
        if (t.dead || b.hit.has(t)) continue;
        const k = segBox(b.prev.x, b.prev.y, b.prev.z, b.pos.x, b.pos.y, b.pos.z, t.box, 0.3);
        if (k >= 0 && k < bestK) {
          bestK = k;
          bestT = t;
        }
      }
      if (bestT) {
        _v.copy(b.prev).lerp(b.pos, bestK);
        const pt = { x: _v.x, y: _v.y, z: _v.z };
        g.hitMarker = 0.14;
        if (b.splash > 0) {
          this.splash(pt, b.splash, b.dmg, b.color);
          kill = true;
        } else {
          bestT.hurt(b.dmg, pt, 'bolt');
          g.audio.hit();
          b.hit.add(bestT);
          if (--b.pierce <= 0) kill = true;
        }
      } else if (kill && b.kind === 'missile') this.splash({ x: b.pos.x, y: b.pos.y, z: b.pos.z }, 4, 40, b.color);
      if (kill) {
        this.group.remove(b.mesh);
        this.bolts.splice(i, 1);
      }
    }
  }

  private updateEProjs(dt: number) {
    const g = this.g;
    for (let i = this.eprojs.length - 1; i >= 0; i--) {
      const p = this.eprojs[i];
      p.prev.copy(p.pos);
      if (p.kind === 'missile') {
        _d.set(this.x - p.pos.x, this.y - p.pos.y, this.z - p.pos.z).normalize();
        const sp = Math.min(p.vel.length() + 14 * dt, 46);
        _v.copy(p.vel).normalize();
        const ang = _v.angleTo(_d);
        if (ang > 1e-3) _v.lerp(_d, Math.min(1, (1.7 * dt) / ang)).normalize();
        p.vel.copy(_v).multiplyScalar(sp);
        p.mesh.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
        g.fx.trail(p.pos, 0xff7a2a, 1.0);
        if (this.frame % 3 === 0) g.fx.smokePuff(p.pos, 1.0, 0.35);
      }
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      p.mesh.position.copy(p.pos);
      let kill = p.life <= 0;
      if (p.at) {
        setBox(p.at.box, p.pos.x, p.pos.y - 1.2, p.pos.z, 1.2, 2.4, 1.6);
        if (p.at.dead) {
          g.fx.explosion({ x: p.pos.x, y: p.pos.y, z: p.pos.z }, 0.9, 0xff8a30);
          g.audio.explosion(false);
          g.addScore(40);
          kill = true;
        }
      }
      if (!kill && (this.phase === 'fly' || this.phase === 'launch')) {
        const k = segBox(p.prev.x, p.prev.y, p.prev.z, p.pos.x, p.pos.y, p.pos.z, this.pbox, p.pad);
        if (k >= 0) {
          this.hit(p.dmg);
          g.fx.sparks({ x: p.pos.x, y: p.pos.y, z: p.pos.z }, p.color, 8, 8, 0.5);
          if (p.kind === 'missile') g.fx.explosion({ x: p.pos.x, y: p.pos.y, z: p.pos.z }, 1.1, 0xff8a30);
          kill = true;
        }
      }
      if (p.pos.z > this.z + 40) kill = true;
      if (kill) {
        this.group.remove(p.mesh);
        this.eprojs.splice(i, 1);
      }
    }
  }

  private updatePickups(dt: number) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.t += dt;
      k.item.rotation.y = k.t * 2.2;
      k.group.position.set(k.x, k.y + Math.sin(k.t * 3) * 0.4, k.z);
      if (this.phase === 'fly' && Math.abs(k.x - this.x) < 4.2 && Math.abs(k.y - this.y) < 3.6 && Math.abs(k.z - this.z) < 3.2 + AIR_SPEED * dt) {
        this.collect(k);
        this.group.remove(k.group);
        this.pickups.splice(i, 1);
        continue;
      }
      if (k.z > this.z + 30) {
        this.group.remove(k.group);
        this.pickups.splice(i, 1);
      }
    }
  }

  private updateRings() {
    for (const r of this.rings) {
      r.mesh.rotation.z += 0.01;
      if (r.state !== 0) continue;
      if (this.prevZ > r.z && this.z <= r.z) {
        const d = Math.hypot(this.x - r.x, this.y - r.y);
        if (d < r.r + 1.5) {
          r.state = 1;
          this.ringsPassed++;
          (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(0x4cff7a);
          this.g.audio.pickup('ammo');
          this.g.fx.ring({ x: r.x, y: r.y, z: r.z }, 0x4cff7a, 10);
          this.g.addScore(50);
        } else {
          r.state = 2;
          this.ringsMissed++;
          (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(0xff4040);
        }
      }
    }
  }

  private updateDebris(dt: number) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      d.vel.y -= 14 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt;
      d.mesh.rotation.y += d.spin.y * dt;
      if (this.frame % 3 === 0) this.g.fx.smokePuff({ x: d.mesh.position.x, y: d.mesh.position.y, z: d.mesh.position.z }, 0.8, 0.3);
      if (d.life <= 0) {
        this.group.remove(d.mesh);
        this.debris.splice(i, 1);
      }
    }
  }

  /* ----------------------------------- camera ---------------------------------- */
  updateCamera(cam: THREE.PerspectiveCamera, dt: number) {
    const g = this.g;
    const portrait = cam.aspect < 0.8;
    const d = new THREE.Vector3();
    const l = new THREE.Vector3();
    if (this.phase === 'eject' && this.pilot && this.pilotLaunched) {
      const p = this.pilot.position;
      d.set(p.x + 7, p.y + 1.2, p.z + (portrait ? 17 : 14));
      l.set(p.x, p.y + 1.6, p.z - 8);
    } else if (this.phase === 'dead') {
      d.copy(this.cam);
      l.set(this.x, this.y, this.z);
    } else {
      const back = portrait ? 21 : 17;
      const up = portrait ? 8 : 6.4;
      d.set(this.x * 0.72, this.y + up, this.z + back);
      l.set(this.x * 0.88, this.y - 8, this.z - 70);
    }
    if (!this.camInit) {
      this.camInit = true;
      this.cam.copy(cam.position);
    }
    const k = this.phase === 'launch' ? 2.2 : this.phase === 'eject' ? 3 : 5;
    this.cam.x = damp(this.cam.x, d.x, k, dt);
    this.cam.y = damp(this.cam.y, d.y, k, dt);
    this.cam.z = damp(this.cam.z, d.z, Math.max(k, 6), dt);
    cam.position.copy(this.cam);
    g.shakeAmt = Math.max(0, g.shakeAmt - dt * 2.5);
    if (g.shakeAmt > 0.001) {
      cam.position.x += (Math.random() - 0.5) * g.shakeAmt * 0.9;
      cam.position.y += (Math.random() - 0.5) * g.shakeAmt * 0.7;
    }
    const camRoll = this.phase === 'eject' || this.phase === 'dead' ? 0 : this.roll;
    cam.up.set(Math.sin(-camRoll * 0.4), Math.cos(camRoll * 0.4), 0);
    cam.lookAt(l);
    const base = portrait ? 88 : 72;
    const tf = base + (this.phase === 'launch' ? 8 : 0) + Math.abs(this.vx) * 0.06 + (this.speed - AIR_SPEED) * 0.2;
    if (Math.abs(cam.fov - tf) > 0.05) {
      cam.fov += (tf - cam.fov) * Math.min(1, dt * 3);
      cam.updateProjectionMatrix();
    }
  }

  /* -------------------------------------- HUD ------------------------------------ */
  hud(): AirHud {
    const b = this.boss;
    const w = AIR_WEAPONS.find((x) => x.id === this.weapon)!;
    const quiet = this.phase === 'eject' || this.phase === 'dead' || this.phase === 'descend';
    const warn =
      quiet
        ? ''
        : this.meltdownT > 0
        ? `REACTOR OVERLOAD — EJECT NOW  ${this.meltdownT.toFixed(1)}s`
        : this.stage >= 4
          ? 'EJECT NOW!'
          : this.stage === 3
            ? 'WARNING — HULL CRITICAL'
            : '';
    return {
      hull: Math.ceil(this.hull),
      stage: this.stage,
      shield: Math.ceil(this.shield),
      energy: Math.floor(this.energy),
      missiles: this.missiles,
      missileCap: this.missileCap,
      weapon: { id: this.weapon, name: w.name, temp: this.tempWeapon === this.weapon, tempLeft: Math.ceil(this.tempT) },
      weapons: this.available().map((x) => ({ id: x.id, name: x.name, active: x.id === this.weapon })),
      charge: this.charge,
      phase: this.phase,
      meltdown: Math.max(0, this.meltdownT),
      ejectArmed: this.ejectArm > 0,
      ejectPrompt: !quiet && (this.stage >= 3 || this.meltdownT > 0),
      boss: b && !b.dying ? { name: 'ALIEN MOTHERSHIP', hp: Math.max(0, b.hp / b.maxHp), sections: b.sections.map((s) => ({ name: s.name, alive: s.alive })) } : null,
      warn,
      barrage: this.barrageT > 0,
      altitude: Math.round(this.y),
      enemies: this.liveEnemies(),
      training: this.training,
      controllable: this.controllable,
    };
  }

  /** pad-launch helper used by Game for the glow textures */
  static glow = glowSprite;
}
