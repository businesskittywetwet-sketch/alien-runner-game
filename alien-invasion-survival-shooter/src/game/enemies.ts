import * as THREE from 'three';
import type { Game } from './game';
import { ENEMIES, LANE_X, type EnemyDef, type EnemyType } from './config';
import { basic, box, flashHumanoid, makeAlien, makeAlienGun, makeDroneMesh, PLANE, type Humanoid, mesh, glowMat, SPH } from './models';
import { boxOverlap, clamp, newBox, rand, setBox, type Box, type Target, type V3 } from './util';

const _v = new THREE.Vector3();

const BLOOD: Record<EnemyType, number> = {
  scout: 0x7dff6a, soldier: 0xb06bff, brute: 0xff6a3a, drone: 0xff4d6d, hunter: 0x30e0d0, sniper: 0x40e0ff, commander: 0xffd54f,
};

export class Enemy implements Target {
  kind = 'enemy' as const;
  dead = false;
  box: Box = newBox();
  vx = 0;
  vz = 0;
  type: EnemyType;
  def: EnemyDef;
  hp: number;
  maxHp: number;
  hum: Humanoid | null = null;
  drone: { group: THREE.Group; ring: THREE.Mesh } | null = null;
  root = new THREE.Group();
  x: number;
  y = 0;
  z: number;
  lane: number;
  t = Math.random() * 10;
  flash = 0;
  deadT = 0;
  shootT: number;
  charge = 0;
  hitCd = 0;
  laneT = 0;
  state = 'idle';
  side = 0;
  perchY = 0;
  rel = 0;
  summonT = 6;
  life = 0;
  lock = new THREE.Vector3();
  sightT = 0;
  burst = 0;
  hpBar: THREE.Mesh | null = null;
  hpBg: THREE.Mesh | null = null;
  scale = 1;
  base = 0;
  vy = 0;
  gun: THREE.Group | null = null;
  fall = false;
  low = false;
  private mgr: Enemies;

  constructor(mgr: Enemies, type: EnemyType, x: number, z: number, hpMul = 1) {
    this.mgr = mgr;
    this.type = type;
    this.def = ENEMIES[type];
    this.hp = this.maxHp = Math.round(this.def.hp * hpMul);
    this.x = x;
    this.z = z;
    this.lane = Math.max(0, LANE_X.findIndex((l) => Math.abs(l - x) < 0.1));
    this.shootT = 1 + Math.random() * 1.2;
    if (type === 'drone') {
      this.drone = makeDroneMesh();
      this.root.add(this.drone.group);
      this.low = Math.random() < 0.4; // low-flying drones must be slid under
      this.y = this.low ? 1.5 : 3.2;
      this.base = this.low ? 1.5 : 3.0 + Math.random() * 0.8;
    } else {
      this.hum = makeAlien(type);
      this.root.add(this.hum.root);
      this.hum.root.rotation.y = Math.PI;
      this.base = this.hum.body.position.y;
      if (type === 'soldier' || type === 'sniper' || type === 'commander') {
        this.gun = makeAlienGun(type === 'soldier' ? 0xc16bff : type === 'sniper' ? 0x40e0ff : 0xffd54f, type === 'sniper' ? 1.6 : type === 'commander' ? 1.4 : 1);
        this.gun.rotation.x = -Math.PI / 2;
        this.hum.hand.add(this.gun);
      }
    }
    this.root.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (mm.isMesh) mm.castShadow = true;
    });
    if (this.def.hp >= 100) {
      this.hpBg = mesh(PLANE, basic(0x220000), 1.4, 0.12, 1);
      this.hpBar = mesh(PLANE, basic(type === 'commander' ? 0xffd54f : 0xff4d4d), 1.4, 0.12, 1);
      this.hpBar.position.z = 0.01;
      const hp = new THREE.Group();
      hp.position.y = this.def.h + 0.6;
      hp.add(this.hpBg, this.hpBar);
      this.root.add(hp);
    }
    this.sync();
  }

  hurt(dmg: number, p: V3, from?: string) {
    if (this.dead) return;
    void from;
    this.hp -= dmg;
    this.flash = 0.12;
    if (this.type !== 'brute' && this.type !== 'commander' && this.type !== 'sniper' && dmg < 200) this.z -= 0.2;
    if (this.hp <= 0) this.mgr.kill(this, p);
  }

  sync() {
    const d = this.def;
    const cy = this.drone ? this.y - 0.45 : this.y;
    setBox(this.box, this.x, cy, this.z, d.r, d.h, d.r * 0.9);
    this.root.position.set(this.x, this.y, this.z);
  }
}

