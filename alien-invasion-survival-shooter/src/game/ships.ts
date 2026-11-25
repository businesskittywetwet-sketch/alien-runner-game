import * as THREE from 'three';
import type { Game } from './game';
import { LANE_X } from './config';
import { basic, BOX, CONE, CYL, glowMat, makeShip, mesh, PLANE } from './models';
import { newBox, rand, setBox, type Box, type Target, type V3 } from './util';

export type ShipKind = 'scout' | 'fighter' | 'transport' | 'bomber';

const DEF: Record<ShipKind, { hp: number; hw: number; hh: number; hl: number; score: number; name: string }> = {
  scout: { hp: 90, hw: 2.4, hh: 1.0, hl: 2.4, score: 250, name: 'Scout Ship' },
  fighter: { hp: 140, hw: 3.4, hh: 1.0, hl: 2.6, score: 350, name: 'Fighter' },
  transport: { hp: 300, hw: 4.2, hh: 1.8, hl: 7, score: 600, name: 'Transport' },
  bomber: { hp: 240, hw: 4.8, hh: 1.5, hl: 3.2, score: 500, name: 'Bomber' },
};

export class Ship implements Target {
  kind = 'ship' as const;
  dead = false;
  box: Box = newBox();
  vx = 0;
  vz = 0;
  type: ShipKind;
  hp: number;
  maxHp: number;
  group: THREE.Group;
  lights: THREE.MeshBasicMaterial[];
  x = 0;
  y = 14;
  z = 0;
  rel = 150;
  prevRel = 150;
  holdRel = 30;
  t = 0;
  flash = 0;
  life: number;
  leaving = false;
  shootT = 2;
  drops = 0;
  dropT = 3;
  detect = 0;
  alarmed = false;
  spotX = 0;
  spot: THREE.Mesh | null = null;
  ph = Math.random() * 6;
  private mgr: Ships;
  constructor(mgr: Ships, type: ShipKind) {
    this.mgr = mgr;
    this.type = type;
    this.hp = this.maxHp = DEF[type].hp;
    const s = makeShip(type);
    this.group = s.group;
    this.lights = s.lights;
    this.life = type === 'transport' ? 40 : 24;
  }
  hurt(dmg: number, p: V3, _from?: string) {
    void _from;
    if (this.dead) return;
    this.hp -= dmg;
    this.flash = 0.1;
    this.mgr.g.fx.sparks(p, 0xffc080, 3, 5);
    if (this.hp <= 0) this.mgr.destroy(this);
  }
}

interface Marker {
  x: number;
  z: number;
  t: number;
  dur: number;
  mesh: THREE.Mesh;
}
interface Beam {
  x: number;
  z: number;
  t: number;
  tele: number;
  col: THREE.Mesh;
  ring: THREE.Mesh;
  fired: boolean;
}

