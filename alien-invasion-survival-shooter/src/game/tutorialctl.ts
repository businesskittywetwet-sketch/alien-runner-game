import * as THREE from 'three';
import type { Game } from './game';
import { LANE_X, WEAPONS, type WeaponId } from './config';
import { store, TRAIN_LESSONS } from './progress';
import { basic, box, CYL, glowMat, makeBarrier, makeBillboard, makeCrate, makeLowWall, mesh } from './models';
import { makeTargetBoard } from './airmodels';
import type { Obst } from './obstacles';
import type { Enemy } from './enemies';
import type { EnemyType } from './config';

/* ----------------------------------------------------------------------------
 * Interactive training. Every lesson is a list of single-mechanic steps:
 *   demo (the game plays itself)  ->  practice (player performs it)  ->  success.
 * Training is a sandbox: no damage, no currency changes, unlimited retries and
 * nothing random spawns unless the current step asked for it.
 * -------------------------------------------------------------------------- */
export type StepPhase = 'demo' | 'practice' | 'success' | 'lessonDone' | 'allDone';
export type Spot = 'ammo' | 'health' | 'bucks' | 'weapons' | 'abilities' | 'none';
export type Gesture = 'left' | 'right' | 'up' | 'down' | 'tap' | 'collect' | 'none';

export interface TrainHud {
  lesson: number;
  lessonCount: number;
  title: string;
  blurb: string;
  step: number;
  stepCount: number;
  phase: StepPhase;
  text: string;
  intro: string;
  info: boolean;
  prog: number;
  need: number;
  cue: string;
  msg: string;
  msgBad: boolean;
  done: boolean[];
  demoLeft: number;
  gesture: Gesture;
  spot: Spot;
  air: boolean;
  reward: number;
  hasNext: boolean;
}

interface StepDef {
  id: string;
  text: string;
  intro?: string;
  gesture?: Gesture;
  spot?: Spot;
  info?: boolean;
  noDemo?: boolean;
  need?: number;
  demoLen?: number;
  setup?: (c: TutorialCtl, demo: boolean) => void;
  demo?: (c: TutorialCtl, t: number) => void;
  update?: (c: TutorialCtl, dt: number) => boolean | void;
}
interface LessonDef {
  title: string;
  blurb: string;
  steps: StepDef[];
}
interface Dummy {
  o: Obst;
  x0: number;
  ahead: number;
  moving: boolean;
  ph: number;
}
interface Snap {
  owned: Map<WeaponId, { mag: number; reserve: number }>;
  cur: WeaponId;
  gren: number;
  hp: number;
  en: number;
  armor: number;
  shield: number;
  eq: Game['player']['eq'];
}

const laneOf = (x: number) => {
  let b = 0;
  for (let i = 1; i < 4; i++) if (Math.abs(LANE_X[i] - x) < Math.abs(LANE_X[b] - x)) b = i;
  return b;
};

export class TutorialCtl {
  g: Game;
  lessonIdx = 0;
  stepIdx = 0;
  phase: StepPhase = 'practice';
  t = 0;
  prog = 0;
  need = 1;
  cue = '';
  msg = '';
  msgBad = false;
  msgT = 0;
  hit = false;
  respT = 0;
  kills = 0;
  v: Record<string, number> = {};
  reward = 0;
  lessons: LessonDef[];
  private fired = new Set<string>();
  private dummies: Dummy[] = [];
  private tether: { e: Enemy; hold: number }[] = [];
  private beaconObj: { grp: THREE.Group; lane: number } | null = null;
  private seen = new Set<unknown>();
  private snapshot: Snap | null = null;
  respawn: (() => void) | null = null;

  constructor(g: Game) {
    this.g = g;
    this.lessons = buildLessons();
  }

  get step(): StepDef {
    return this.lessons[this.lessonIdx].steps[this.stepIdx];
  }
  get p() {
    return this.g.player;
  }

  /* ------------------------------ lifecycle ------------------------------ */
  reset() {
    this.clearField();
    this.phase = 'practice';
    this.respawn = null;
  }
  begin(idx: number) {
    this.lessonIdx = Math.max(0, Math.min(TRAIN_LESSONS - 1, idx));
    this.stepIdx = 0;
    this.reward = 0;
    this.enterStep();
  }
  private enterStep() {
    const s = this.step;
    this.v = {};
    this.prog = 0;
    this.need = s.need ?? 1;
    this.cue = '';
    this.msg = '';
    this.hit = false;
    this.t = 0;
    this.kills = 0;
    this.respT = 0;
    this.fired.clear();
    this.respawn = null;
    if (this.g.mode === 'ground') this.takeSnap();
    this.clearField();
    if (s.info || s.noDemo) {
      this.phase = 'practice';
      s.setup?.(this, false);
    } else {
      this.phase = 'demo';
      s.setup?.(this, true);
    }
  }
  private startPractice() {
    const s = this.step;
    this.phase = 'practice';
    this.t = 0;
    this.prog = 0;
    this.kills = 0;
    this.hit = false;
    this.cue = '';
    this.respT = 0;
    this.v = {};
    this.fired.clear();
    this.respawn = null;
    if (this.g.mode === 'ground') {
      this.restoreSnap();
      this.p.dashT = 0;
      this.p.sliding = false;
    }
    this.clearField();
    s.setup?.(this, false);
  }
  retry() {
    if (this.phase === 'demo' || this.phase === 'practice') {
      this.startPractice();
      this.say('Try again — you have unlimited attempts.', false);
    }
  }
  skipDemo() {
    if (this.phase === 'demo') this.startPractice();
  }
  /** Continue button on info steps */
  next() {
    if (this.step.info && this.phase === 'practice') this.succeed();
  }
  nextLesson() {
    if (this.lessonIdx + 1 < TRAIN_LESSONS) this.g.startTraining(this.lessonIdx + 1);
    else this.g.quit();
  }
  replayLesson() {
    this.g.startTraining(this.lessonIdx);
  }