export class Enemies {
  g: Game;
  list: Enemy[] = [];
  group = new THREE.Group();
  commander: Enemy | null = null;
  sightMat = basic(0xff2a2a, { add: true, opacity: 0.75 });
  sights: THREE.Mesh[] = [];

  constructor(g: Game) {
    this.g = g;
    g.scene.add(this.group);
  }

  reset() {
    for (const e of this.list) this.group.remove(e.root);
    this.list.length = 0;
    this.commander = null;
    for (const s of this.sights) s.visible = false;
  }

  count(type?: EnemyType) {
    let n = 0;
    for (const e of this.list) if (!e.dead && (!type || e.type === type)) n++;
    return n;
  }

  spawn(type: EnemyType, lane: number, z: number, opts: { y?: number; fall?: boolean; side?: number; hpMul?: number } = {}): Enemy {
    const x = opts.side ? opts.side * 10.6 : LANE_X[lane];
    const e = new Enemy(this, type, x, z, opts.hpMul ?? 1 + Math.min(1.2, this.g.player.z / -9000));
    if (opts.y !== undefined) e.y = opts.y;
    if (opts.fall) {
      e.fall = true;
      e.state = 'drop';
    }
    if (type === 'sniper' && opts.side) {
      e.side = opts.side;
      e.perchY = opts.y ?? 12;
      e.y = e.perchY;
      e.hum!.root.rotation.y = opts.side > 0 ? Math.PI / 2 : -Math.PI / 2;
      e.root.add(box(5, 0.6, 5, new THREE.MeshLambertMaterial({ color: 0x23262e }), 0, -0.3, 0));
      e.root.add(mesh(SPH, glowMat(0x40e0ff, 0.5), 1, 1, 1, 0, 1, 0));
    }
    if (type === 'commander') {
      this.commander = e;
      e.rel = 55;
      e.state = 'boss';
      this.g.audio.screech();
    }
    this.group.add(e.root);
    this.list.push(e);
    e.sync();
    return e;
  }

  kill(e: Enemy, p: V3) {
    if (e.dead) return;
    const g = this.g;
    e.dead = true;
    e.deadT = 0.55;
    g.stats.kills++;
    g.addScore(e.def.score);
    g.player.energy = Math.min(100, g.player.energy + (e.type === 'commander' ? 40 : 3));
    g.audio.kill();
    g.fx.explosion({ x: e.x, y: e.y + e.def.h / 2, z: e.z }, e.type === 'brute' ? 1.1 : e.type === 'commander' ? 1.6 : 0.5, BLOOD[e.type]);
    g.fx.sparks(p, BLOOD[e.type], 10, 7);
    if (e.type === 'commander') {
      g.stats.bosses++;
      g.toast('ALIEN COMMANDER DOWN!', 'good');
      g.audio.fanfare();
      g.director.bossDown();
      this.commander = null;
      g.shake(1);
    }
    g.director.onKill(e);
  }

  private shoot(e: Enemy, speed: number, dmg: number, color: number, aimY: number, spread = 0) {
    const g = this.g;
    const o = { x: e.x, y: e.y + (e.drone ? 0 : e.def.h * 0.6), z: e.z + 0.9 };
    g.weapons.leadPlayer(o, speed, aimY, _v);
    _v.x += spread;
    g.weapons.enemyBolt(o, _v, speed, dmg, color, e.type === 'commander' ? 0.7 : 0.5);
    g.audio.tone(e.type === 'drone' ? 900 : 300, 0.12, 'sawtooth', 0.06, e.type === 'drone' ? 400 : 120);
    g.fx.muzzle(o, color, 0.9);
  }