export class Ships {
  g: Game;
  list: Ship[] = [];
  group = new THREE.Group();
  markers: Marker[] = [];
  beams: Beam[] = [];
  spotGeo: THREE.BufferGeometry;
  spotMat = new THREE.MeshBasicMaterial({ color: 0xd8ffd0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  constructor(g: Game) {
    this.g = g;
    g.scene.add(this.group);
    this.spotGeo = new THREE.ConeGeometry(3.3, 1, 18, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
  }

  reset() {
    for (const s of this.list) this.group.remove(s.group);
    this.list.length = 0;
    for (const m of this.markers) this.group.remove(m.mesh);
    this.markers.length = 0;
    for (const b of this.beams) this.group.remove(b.col, b.ring);
    this.beams.length = 0;
  }

  count(type?: ShipKind) {
    let n = 0;
    for (const s of this.list) if (!s.dead && !s.leaving && (!type || s.type === type)) n++;
    return n;
  }

  spawn(type: ShipKind) {
    const g = this.g;
    const s = new Ship(this, type);
    const p = g.player;
    s.x = rand(-14, 14);
    s.rel = 170;
    s.prevRel = 170;
    s.holdRel = { scout: 24, fighter: 52, transport: 70, bomber: 30 }[type];
    s.y = { scout: 14, fighter: 11, transport: 24, bomber: 19 }[type];
    s.z = p.z - s.rel;
    s.spotX = p.x;
    if (type === 'scout') {
      s.spot = new THREE.Mesh(this.spotGeo, this.spotMat);
      this.group.add(s.spot);
    }
    this.group.add(s.group);
    this.list.push(s);
    g.audio.screech();
    g.toast(`${DEF[type].name} inbound!`, 'bad');
    return s;
  }

  destroy(s: Ship) {
    if (s.dead) return;
    const g = this.g;
    s.dead = true;
    this.group.remove(s.group);
    if (s.spot) this.group.remove(s.spot);
    const c = { x: s.x, y: s.y, z: s.z };
    g.fx.explosion(c, 2.4, 0xff9a40);
    g.fx.explosion({ x: c.x + 2, y: c.y - 1, z: c.z - 2 }, 1.6, 0x40e0ff);
    g.audio.explosion(true);
    g.shake(0.9);
    g.stats.ships++;
    g.addScore(DEF[s.type].score);
    g.toast(`${DEF[s.type].name} destroyed!  +${DEF[s.type].score}`, 'good');
    g.player.energy = Math.min(100, g.player.energy + 10);
    g.director.dropLoot(s.x, s.z, 'ship');
    // wreckage falls on the street
    g.fx.explosion({ x: LANE_X[Math.floor(Math.random() * 4)], y: 0.5, z: s.z }, 0.9, 0xff6a30);
  }

  marker(x: number, z: number, dur: number) {
    const m = mesh(CYL, basic(0xff2a1a, { add: true, opacity: 0.45 }), 4.2, 0.03, 4.2, x, 0.08, z);
    this.group.add(m);
    this.markers.push({ x, z, t: 0, dur, mesh: m });
  }

  beamStrike(lane: number) {
    const g = this.g;
    const p = g.player;
    const x = LANE_X[lane];
    const z = p.z - p.fwd * 1.5;
    const col = mesh(CYL, basic(0xff3366, { add: true, opacity: 0.0 }), 3.0, 140, 3.0, x, 70, z);
    const ring = mesh(PLANE, basic(0xff2a4a, { add: true, opacity: 0.5 }), 3.4, 11, 1, x, 0.09, z);
    ring.rotation.x = -Math.PI / 2;
    this.group.add(col, ring);
    this.beams.push({ x, z, t: 0, tele: 1.5, col, ring, fired: false });
    g.audio.beamCharge();
  }

  update(dt: number) {
    const g = this.g;
    const p = g.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      if (s.dead) {
        this.list.splice(i, 1);
        continue;
      }
      s.t += dt;
      s.flash = Math.max(0, s.flash - dt);
      const d = DEF[s.type];
      s.prevRel = s.rel;
      if (s.t > s.life) s.leaving = true;
      if (s.leaving) {
        s.rel += 55 * dt;
        s.y += 7 * dt;
      } else {
        s.rel += (s.holdRel + Math.sin(s.t * 0.6 + s.ph) * (s.type === 'scout' ? 5 : 8) - s.rel) * Math.min(1, dt * (s.t < 4 ? 1.2 : 2));
      }
      s.z = p.z - s.rel;
      s.vz = -p.fwd - (s.rel - s.prevRel) / Math.max(dt, 0.001);
      s.vx = 0;

      switch (s.type) {
        case 'scout': {
          // search for the player with a spotlight
          const lag = s.alarmed ? 0 : 3.2;
          s.spotX += Math.max(-lag * dt, Math.min(lag * dt, p.x - s.spotX));
          s.x += (s.spotX * 0.6 - s.x) * Math.min(1, dt * 1.5);
          s.y = 14 + Math.sin(s.t * 1.2) * 0.8;
          if (s.spot) {
            const gx = s.spotX;
            const gz = p.z - 5;
            s.spot.position.set(s.x, s.y - 0.5, s.z);
            const len = Math.hypot(gx - s.x, s.y, gz - s.z);
            s.spot.scale.set(1, 1, len);
            s.spot.lookAt(gx, 0, gz);
            const inBeam = Math.abs(p.x - gx) < 2.3 && !s.alarmed && !s.leaving;
            if (inBeam) s.detect += dt;
            else s.detect = Math.max(0, s.detect - dt * 0.8);
            this.spotMat.color.setHex(s.detect > 0.2 ? 0xffb0a0 : 0xd8ffd0);
            if (s.detect > 1.6 && !s.alarmed) {
              s.alarmed = true;
              g.toast('SPOTTED! Reinforcements incoming', 'bad');
              g.audio.alert();
              g.audio.screech();
              g.director.callReinforcements();
              s.life = Math.min(s.life, s.t + 4);
            }
          }
          break;
        }
        case 'fighter': {
          s.x += (Math.sin(s.t * 0.9 + s.ph) * 13 - s.x) * Math.min(1, dt * 3);
          s.y = 11 + Math.sin(s.t * 1.7) * 1.2;
          s.group.rotation.z = -(Math.cos(s.t * 0.9 + s.ph) * 0.5);
          s.shootT -= dt;
          if (s.shootT <= 0 && !s.leaving && s.rel < 90) {
            s.shootT = 3.2;
            s.drops = 3;
            s.dropT = 0;
          }
          if (s.drops > 0) {
            s.dropT -= dt;
            if (s.dropT <= 0) {
              s.dropT = 0.22;
              s.drops--;
              const o = { x: s.x, y: s.y - 0.5, z: s.z + 2 };
              g.weapons.leadPlayer(o, 52, 1.0, tmp);
              g.weapons.enemyBolt(o, tmp, 52, 9, 0xff4d6d, 0.5);
              g.audio.tone(700, 0.1, 'sawtooth', 0.05, 250);
            }
          }
          break;
        }
        case 'transport': {
          s.x += (Math.sin(s.t * 0.3 + s.ph) * 6 - s.x) * Math.min(1, dt * 2);
          s.y = 24 + Math.sin(s.t * 0.8) * 0.8;
          s.dropT -= dt;
          if (s.dropT <= 0 && s.drops < 4 && !s.leaving && s.rel < 95) {
            s.dropT = 4;
            s.drops++;
            const lane = Math.floor(Math.random() * 4);
            g.enemies.spawn(Math.random() < 0.5 ? 'scout' : 'soldier', lane, s.z, { y: s.y - 2, fall: true });
            g.fx.ring({ x: LANE_X[lane], y: s.y - 2, z: s.z }, 0x9affd0, 3);
            g.audio.alert();
          }
          if (s.drops >= 4 && !s.leaving) s.life = Math.min(s.life, s.t + 3);
          break;
        }
        case 'bomber': {
          s.x += (p.x * 0.5 - s.x) * Math.min(1, dt * 1.5);
          s.y = 19 + Math.sin(s.t) * 0.6;
          s.dropT -= dt;
          if (s.dropT <= 0 && !s.leaving && s.rel < 70) {
            s.dropT = Math.max(2.3, 3.6 - g.intensity() * 1.0);
            const lane = p.lane;
            const bx = LANE_X[lane];
            const flight = 1.5;
            const bz = p.z - p.fwd * flight;
            this.marker(bx, bz, flight);
            g.weapons.addBomb(bx, 19.5, bz, 19.5 / flight);
            // slightly stagger the second lane when intense
            if (g.intensity() > 0.55 && Math.random() < 0.6) {
              const l2 = Math.max(0, Math.min(3, lane + (Math.random() < 0.5 ? -1 : 1)));
              this.marker(LANE_X[l2], bz - 4, flight);
              g.weapons.addBomb(LANE_X[l2], 19.5, bz - 4, 19.5 / flight);
            }
          }
          break;
        }
      }

      s.group.position.set(s.x, s.y, s.z);
      s.group.rotation.y = s.type === 'fighter' ? 0 : s.group.rotation.y;
      // hit flash on lights
      if (s.flash > 0) for (const m of s.lights) m.color.setHex(0xffffff);
      else s.lights.forEach((m, k) => m.color.setHex(s.alarmed ? (k % 2 ? 0xff2a2a : 0xffffff) : [0x76ff9a, 0xffffff, 0xff4d6d, 0xffb347, 0x9affd0][k % 5] as number));
      setBox(s.box, s.x, s.y - d.hh, s.z, d.hw, d.hh * 2, d.hl);
      if (s.rel > 190 && s.leaving) {
        this.group.remove(s.group);
        if (s.spot) this.group.remove(s.spot);
        this.list.splice(i, 1);
      }
    }

    // bomb markers
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.t += dt;
      const k = m.t / m.dur;
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.35 * Math.abs(Math.sin(m.t * 10));
      m.mesh.scale.set(4.2 - k * 1.2, 0.03, 4.2 - k * 1.2);
      if (m.t >= m.dur + 0.1) {
        this.group.remove(m.mesh);
        this.markers.splice(i, 1);
      }
    }

    // mothership beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += dt;
      const colMat = b.col.material as THREE.MeshBasicMaterial;
      const ringMat = b.ring.material as THREE.MeshBasicMaterial;
      if (b.t < b.tele) {
        const f = b.t / b.tele;
        colMat.opacity = 0.05 + 0.1 * Math.abs(Math.sin(b.t * 14)) * f;
        ringMat.opacity = 0.25 + 0.5 * Math.abs(Math.sin(b.t * 12));
        b.col.scale.x = b.col.scale.z = 0.4;
      } else {
        if (!b.fired) {
          b.fired = true;
          g.audio.beamFire();
          g.shake(0.8);
          g.fx.explosion({ x: b.x, y: 0.5, z: b.z }, 1.2, 0xff3366);
          if (Math.abs(p.x - b.x) < 1.8 && Math.abs(p.z - b.z) < 5.5 && p.y < 60) p.hurt(34, true);
        }
        const k = (b.t - b.tele) / 0.45;
        colMat.opacity = Math.max(0, 0.85 * (1 - k));
        b.col.scale.x = b.col.scale.z = 3.2 * (1 - k * 0.5);
        ringMat.opacity = Math.max(0, 0.9 * (1 - k));
        if (k >= 1) {
          this.group.remove(b.col, b.ring);
          this.beams.splice(i, 1);
        }
      }
    }
    void BOX;
    void CONE;
    void glowMat;
  }
}
const tmp = new THREE.Vector3();