  private succeed() {
    this.phase = 'success';
    this.t = 0;
    this.cue = '';
    this.g.audio.pickup('weapon');
    this.g.audio.fanfare();
  }
  private advance() {
    if (this.stepIdx + 1 >= this.lessons[this.lessonIdx].steps.length) {
      const before = store.trainingDone();
      const first = store.completeLesson(this.lessonIdx);
      this.reward = first && !before ? 300 : 0;
      this.phase = first ? 'allDone' : 'lessonDone';
      this.clearField();
      this.g.audio.fanfare();
      return;
    }
    this.stepIdx++;
    this.enterStep();
  }

  /* -------------------------------- update -------------------------------- */
  update(dt: number) {
    this.t += dt;
    this.msgT = Math.max(0, this.msgT - dt);
    if (this.msgT <= 0 && this.phase !== 'lessonDone') this.msg = '';
    if (this.g.mode === 'ground') this.groundTick(dt);
    const s = this.step;
    if (this.phase === 'demo') {
      s.demo?.(this, this.t);
      if (this.t >= (s.demoLen ?? 4)) this.startPractice();
    } else if (this.phase === 'practice') {
      if (s.update && !s.info && s.update(this, dt)) this.succeed();
    } else if (this.phase === 'success') {
      if (this.t > 1.15) this.advance();
    }
  }
  /** keeps targets / enemies / beacons where the lesson wants them */
  private groundTick(dt: number) {
    const p = this.p;
    void dt;
    for (const d of this.dummies) {
      if (d.o.dead) continue;
      const x = d.moving ? Math.sin(this.t * 1.3 + d.ph) * 4.6 : d.x0;
      const z = p.z - d.ahead;
      d.o.box.x0 = x - 0.9;
      d.o.box.x1 = x + 0.9;
      d.o.box.z0 = z - 0.25;
      d.o.box.z1 = z + 0.25;
      d.o.box.y0 = 0;
      d.o.box.y1 = 2.6;
      d.o.mesh?.position.set(x, 0, z);
    }
    for (const th of this.tether) if (!th.e.dead) th.e.z = p.z - th.hold;
    if (this.beaconObj) this.beaconObj.grp.position.set(LANE_X[this.beaconObj.lane], 0, p.z - 15);
    if (this.phase === 'practice' && this.respawn && this.g.pickups.list.length === 0 && this.respT <= 0) {
      this.respT = 0.6;
      this.respawn();
    }
    this.respT = Math.max(0, this.respT - dt);
  }

  /** called by Game when the player would have been hurt */
  onHit() {
    if (this.phase !== 'practice') return;
    this.hit = true;
    this.say('Hit! (no damage in training) — try again.', true);
  }