  update(dt: number) {
    const g = this.g;
    const p = g.player;
    const cmdAlive = this.commander && !this.commander.dead;
    const fireMul = cmdAlive ? 0.7 : 1;
    let sightIdx = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt);
      e.hitCd = Math.max(0, e.hitCd - dt);
      if (e.dead) {
        e.deadT -= dt;
        const k = Math.max(0, e.deadT / 0.55);
        e.root.scale.setScalar(Math.max(0.01, k));
        e.root.rotation.z += dt * 8;
        e.root.position.y += dt * 2;
        if (e.deadT <= 0) {
          this.group.remove(e.root);
          this.list.splice(i, 1);
        }
        continue;
      }
      const dz = p.z - e.z; // >0 : enemy ahead of player
      const dx = p.x - e.x;
      e.life += dt;
      switch (e.type) {
        case 'scout': {
          if (e.state === 'drop') {
            e.vy -= 28 * dt;
            e.y = Math.max(0, e.y + e.vy * dt);
            if (e.y <= 0) {
              e.state = 'run';
              e.vy = 0;
              g.fx.dust({ x: e.x, y: 0, z: e.z }, 4);
            }
          }
          e.vz = e.state === 'drop' ? 0 : 9;
          e.z += e.vz * dt;
          e.laneT -= dt;
          if (e.laneT <= 0 && dz < 45 && dz > 12) {
            e.laneT = 99;
            e.lane = Math.random() < 0.65 ? p.lane : clamp(e.lane + (Math.random() < 0.5 ? -1 : 1), 0, 3);
          }
          e.x += (LANE_X[e.lane] - e.x) * Math.min(1, dt * 7);
          break;
        }
        case 'soldier': {
          if (e.state === 'drop') {
            e.vy -= 28 * dt;
            e.y = Math.max(0, e.y + e.vy * dt);
            if (e.y <= 0) {
              e.state = 'run';
              e.vy = 0;
            }
          }
          e.vz = e.state === 'drop' ? 0 : dz > 28 ? 4.5 : 1.5;
          e.z += e.vz * dt;
          e.laneT -= dt;
          if (e.laneT <= 0) {
            e.laneT = rand(2, 3.5);
            e.lane = clamp(e.lane + (Math.random() < 0.5 ? -1 : 1), 0, 3);
          }
          e.x += (LANE_X[e.lane] - e.x) * Math.min(1, dt * 5);
          e.shootT -= dt;
          if (e.state !== 'drop' && dz > 14 && dz < 80) {
            if (e.shootT <= 0.35 && e.charge <= 0) e.charge = 0.35;
            if (e.charge > 0) {
              e.charge -= dt;
              g.fx.glow.emit(e.x, e.y + 1.3, e.z + 0.9, 0, 0, 0, 1, 0.5, 1, 0.5, 0.1, 0, 0, 0.9);
              if (e.charge <= 0) {
                this.shoot(e, 36, 10, 0xc16bff, 1.1);
                e.shootT = rand(1.5, 2.3) * fireMul;
              }
            }
          }
          break;
        }
        case 'brute': {
          const chargeNow = dz < 34;
          e.vz = chargeNow ? 10 : 5;
          if (chargeNow && e.state !== 'charge') {
            e.state = 'charge';
            g.audio.screech();
            g.toast('Brute charging!', 'bad');
          }
          e.z += e.vz * dt;
          if (chargeNow) {
            e.lane = p.lane === e.lane ? e.lane : e.lane;
            e.x += (LANE_X[e.lane] - e.x) * Math.min(1, dt * 3);
          }
          if (e.t % 0.45 < dt) g.shake(0.08);
          break;
        }
        case 'drone': {
          e.vz = 5;
          e.z += e.vz * dt;
          e.y = e.base + Math.sin(e.t * 2.4) * (e.low ? 0.1 : 0.4);
          const tx = LANE_X[e.lane] + Math.sin(e.t * 1.2) * 1.2;
          e.x += (tx - e.x) * Math.min(1, dt * 3);
          e.laneT -= dt;
          if (e.laneT <= 0) {
            e.laneT = rand(2, 4);
            e.lane = clamp(e.lane + (Math.random() < 0.5 ? -1 : 1), 0, 3);
          }
          e.shootT -= dt;
          if (e.shootT <= 0 && dz > 14 && dz < 70) {
            this.shoot(e, 32, 8, 0xff4d6d, 1.0);
            e.shootT = rand(1.8, 2.6) * fireMul;
          }
          if (e.drone) e.drone.ring.rotation.z += dt * 6;
          break;
        }
        case 'hunter': {
          e.laneT -= dt;
          if (e.laneT <= 0 && dz > 10) {
            e.laneT = 0.55;
            e.lane = p.lane;
          }
          e.vz = dz < 15 ? 20 : 11;
          if (dz < 11 && dz > 0 && e.state !== 'leap') {
            e.state = 'leap';
            e.vy = 8;
            g.audio.screech();
          }
          if (e.state === 'leap') {
            e.vy -= 24 * dt;
            e.y = Math.max(0, e.y + e.vy * dt);
            if (e.y <= 0) e.state = 'land';
          }
          e.z += e.vz * dt;
          e.x += (LANE_X[e.lane] - e.x) * Math.min(1, dt * 9);
          break;
        }
        case 'sniper': {
          e.vz = 0;
          e.shootT -= dt;
          if (e.state === 'aim') {
            e.sightT -= dt;
            const s = this.sight(sightIdx++);
            _v.set(e.x, e.y + 1.4, e.z);
            s.position.set((e.x + e.lock.x) / 2, (_v.y + e.lock.y) / 2, (e.z + e.lock.z) / 2);
            const len = Math.hypot(e.x - e.lock.x, _v.y - e.lock.y, e.z - e.lock.z);
            s.scale.set(0.07, 0.07, len);
            s.lookAt(e.lock.x, e.lock.y, e.lock.z);
            s.visible = true;
            if (e.sightT <= 0) {
              const o = { x: e.x, y: e.y + 1.4, z: e.z };
              g.weapons.enemyBolt(o, e.lock, 85, 22, 0x40e0ff, 0.6);
              g.audio.tone(200, 0.3, 'sawtooth', 0.12, 60);
              e.state = 'idle';
              e.shootT = rand(3, 4.2) * fireMul;
            }
          } else if (e.shootT <= 0 && dz > 25 && dz < 90) {
            e.state = 'aim';
            e.sightT = 1.0;
            g.weapons.leadPlayer({ x: e.x, y: e.y + 1.4, z: e.z }, 85, 1.0, e.lock);
            g.audio.alert();
          }
          break;
        }
        case 'commander': {
          this.updateCommander(e, dt, fireMul);
          break;
        }
      }