  /* -------------------------------- helpers -------------------------------- */
  say(m: string, bad = false) {
    this.msg = m;
    this.msgBad = bad;
    this.msgT = 3;
  }
  fail(m: string) {
    this.say(m, true);
    this.g.audio.hurt();
  }
  at(time: number, key: string, fn: () => void) {
    if (this.t >= time && !this.fired.has(key)) {
      this.fired.add(key);
      fn();
    }
  }
  lane(n: number) {
    const p = this.p;
    p.lane = n;
    p.x = LANE_X[n];
  }
  clearField() {
    const g = this.g;
    this.dummies.length = 0;
    this.tether.length = 0;
    this.respawn = null;
    this.setBeacon(null);
    this.seen.clear();
    if (g.mode === 'air') {
      g.flight.clearTraining();
      return;
    }
    g.obstacles.reset();
    g.traversal.reset();
    g.enemies.reset();
    g.pickups.reset();
    g.flight.clearPads();
    for (const pr of g.weapons.projs) g.weapons.group.remove(pr.mesh);
    g.weapons.projs.length = 0;
  }
  private takeSnap() {
    const w = this.g.weapons;
    const p = this.p;
    this.snapshot = {
      owned: new Map([...w.owned].map(([k, v]) => [k, { ...v }])),
      cur: w.cur, gren: w.grenades, hp: p.health, en: p.energy, armor: p.armor, shield: p.shield, eq: { ...p.eq },
    };
  }
  private restoreSnap() {
    const s = this.snapshot;
    if (!s) return;
    const w = this.g.weapons;
    const p = this.p;
    w.owned = new Map([...s.owned].map(([k, v]) => [k, { ...v }]));
    w.cur = s.cur;
    p.setGun(s.cur);
    w.grenades = s.gren;
    w.reloading = false;
    p.health = s.hp;
    p.energy = s.en;
    p.armor = s.armor;
    p.shield = s.shield;
    p.eq = { ...s.eq };
  }
  fillAmmo() {
    const w = this.g.weapons;
    const d = WEAPONS[w.cur];
    const s = w.slot();
    if (!w.reloading) s.mag = d.mag;
    if (d.reserve > 0) s.reserve = d.reserve;
  }
  ensureWeapon(id: WeaponId) {
    const w = this.g.weapons;
    w.addWeapon(id, true);
    w.switchTo(id);
  }
  setBeacon(lane: number | null) {
    const g = this.g;
    if (this.beaconObj) {
      g.scene.remove(this.beaconObj.grp);
      this.beaconObj = null;
    }
    if (lane === null) return;
    const grp = new THREE.Group();
    grp.add(mesh(CYL, glowMat(0x22d3ee, 0.55), 2.5, 0.06, 2.5, 0, 0.07, 0));
    for (const sx of [-1, 1]) grp.add(box(0.14, 1.8, 0.14, basic(0x22d3ee), sx * 1.2, 0.9, 0));
    grp.add(box(2.5, 0.12, 0.12, basic(0x22d3ee), 0, 1.8, 0));
    g.scene.add(grp);
    this.beaconObj = { grp, lane };
  }
  dummy(x: number, ahead: number, moving: boolean) {
    const g = this.g;
    const o = g.obstacles.make('dummy', x, this.p.z - ahead, 1.8, 0.5, 2.6, makeTargetBoard(), {
      contact: 'none', hp: 30, shootable: true, aim: true, avoidable: false,
    });
    o.onDestroy = () => {
      this.kills++;
    };
    this.dummies.push({ o, x0: x, ahead, moving, ph: Math.random() * 6 });
    return o;
  }
  liveDummies() {
    return this.dummies.filter((d) => !d.o.dead).length;
  }
  keepDummies(n: number, moving: boolean) {
    this.dummies = this.dummies.filter((d) => !d.o.dead);
    while (this.dummies.length < n) this.dummy(LANE_X[Math.floor(Math.random() * 4)], 24 + this.dummies.length * 7, moving);
  }
  enemy(type: EnemyType, lane: number, hold: number, hpMul = 0.6) {
    const e = this.g.enemies.spawn(type, lane, this.p.z - hold, { hpMul });
    this.tether.push({ e, hold });
    return e;
  }
  spawnWall(kind: 'jump' | 'slide', ahead: number) {
    const g = this.g;
    const z = this.p.z - ahead;
    let first: Obst;
    if (kind === 'jump') {
      first = g.obstacles.make('barrier', LANE_X[0], z, 2.5, 0.6, 0.95, makeBarrier().group, { hurt: 15, avoidable: false });
      for (let l = 1; l < 4; l++) g.obstacles.make('barrier', LANE_X[l], z, 2.5, 0.6, 0.95, makeBarrier().group, { hurt: 15, avoidable: false });
    } else {
      first = g.obstacles.make('beam', 0, z, 12.6, 0.5, 1.7, makeBillboard(12.6, 'DUCK', '#ff8a30'), { y0: 0.9, hurt: 20, avoidable: false, label: 'Slide' });
    }
    return first;
  }
  /** jump / slide practice loop shared by lessons 2 and 3 */
  wallStep(dt: number, kind: 'jump' | 'slide') {
    const p = this.p;
    const wall = this.g.obstacles.list.find((o) => o.type === (kind === 'jump' ? 'barrier' : 'beam'));
    if (wall) {
      const dz = p.z - wall.box.z1;
      this.cue = dz < 9 && dz > 3 ? (kind === 'jump' ? 'JUMP NOW!' : 'SLIDE NOW!') : '';
      if (this.hit) {
        this.hit = false;
        this.fail(kind === 'jump' ? 'Hit it! Jump just as the barrier reaches you.' : 'Too late! Slide a little earlier.');
        this.g.obstacles.reset();
        this.respT = 0.9;
        return false;
      }
      if (wall.passed) {
        this.prog++;
        this.g.obstacles.reset();
        this.cue = '';
        this.say('Perfect!', false);
        if (this.prog >= this.need) return true;
        this.respT = 0.7;
      }
    } else {
      this.respT -= dt;
      if (this.respT <= 0) this.spawnWall(kind, 44);
    }
    return false;
  }
  /** demo autopilot for the jump / slide lessons */
  autoDodge() {
    const g = this.g;
    const p = this.p;
    for (const o of g.obstacles.list) {
      if (o.spent || o.dead) continue;
      const dz = p.z - o.box.z1;
      if (dz < 0 || dz > 11) continue;
      if (o.type === 'barrier' && dz < 6 && p.grounded) g.jump();
      if (o.type === 'beam' && dz < 7 && !p.sliding) g.slide();
    }
  }
  /** demo autopilot for ramps / ropes / ziplines / grapples */
  autoTraverse(grapple = false) {
    const g = this.g;
    const p = this.p;
    const ramp = g.obstacles.list.filter((o) => o.ramp && !o.spent).sort((a, b) => b.ramp!.zStart - a.ramp!.zStart)[0];
    if (ramp && p.z > ramp.ramp!.zEnd - 0.5 && p.state === 'run') {
      const l = laneOf((ramp.box.x0 + ramp.box.x1) / 2);
      if (p.lane !== l) p.setLane(l);
      if (!grapple && p.grounded && p.groundObj === ramp && p.z - ramp.ramp!.zEnd < 2.2) g.jump();
    }
    const cur = g.traversal.cur;
    if (cur && cur.type === 'rope' && cur.theta > 0.6) g.jump();
    if (grapple && p.eq.grapple > 0 && p.state === 'run' && g.traversal.findCrossing(true) && p.z < -30) g.traversal.useGrapple();
  }
  spawnGap(kind: 'rope' | 'zip' | 'bar' | 'grapple', ahead = 46) {
    const g = this.g;
    const z = this.p.z - ahead;
    const len = g.director.pat.gap(z, kind);
    this.v.end = z - len + 12;
  }
  /** shared practice loop for the traversal steps */
  traverseStep(stat: 'ropes' | 'zips' | 'grapples' | 'vaults', kind: 'rope' | 'zip' | 'grapple' | 'wall') {
    const g = this.g;
    const p = this.p;
    if (this.v.base === undefined) this.v.base = g.stats[stat];
    if (g.stats[stat] > this.v.base) return true;
    const failed = this.hit || (this.v.end !== undefined && p.z < this.v.end - 14 && p.state === 'run');
    if (failed && this.respT <= 0) {
      this.hit = false;
      this.fail('Not quite — watch the prompt and try again.');
      this.clearField();
      this.respT = 0.8;
      this.v.spawn = 1;
    }
    if ((this.v.spawn === undefined || this.v.spawn === 1) && this.respT <= 0 && p.state === 'run') {
      this.v.spawn = 0;
      if (kind === 'wall') this.spawnVaultWalls(40);
      else this.spawnGap(kind, 46);
    }
    this.respT = Math.max(0, this.respT - 0.016);
    return false;
  }
  spawnVaultWalls(ahead: number) {
    const g = this.g;
    const z = this.p.z - ahead;
    for (let l = 0; l < 4; l++) g.obstacles.make('wall', LANE_X[l], z, 2.9, 0.6, 1.0, makeLowWall(2.8), { walk: true, contact: 'vault', hurt: 0 });
  }
  /** a row of 2-crate-deep platforms in every lane — a forgiving landing zone */
  spawnCrates(ahead: number) {
    const g = this.g;
    const z = this.p.z - ahead;
    for (let l = 0; l < 4; l++) {
      const grp = new THREE.Group();
      const a = makeCrate(1.3);
      a.position.z = -0.8;
      const b = makeCrate(1.3);
      b.position.z = 0.8;
      grp.add(a, b);
      g.obstacles.make('crate', LANE_X[l], z, 1.7, 3.4, 1.3, grp, { walk: true, hurt: 14, label: 'Crate', avoidable: false });
    }
  }
  pickupAhead(kind: Parameters<Game['pickups']['spawn']>[0], lane: number, ahead: number, weapon?: WeaponId, tier = 1) {
    this.g.pickups.spawn(kind, LANE_X[lane], 0, this.p.z - ahead, weapon, tier);
  }
  /** bolts that flew past the player without hitting */
  passedBolts(): number {
    let n = 0;
    for (const pr of this.g.weapons.projs) {
      if (pr.owner !== 'e' || this.seen.has(pr)) continue;
      if (pr.pos.z > this.p.z + 1.2) {
        this.seen.add(pr);
        n++;
      }
    }
    return n;
  }

  /* ----------------------------------- HUD ----------------------------------- */
  hud(): TrainHud {
    const s = this.step;
    const L = this.lessons[this.lessonIdx];
    return {
      lesson: this.lessonIdx,
      lessonCount: TRAIN_LESSONS,
      title: L.title,
      blurb: L.blurb,
      step: this.stepIdx,
      stepCount: L.steps.length,
      phase: this.phase,
      text: s.text,
      intro: s.intro ?? '',
      info: !!s.info,
      prog: this.prog,
      need: this.need,
      cue: this.cue,
      msg: this.msg,
      msgBad: this.msgBad,
      done: Array.from({ length: TRAIN_LESSONS }, (_, i) => store.lessonDone(i)),
      demoLeft: Math.max(0, (s.demoLen ?? 4) - this.t),
      gesture: s.gesture ?? 'none',
      spot: s.spot ?? 'none',
      air: this.g.mode === 'air',
      reward: this.reward,
      hasNext: this.lessonIdx + 1 < TRAIN_LESSONS,
    };
  }
}

/* ========================================================================== */
/*  Lesson content                                                            */
/* ========================================================================== */
function buildLessons(): LessonDef[] {
  const tap = (c: TutorialCtl, t: number) => {
    const k = Math.floor(t / 0.55);
    c.at(k * 0.55 + 0.01, `k${k}`, () => c.g.weapons.tapFire());
  };
  const pad = (c: TutorialCtl) => c.p.lane;
  void pad;

  return [
    /* ------------------------------ 1 · movement ------------------------------ */
    {
      title: 'Basic Movement',
      blurb: 'Run forward and weave between the four lanes.',
      steps: [
        { id: 'run', info: true, gesture: 'none', text: 'You run forward automatically — you never need to stop. The road has FOUR lanes, numbered 1–4 from left to right.', setup: (c) => c.lane(1) },
        {
          id: 'right', gesture: 'right', text: 'SWIPE RIGHT to move one lane to the right.', intro: 'One swipe moves you exactly ONE lane, however far you swipe.', demoLen: 3.2,
          setup: (c) => { c.lane(1); c.setBeacon(2); },
          demo: (c) => c.at(1.0, 'r', () => c.g.moveLane(1)),
          update: (c) => c.p.lane === 2,
        },
        {
          id: 'left', gesture: 'left', text: 'SWIPE LEFT to move one lane to the left.', intro: 'Swipe left to drift back. Swipe again for each extra lane.', demoLen: 3.2,
          setup: (c) => { c.lane(1); c.setBeacon(0); },
          demo: (c) => c.at(1.0, 'l', () => c.g.moveLane(-1)),
          update: (c) => c.p.lane === 0,
        },
        {
          id: 'far', gesture: 'right', text: 'Reach the FAR RIGHT lane — one swipe for every lane.', intro: 'Three swipes take you from lane 1 to lane 4.', demoLen: 4.4,
          setup: (c) => { c.lane(0); c.setBeacon(3); },
          demo: (c) => { c.at(0.8, 'a', () => c.g.moveLane(1)); c.at(1.8, 'b', () => c.g.moveLane(1)); c.at(2.8, 'c', () => c.g.moveLane(1)); },
          update: (c) => c.p.lane === 3,
        },
        {
          id: 'back', gesture: 'left', text: 'Now weave all the way back to the FAR LEFT lane.', intro: 'Same thing in the other direction.', demoLen: 4.4,
          setup: (c) => { c.lane(3); c.setBeacon(0); },
          demo: (c) => { c.at(0.8, 'a', () => c.g.moveLane(-1)); c.at(1.8, 'b', () => c.g.moveLane(-1)); c.at(2.8, 'c', () => c.g.moveLane(-1)); },
          update: (c) => c.p.lane === 0,
        },
      ],
    },
    /* ------------------------------- 2 · jumping ------------------------------ */
    {
      title: 'Jumping',
      blurb: 'Jump over low obstacles with perfect timing.',
      steps: [
        {
          id: 'jump', gesture: 'up', need: 3, demoLen: 4.8,
          text: 'SWIPE UP to jump over the barrier — jump when the JUMP NOW cue appears.',
          intro: 'Watch: the barrier is low, so we jump over it. Time your swipe just before it reaches you.',
          setup: (c, demo) => { c.lane(1); c.spawnWall('jump', demo ? 34 : 44); },
          demo: (c) => c.autoDodge(),
          update: (c, dt) => c.wallStep(dt, 'jump'),
        },
      ],
    },
    /* ------------------------------- 3 · sliding ------------------------------ */
    {
      title: 'Sliding',
      blurb: 'Slide under high obstacles.',
      steps: [
        {
          id: 'slide', gesture: 'down', need: 3, demoLen: 4.8,
          text: 'SWIPE DOWN to slide under the billboard — slide when the SLIDE NOW cue appears.',
          intro: 'Watch: the billboard is overhead, so we slide underneath it.',
          setup: (c, demo) => { c.lane(1); c.spawnWall('slide', demo ? 34 : 44); },
          demo: (c) => c.autoDodge(),
          update: (c, dt) => c.wallStep(dt, 'slide'),
        },
      ],
    },
    /* ------------------------------- 4 · shooting ------------------------------ */
    {
      title: 'Shooting',
      blurb: 'Fire your weapon at still and moving targets.',
      steps: [
        {
          id: 'static', gesture: 'tap', need: 3, demoLen: 5.4, spot: 'ammo',
          text: 'TAP the screen — or hold SHOOT — to fire. Destroy the 3 targets.',
          intro: 'Shots auto-aim at targets ahead of you. Tap for a burst, hold SHOOT for continuous fire.',
          setup: (c) => { c.lane(1); c.dummy(LANE_X[0], 26, false); c.dummy(LANE_X[1], 31, false); c.dummy(LANE_X[3], 36, false); },
          demo: (c, t) => { c.fillAmmo(); tap(c, t); },
          update: (c) => { c.fillAmmo(); c.prog = c.kills; return c.kills >= 3; },
        },
        {
          id: 'moving', gesture: 'tap', need: 3, demoLen: 5.4,
          text: 'Targets can MOVE. Keep firing — your shots lead them. Destroy 3 moving targets.',
          intro: 'Moving targets slide across the road. Auto-aim leads them for you.',
          setup: (c) => { c.lane(1); c.dummy(0, 26, true); c.dummy(0, 31, true); c.dummy(0, 36, true); },
          demo: (c, t) => { c.fillAmmo(); tap(c, t); },
          update: (c) => { c.fillAmmo(); c.prog = c.kills; return c.kills >= 3; },
        },
        { id: 'ammo', info: true, spot: 'ammo', text: 'Look at the AMMO panel (bottom right): rounds in the magazine / reserve ammo. The M9 Pistol has unlimited reserve — other guns need ammo pickups.', setup: (c) => c.lane(1) },
      ],
    },
    /* ------------------------------- 5 · weapons ------------------------------- */
    {
      title: 'Weapons',
      blurb: 'Collect, switch and understand your weapons.',
      steps: [
        {
          id: 'rifle', gesture: 'collect', demoLen: 4.4,
          text: 'Run into the BLUE weapon pickup to collect the Assault Rifle.',
          intro: 'Weapons appear as glowing blue pickups on the road. Run through one to collect it.',
          setup: (c) => { c.lane(1); c.pickupAhead('weapon', 2, 34, 'rifle'); c.respawn = () => c.pickupAhead('weapon', 2, 34, 'rifle'); },
          demo: (c) => c.at(0.3, 'l', () => c.p.setLane(2)),
          update: (c) => c.g.weapons.owned.has('rifle'),
        },
        {
          id: 'shotgun', gesture: 'collect', demoLen: 4.4,
          text: 'Collect the Breacher Shotgun too.',
          intro: 'Each pickup adds a new weapon to your arsenal.',
          setup: (c) => { c.lane(1); c.pickupAhead('weapon', 1, 34, 'shotgun'); c.respawn = () => c.pickupAhead('weapon', 1, 34, 'shotgun'); },
          demo: () => undefined,
          update: (c) => c.g.weapons.owned.has('shotgun'),
        },
        {
          id: 'switch', gesture: 'tap', spot: 'weapons', demoLen: 3.2,
          text: 'Tap the SHOTGUN chip on the right of the screen to switch weapons.',
          intro: 'The chips on the right list every weapon you carry. Tap one to equip it.',
          setup: (c) => c.lane(1),
          demo: (c) => c.at(1.2, 's', () => c.g.weapons.switchTo('shotgun')),
          update: (c) => c.g.weapons.cur === 'shotgun',
        },
        {
          id: 'shotfire', gesture: 'tap', need: 1, demoLen: 4,
          text: 'The shotgun fires 8 pellets — devastating up close. Blast the close target.',
          intro: 'Shotgun: huge damage at short range, slow reload. Perfect for brutes and soldiers.',
          setup: (c) => { c.lane(1); c.dummy(LANE_X[1], 14, false); },
          demo: (c, t) => { c.fillAmmo(); c.at(1, 'a', () => c.g.weapons.tapFire()); c.at(2, 'b', () => c.g.weapons.tapFire()); void t; },
          update: (c) => { c.fillAmmo(); return c.kills >= 1; },
        },
        {
          id: 'backrifle', gesture: 'tap', spot: 'weapons', demoLen: 3.2,
          text: 'Switch to the RIFLE — fast, accurate automatic fire.',
          intro: 'Different weapons suit different threats. The rifle is the best all-rounder.',
          setup: (c) => c.lane(1),
          demo: (c) => c.at(1.2, 's', () => c.g.weapons.switchTo('rifle')),
          update: (c) => c.g.weapons.cur === 'rifle',
        },
        {
          id: 'riflefire', gesture: 'tap', need: 2, demoLen: 4.6,
          text: 'Hold SHOOT — the rifle fires automatically. Destroy the 2 targets.',
          intro: 'Hold the button and the rifle keeps firing until the magazine is empty.',
          setup: (c) => { c.lane(1); c.dummy(LANE_X[1], 26, false); c.dummy(LANE_X[2], 32, true); },
          demo: (c, t) => { c.fillAmmo(); tap(c, t); },
          update: (c) => { c.fillAmmo(); c.prog = c.kills; return c.kills >= 2; },
        },
        {
          id: 'types', info: true, spot: 'weapons',
          text: 'Weapon types: Pistol – reliable sidearm · Rifle – full-auto · SMG – huge fire rate · Shotgun – close range · Sniper – piercing shots · Plasma – splash damage · Rocket – big blasts · Laser – continuous beam.',
          setup: (c) => c.lane(1),
        },
      ],
    },
    /* ------------------------------ 6 · ammunition ----------------------------- */
    {
      title: 'Ammunition',
      blurb: 'Reload, collect ammo and understand capacity.',
      steps: [
        {
          id: 'drain', gesture: 'tap', spot: 'ammo', demoLen: 4.4,
          text: 'Fire at the targets until your magazine runs low.',
          intro: 'Every shot uses one round. Keep an eye on the AMMO counter.',
          setup: (c) => { c.ensureWeapon('rifle'); const s = c.g.weapons.slot(); s.mag = 8; s.reserve = 24; c.keepDummies(2, true); },
          demo: (c, t) => { c.keepDummies(2, true); tap(c, t); },
          update: (c) => { c.keepDummies(2, true); return c.g.weapons.slot().mag <= 2; },
        },
        {
          id: 'reload', gesture: 'tap', spot: 'ammo', demoLen: 3.6,
          text: 'Tap the RELOAD (⟳) button to refill the magazine.',
          intro: 'Reloading takes a moment and uses reserve ammo. Weapons also reload on their own when empty.',
          setup: (c) => { c.ensureWeapon('rifle'); const s = c.g.weapons.slot(); s.mag = 2; s.reserve = 20; c.v.saw = 0; },
          demo: (c) => c.at(1.0, 'r', () => c.g.weapons.reload()),
          update: (c) => { if (c.g.weapons.reloading) c.v.saw = 1; return c.v.saw === 1 && !c.g.weapons.reloading; },
        },
        {
          id: 'box', gesture: 'collect', spot: 'ammo', demoLen: 4.4,
          text: 'Collect the yellow AMMO box to refill your reserve.',
          intro: 'Ammo boxes restock your weapons. Your reserve is capped, so don\'t waste them when full.',
          setup: (c) => {
            c.lane(1);
            c.ensureWeapon('rifle');
            c.g.weapons.slot().reserve = 4;
            c.v.r0 = 4;
            c.pickupAhead('ammo', 2, 34);
            c.respawn = () => c.pickupAhead('ammo', 2, 34);
          },
          demo: (c) => c.at(0.3, 'l', () => c.p.setLane(2)),
          update: (c) => c.g.weapons.slot().reserve > c.v.r0,
        },
        {
          id: 'cap', info: true, spot: 'ammo',
          text: 'Magazine capacity differs per weapon: Pistol 12 · Rifle 30 · SMG 40 · Shotgun 6 · Sniper 5 · Rocket 2. Reserve ammo is limited too — switch weapons when one runs dry.',
          setup: (c) => c.lane(1),
        },
      ],
    },
    /* -------------------------------- 7 · health ------------------------------- */
    {
      title: 'Health',
      blurb: 'Take a hit, heal up and learn the 100 HP cap.',
      steps: [
        {
          id: 'damage', info: true, spot: 'health',
          text: 'Ouch! You took a hit — your health (top left) is now 55 / 100. In real runs, enemies and obstacles drain this bar; at 0 your run ends. (Training damage is just a demo.)',
          setup: (c) => { c.lane(1); c.p.health = 55; c.g.damageFlash = 1; c.g.audio.hurt(); c.g.shake(0.5); },
        },
        {
          id: 'kit', gesture: 'collect', spot: 'health', demoLen: 4.4,
          text: 'Collect the GREEN health kit (+30 HP).',
          intro: 'Health kits are green. Run through one to heal.',
          setup: (c) => { c.lane(1); c.pickupAhead('health', 2, 34, undefined, 1); c.respawn = () => c.pickupAhead('health', 2, 34, undefined, 1); },
          demo: (c) => c.at(0.3, 'l', () => c.p.setLane(2)),
          update: (c) => c.p.health > 55,
        },
        {
          id: 'cap', gesture: 'collect', spot: 'health', demoLen: 4.4,
          text: 'Collect the LARGE kit (+50). Your health can never go above exactly 100 HP.',
          intro: 'You have 85 HP now. A +50 kit would make 135 — but the maximum is a hard 100 HP.',
          setup: (c) => { c.lane(1); c.pickupAhead('health', 1, 34, undefined, 2); c.respawn = () => c.pickupAhead('health', 1, 34, undefined, 2); },
          update: (c) => c.p.health >= 100,
        },
        {
          id: 'sizes', info: true, spot: 'health',
          text: 'Kit sizes: small +15 · standard +30 · large +50. The lower your health, the more often kits appear — and a kit at full health is worth nothing, so grab them when you need them.',
          setup: (c) => c.lane(1),
        },
      ],
    },
    /* ------------------------------- 8 · currency ------------------------------ */
    {
      title: 'Currency',
      blurb: 'Alien Bucks, Alien Gems and what they do.',
      steps: [
        {
          id: 'coins', gesture: 'collect', need: 3, spot: 'bucks', demoLen: 5,
          text: 'Run through the 3 gold coins to collect Alien Bucks (◆).',
          intro: 'Gold coins are Alien Bucks. Collect them as you run. (Practice coins are not added to your account.)',
          setup: (c) => {
            c.lane(1);
            c.v.p0 = c.g.stats.pickups;
            const spawn = () => { for (let i = 0; i < 3; i++) c.pickupAhead('buck', 1, 28 + i * 9); };
            spawn();
            c.respawn = () => { for (let i = 0; i < Math.max(0, 3 - (c.g.stats.pickups - c.v.p0)); i++) c.pickupAhead('buck', 1, 28 + i * 9); };
          },
          update: (c) => { c.prog = Math.min(3, c.g.stats.pickups - c.v.p0); return c.prog >= 3; },
        },
        {
          id: 'bucks', info: true, spot: 'bucks',
          text: 'ALIEN BUCKS ◆ — the standard currency. Earn them from coins, alien kills, destroyed ships, challenges and achievements. Spend them in the Shop on weapons, equipment, characters and upgrades.',
          setup: (c) => c.lane(1),
        },
        {
          id: 'gems', info: true,
          text: 'ALIEN GEMS 💎 — the premium currency for exclusive items. They are bought with real money and are never required to play. This training never asks you to buy anything.',
          setup: (c) => c.lane(1),
        },
      ],
    },
    /* --------------------------- 9 · pickups & equipment ----------------------- */
    {
      title: 'Pickups & Equipment',
      blurb: 'Shields, grenades and temporary abilities.',
      steps: [
        {
          id: 'shield', gesture: 'collect', demoLen: 4.4,
          text: 'Collect the CYAN energy shield.',
          intro: 'The energy shield absorbs hits for a few seconds.',
          setup: (c) => { c.lane(1); c.p.eq.pshield = 0; c.pickupAhead('shield', 2, 34); c.respawn = () => c.pickupAhead('shield', 2, 34); },
          demo: (c) => c.at(0.3, 'l', () => c.p.setLane(2)),
          update: (c) => c.p.eq.pshield > 0,
        },
        {
          id: 'grenade', gesture: 'collect', demoLen: 4.4,
          text: 'Collect the GRENADES.',
          intro: 'Grenades blast everything in an area.',
          setup: (c) => { c.lane(1); c.g.weapons.grenades = 0; c.pickupAhead('grenade', 1, 34); c.respawn = () => c.pickupAhead('grenade', 1, 34); },
          demo: () => undefined,
          update: (c) => c.g.weapons.grenades > 0,
        },
        {
          id: 'throw', gesture: 'tap', demoLen: 4,
          text: 'Tap the GRENADE button (💣) to throw one at the target.',
          intro: 'Tap 💣 and your character lobs a grenade at the nearest threat.',
          setup: (c) => { c.lane(1); c.g.weapons.grenades = Math.max(2, c.g.weapons.grenades); c.v.g0 = c.g.weapons.grenades; c.dummy(LANE_X[1], 26, false); },
          demo: (c) => c.at(1.0, 'g', () => c.g.weapons.throwGrenade()),
          update: (c) => c.g.weapons.grenades < c.v.g0,
        },
        {
          id: 'dash', gesture: 'tap', spot: 'abilities', demoLen: 3.6,
          text: 'Tap the ⚡ ENERGY DASH button to activate your ability.',
          intro: 'Abilities spend ENERGY (purple bar). Energy Dash blasts you forward with brief invulnerability.',
          setup: (c) => { c.lane(1); c.p.energy = 100; },
          demo: (c) => c.at(1.0, 'd', () => c.g.useAbility('dash')),
          update: (c) => { c.p.energy = Math.max(c.p.energy, 25); return c.p.dashT > 0; },
        },
        {
          id: 'temp', info: true, spot: 'abilities',
          text: 'Temporary abilities cost energy: Dash, Bullet Time, Companion Drone, Phase Shield and Pulse (unlock more in the Shop). Speed boosts, jump boots and magnetic gloves are temporary pickups too.',
          setup: (c) => c.lane(1),
        },
      ],
    },
    /* ----------------------------- 10 · traversal ------------------------------ */
    {
      title: 'Environmental Traversal',
      blurb: 'Ramps, ropes, ziplines, grappling hooks, vaulting and climbing.',
      steps: [
        {
          id: 'rope', gesture: 'up', demoLen: 8.5,
          text: 'Run up the ramp, JUMP at its end to grab the rope — then tap JUMP again at the top of the swing to release.',
          intro: 'The ramp launches you. Jump at the very end, grab the rope, swing, and let go at the top of the arc.',
          setup: (c, demo) => { if (demo) c.spawnGap('rope', 40); },
          demo: (c) => c.autoTraverse(),
          update: (c) => c.traverseStep('ropes', 'rope'),
        },
        {
          id: 'zip', gesture: 'up', demoLen: 8.5,
          text: 'Ramp up, JUMP to grab the zipline and ride it across the gap.',
          intro: 'Jump into the zipline handle to grab it. It carries you across the pit automatically.',
          setup: (c, demo) => { if (demo) c.spawnGap('zip', 40); },
          demo: (c) => c.autoTraverse(),
          update: (c) => c.traverseStep('zips', 'zip'),
        },
        {
          id: 'grapple', gesture: 'tap', demoLen: 8,
          text: 'Tap the 🪝 GRAPPLE button when it pulses to hook the anchor and fly across.',
          intro: 'Grappling hooks pull you to the cyan anchor rings above the gap. Tap the 🪝 button while the ring is in range.',
          setup: (c, demo) => { c.p.eq.grapple = 2; if (demo) c.spawnGap('grapple', 36); },
          demo: (c) => c.autoTraverse(true),
          update: (c) => { c.p.eq.grapple = Math.max(c.p.eq.grapple, 1); return c.traverseStep('grapples', 'grapple'); },
        },
        {
          id: 'vault', gesture: 'none', demoLen: 4.2,
          text: 'Run straight at the low wall — you vault over it automatically.',
          intro: 'Low walls and rails are vaulted without a swipe, as long as you keep running.',
          setup: (c, demo) => { c.lane(1); if (demo) c.spawnVaultWalls(30); },
          update: (c) => c.traverseStep('vaults', 'wall'),
        },
        {
          id: 'climb', gesture: 'up', demoLen: 4.4,
          text: 'JUMP onto the crate to climb up, then run off the other side.',
          intro: 'Crates, car roofs and truck beds can be climbed. Jump onto them to gain height.',
          setup: (c, demo) => { c.lane(1); c.v.t0 = c.g.stats.traversals; if (demo) c.spawnCrates(30); },
          demo: (c) => {
            for (const o of c.g.obstacles.list) {
              const dz = c.p.z - o.box.z1;
              if (o.type === 'crate' && dz < 7.2 && dz > 3 && c.p.grounded) c.g.jump();
            }
          },
          update: (c) => {
            if (c.v.sp === undefined) {
              c.v.sp = 1;
              c.v.t0 = c.g.stats.traversals;
              c.spawnCrates(34);
            }
            const cr = c.g.obstacles.list.find((o) => o.type === 'crate' && !o.spent);
            if (cr) {
              const dz = c.p.z - cr.box.z1;
              c.cue = dz < 9 && dz > 5.2 ? 'JUMP NOW!' : '';
            }
            if (c.hit) {
              c.hit = false;
              c.fail('Jump a little earlier to land on top of the crate.');
              c.g.obstacles.reset();
              c.v.sp = undefined as unknown as number;
            }
            return c.g.stats.traversals > c.v.t0;
          },
        },
      ],
    },
    /* ------------------------------ 11 · alien combat -------------------------- */
    {
      title: 'Alien Combat',
      blurb: 'Fight ground and flying aliens and dodge their fire.',
      steps: [
        {
          id: 'ground', gesture: 'tap', demoLen: 5.4,
          text: 'A Soldier is ahead. Shoot it down before it shoots you!',
          intro: 'Soldiers hold their ground and fire energy bolts. Aim-assist locks on — just keep firing.',
          setup: (c) => { c.lane(1); c.enemy('soldier', 2, 40, 0.6); },
          demo: (c, t) => { c.fillAmmo(); tap(c, t); },
          update: (c) => { c.fillAmmo(); return c.g.enemies.count('soldier') === 0 && c.t > 1; },
        },
        {
          id: 'dodge', gesture: 'left', need: 3, demoLen: 6,
          text: 'Enemy bolts fly down your lane! SWIPE to dodge 3 shots — don\'t shoot, just dodge.',
          intro: 'Bolts travel along a lane. Swipe left or right one lane to get out of the way.',
          setup: (c) => { c.lane(1); c.enemy('soldier', 2, 42, 80); },
          demo: (c) => { c.at(1.6, 'a', () => c.g.moveLane(-1)); c.at(3.4, 'b', () => c.g.moveLane(1)); c.at(5.0, 'c', () => c.g.moveLane(-1)); },
          update: (c) => {
            c.prog = Math.min(3, c.prog + c.passedBolts());
            if (c.hit) { c.hit = false; c.fail('That one would have hurt! Swipe out of the bolt\'s lane sooner.'); }
            return c.prog >= 3;
          },
        },
        {
          id: 'flying', gesture: 'tap', demoLen: 5,
          text: 'Flying Drones hover above the road. Shoot the drone down!',
          intro: 'Drones fire from the air. Your shots reach them — keep your weapon pointed at the sky.',
          setup: (c) => { c.lane(1); c.enemy('drone', 1, 38, 0.6); },
          demo: (c, t) => { c.fillAmmo(); tap(c, t); },
          update: (c) => { c.fillAmmo(); return c.g.enemies.count('drone') === 0 && c.t > 1; },
        },
        {
          id: 'types', info: true,
          text: 'Know your enemy: Scouts rush you · Soldiers shoot · Brutes charge (change lanes!) · Drones fly · Hunters pounce · Snipers show a RED laser before they shoot · Commanders summon reinforcements.',
          setup: (c) => c.lane(1),
        },
      ],
    },
    /* ---------------------------- 12 · spacecraft combat ------------------------ */
    {
      title: 'Spacecraft Combat',
      blurb: 'Board a fighter, fly, shoot, repair, fight a mothership and eject.',
      steps: [
        {
          id: 'brief', info: true,
          text: 'A one-person FIGHTER waits on a landing pad. Run into it to board. In the air: DRAG anywhere to fly, hold FIRE to shoot lasers, MISSILE for homing missiles and EJECT to escape. Your hull has 100 integrity.',
          setup: (c) => c.lane(1),
        },
        {
          id: 'board', gesture: 'none', noDemo: true,
          text: 'Run into the parked fighter on the pad to board it.',
          setup: (c) => { c.lane(1); c.g.flight.spawnPad(0, c.p.z - 46); },
          update: (c) => c.g.mode === 'air',
        },
        {
          id: 'steer', gesture: 'right', noDemo: true, need: 3,
          text: 'Fly! SWIPE or DRAG to steer up, down, left and right — fly through the 3 green rings.',
          update: (c) => {
            const f = c.g.flight;
            if (f.phase !== 'fly') return false;
            if (!c.v.s) {
              c.v.s = 1;
              f.ringsPassed = 0;
              f.ringsMissed = 0;
              f.spawnRings([
                { x: f.x + 12, y: f.y + 8, rel: 80 }, { x: f.x - 10, y: f.y - 6, rel: 145 }, { x: f.x + 4, y: f.y + 10, rel: 210 },
              ]);
            }
            c.prog = f.ringsPassed;
            if (f.ringsMissed > 0) {
              c.fail('Missed a ring — steer through the middle of the green rings.');
              c.v.s = 0;
            }
            return f.ringsPassed >= 3;
          },
        },
        {
          id: 'laser', gesture: 'tap', noDemo: true, need: 3,
          text: 'Hold FIRE (or tap the screen) to shoot lasers. Destroy the 3 target drones.',
          update: (c) => {
            const f = c.g.flight;
            f.energy = 100;
            if (!c.v.s) {
              c.v.s = 1;
              c.v.k0 = f.kills;
              f.spawnEnemy('target', f.x - 12, f.y + 4, 90, 90);
              f.spawnEnemy('target', f.x, f.y - 4, 96, 96);
              f.spawnEnemy('target', f.x + 12, f.y + 6, 90, 90);
            }
            c.prog = f.kills - c.v.k0;
            return c.prog >= 3;
          },
        },
        {
          id: 'enemies', gesture: 'none', noDemo: true, need: 3,
          text: 'Enemy spacecraft attack from every side! Destroy 3 of them — and dodge their red bolts.',
          update: (c) => {
            const f = c.g.flight;
            f.energy = Math.max(f.energy, 60);
            const live = f.enemies.filter((e) => !e.dead).length;
            if (!c.v.s || (live === 0 && f.kills - c.v.k0 < 3)) {
              if (!c.v.s) c.v.k0 = f.kills;
              c.v.s = 1;
              const left = 3 - (f.kills - c.v.k0);
              if (left > 0) f.spawnEnemy('interceptor', f.x - 50, f.y + 2, 70);
              if (left > 1) f.spawnEnemy('interceptor', f.x + 48, f.y - 3, 80);
              if (left > 2) f.spawnEnemy('gunship', f.x + 6, f.y + 4, 120);
            }
            c.prog = Math.min(3, f.kills - c.v.k0);
            return f.kills - c.v.k0 >= 3;
          },
        },
        {
          id: 'hull', gesture: 'collect', noDemo: true,
          text: 'Your hull took damage (top left). Sparks ≤75, smoke ≤50, alarms ≤30, EJECT warning ≤15. Collect the green REPAIR kit!',
          update: (c) => {
            const f = c.g.flight;
            if (!c.v.s) {
              c.v.s = 1;
              f.setHull(52);
              f.spawnPickup('health', f.x + 5, f.y + 2, f.z - 80);
            }
            if (f.pickups.length === 0 && f.hull < 80) {
              f.spawnPickup('health', f.x + 4, f.y + 1, f.z - 70);
            }
            return f.hull >= 80;
          },
        },
        {
          id: 'mother', gesture: 'tap', noDemo: true,
          text: 'The MOTHERSHIP! Shoot its glowing engines, turrets and reactor core — tap MISSILE for homing missiles. Destroy it!',
          update: (c) => {
            const f = c.g.flight;
            f.energy = 100;
            if (!c.v.s) {
              c.v.s = 1;
              f.missiles = f.missileCap;
              f.spawnBoss({ hp: 520, passive: true });
            }
            if (f.missiles < 2) f.missiles = f.missileCap;
            return f.bossDown;
          },
        },
        {
          id: 'eject', gesture: 'tap', noDemo: true,
          text: 'EMERGENCY EJECTION: tap EJECT (twice if your hull is healthy). The pilot launches clear while the fighter crashes — eject now to land safely!',
          update: (c) => c.g.mode === 'ground' && c.g.flight.landed,
        },
      ],
    },
  ];
}