      // contact with the player
      if (e.def.contact > 0 && e.hitCd <= 0 && e.state !== 'drop' && p.state !== 'dead') {
        e.sync();
        if (boxOverlap(e.box, p.getBox())) {
          if (p.dashT > 0) {
            e.hurt(200, { x: e.x, y: e.y + 1, z: e.z }, 'dash');
          } else if (p.state === 'run') {
            const hit = p.hurt(e.def.contact, e.type === 'brute');
            e.hitCd = 1.2;
            if (hit) {
              g.audio.explosion();
              if (e.type === 'scout') this.kill(e, { x: e.x, y: 1, z: e.z });
              else if (e.type === 'brute') g.shake(1);
            }
          }
        }
      }

      this.animate(e, dt, dz, dx);
      e.sync();
      // cleanup
      if (e.z > p.z + 14 || (e.type === 'commander' && e.rel > 160)) {
        if (e === this.commander) this.commander = null;
        this.group.remove(e.root);
        this.list.splice(i, 1);
      }
    }
    for (let i = sightIdx; i < this.sights.length; i++) this.sights[i].visible = false;
  }

  private sight(i: number) {
    while (this.sights.length <= i) {
      const m = mesh(box(1, 1, 1, this.sightMat).geometry, this.sightMat, 0.07, 0.07, 1);
      m.visible = false;
      this.group.add(m);
      this.sights.push(m);
    }
    return this.sights[i];
  }

  private updateCommander(e: Enemy, dt: number, fireMul: number) {
    const g = this.g;
    const p = g.player;
    const enraged = e.hp < e.maxHp * 0.5;
    if (e.life > 55) e.rel += 40 * dt; // flees
    else e.rel += (50 + Math.sin(e.t * 0.7) * 6 - e.rel) * Math.min(1, dt * 2);
    e.z = p.z - e.rel;
    e.vz = -p.fwd;
    e.laneT -= dt;
    if (e.laneT <= 0) {
      e.laneT = enraged ? 1.4 : 2.2;
      e.lane = Math.floor(Math.random() * 4);
    }
    e.x += (LANE_X[e.lane] - e.x) * Math.min(1, dt * 4);
    e.shootT -= dt;
    if (e.shootT <= 0 && e.life < 55) {
      e.shootT = (enraged ? 1.6 : 2.4) * fireMul;
      this.shoot(e, 38, 12, 0xffd54f, 1.0, 0);
      this.shoot(e, 38, 12, 0xffd54f, 1.0, -2.2);
      this.shoot(e, 38, 12, 0xffd54f, 1.0, 2.2);
      if (enraged) {
        this.shoot(e, 42, 12, 0xff7043, 1.0, -4.4);
        this.shoot(e, 42, 12, 0xff7043, 1.0, 4.4);
      }
    }
    e.summonT -= dt;
    if (e.summonT <= 0 && e.life < 50) {
      e.summonT = enraged ? 6 : 9;
      g.toast('Commander calls reinforcements!', 'bad');
      g.audio.alert();
      for (let i = 0; i < 3; i++) this.spawn(i === 2 ? 'soldier' : 'scout', Math.floor(Math.random() * 4), e.z + 4 + i * 3, { hpMul: 1 });
    }
  }

  private animate(e: Enemy, dt: number, dz: number, dx: number) {
    void dx;
    if (e.flash > 0 && e.hum) flashHumanoid(e.hum, 1.4);
    else if (e.hum) flashHumanoid(e.hum, 0);
    if (e.hpBar && e.hpBg) {
      const k = Math.max(0.001, e.hp / e.maxHp);
      e.hpBar.scale.x = 1.4 * k;
      e.hpBar.position.x = -0.7 * (1 - k);
    }
    if (!e.hum) {
      e.root.rotation.z = clamp((LANE_X[e.lane] - e.x) * -0.1, -0.3, 0.3);
      return;
    }
    const h = e.hum;
    const sp = e.type === 'brute' ? 8 : e.type === 'hunter' ? 15 : e.type === 'scout' ? 17 : 9;
    const sw = Math.sin(e.t * sp);
    const aimAng = Math.PI / 2 - 0.1;
    h.body.position.y = e.base + Math.abs(Math.cos(e.t * sp)) * 0.06;
    switch (e.type) {
      case 'scout':
        h.legL.rotation.x = sw * 1.1;
        h.legR.rotation.x = -sw * 1.1;
        h.armL.rotation.x = -sw * 1.2 + 0.5;
        h.armR.rotation.x = sw * 1.2 + 0.5;
        h.body.rotation.x = -0.35;
        break;
      case 'soldier':
      case 'commander':
        h.legL.rotation.x = sw * 0.6;
        h.legR.rotation.x = -sw * 0.6;
        h.armR.rotation.x = aimAng + (e.charge > 0 ? 0.25 : 0);
        h.armL.rotation.x = aimAng - 0.3;
        h.body.rotation.x = 0;
        break;
      case 'brute':
        h.legL.rotation.x = sw * 0.8;
        h.legR.rotation.x = -sw * 0.8;
        h.armL.rotation.x = e.state === 'charge' ? 2.6 + sw * 0.4 : -sw * 0.7;
        h.armR.rotation.x = e.state === 'charge' ? 2.6 - sw * 0.4 : sw * 0.7;
        h.body.rotation.x = -0.15;
        break;
      case 'hunter':
        if (e.state === 'leap') {
          h.legL.rotation.x = 1.2;
          h.legR.rotation.x = 1.0;
          h.armL.rotation.x = 2.8;
          h.armR.rotation.x = 2.8;
          h.body.rotation.x = -0.5;
        } else {
          h.legL.rotation.x = sw * 1.3;
          h.legR.rotation.x = -sw * 1.3;
          h.armL.rotation.x = sw * 1.4;
          h.armR.rotation.x = -sw * 1.4;
          h.body.rotation.x = -0.55;
        }
        break;
      case 'sniper':
        h.legL.rotation.x = 0.1;
        h.legR.rotation.x = -0.1;
        h.armR.rotation.x = aimAng;
        h.armL.rotation.x = aimAng - 0.2;
        h.body.rotation.x = e.state === 'aim' ? -0.1 : 0;
        // face player when aiming
        break;
    }
    void dz;
    void dt;
  }
}
