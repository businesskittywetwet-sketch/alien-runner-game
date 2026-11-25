import * as THREE from 'three';
import type { Game } from './game';
import { LANE_X } from './config';
import type { Target, V3 } from './util';
import type { Player } from './player';

export interface Ramp {
  zStart: number;
  zEnd: number;
  h0: number;
  h1: number;
}

export interface Obst extends Target {
  kind: 'obst';
  type: string;
  label?: string;
  mesh?: THREE.Object3D;
  walk: boolean;
  hurtAmt: number;
  contact: 'hurt' | 'vault' | 'explode' | 'crater' | 'timed' | 'none';
  hp: number;
  shootable: boolean;
  aim: boolean;
  explosive: boolean;
  heavy: boolean;
  ramp?: Ramp;
  gap: boolean;
  active: boolean;
  spent: boolean;
  passed: boolean;
  landed?: boolean;
  vaulted?: boolean;
  fly: { vx: number; vy: number; vz: number; t: number } | null;
  hitCd: number;
  avoidable: boolean;
  onUpdate?: (o: Obst, dt: number, t: number) => void;
  onDestroy?: (o: Obst) => void;
}

export interface Crossing {
  z0: number; // start (higher z)
  z1: number; // end
  hookZ: number;
  hookY: number;
  kind: string;
  objs: THREE.Object3D[];
}

export interface MakeOpts {
  y0?: number;
  walk?: boolean;
  hurt?: number;
  contact?: Obst['contact'];
  hp?: number;
  shootable?: boolean;
  aim?: boolean;
  explosive?: boolean;
  heavy?: boolean;
  ramp?: Ramp;
  gap?: boolean;
  active?: boolean;
  label?: string;
  avoidable?: boolean;
  place?: boolean;
  onUpdate?: Obst['onUpdate'];
}

export class Obstacles {
  g: Game;
  list: Obst[] = [];
  crossings: Crossing[] = [];
  group = new THREE.Group();
  sup = { h: 0, o: null as Obst | null };
  tmp: Target[] = [];

  constructor(g: Game) {
    this.g = g;
    g.scene.add(this.group);
  }

  reset() {
    for (const o of this.list) if (o.mesh) this.group.remove(o.mesh);
    this.list.length = 0;
    for (const c of this.crossings) for (const m of c.objs) this.group.remove(m);
    this.crossings.length = 0;
  }

  make(type: string, x: number, z: number, w: number, l: number, h: number, mesh: THREE.Object3D | undefined, o: MakeOpts = {}): Obst {
    const y0 = o.y0 ?? 0;
    const ob: Obst = {
      kind: 'obst', type, label: o.label,
      box: { x0: x - w / 2, x1: x + w / 2, y0, y1: y0 + h, z0: z - l / 2, z1: z + l / 2 },
      mesh, walk: o.walk ?? false, hurtAmt: o.hurt ?? 20, contact: o.contact ?? 'hurt',
      hp: o.hp ?? Infinity, shootable: o.shootable ?? false, aim: o.aim ?? false, explosive: o.explosive ?? false,
      heavy: o.heavy ?? false, ramp: o.ramp, gap: o.gap ?? false, active: o.active ?? true,
      spent: false, passed: false, fly: null, hitCd: 0, dead: false, vx: 0, vz: 0,
      avoidable: o.avoidable ?? true, onUpdate: o.onUpdate,
      hurt: (d, p, from) => this.damage(ob, d, p, from),
    };
    if (mesh && o.place !== false) {
      mesh.position.set(x, mesh.position.y, z);
      this.group.add(mesh);
    } else if (mesh) this.group.add(mesh);
    if (mesh)
      mesh.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (mm.isMesh) {
          mm.castShadow = true;
          mm.receiveShadow = true;
        }
      });
    this.list.push(ob);
    return ob;
  }

  /* ------------------------------ queries ------------------------------- */
  support(x: number, z: number, feet: number) {
    let best = 0;
    let bo: Obst | null = null;
    let inGap = false;
    for (const o of this.list) {
      if (o.spent || o.dead) continue;
      const b = o.box;
      if (o.gap) {
        if (z > b.z0 + 0.05 && z < b.z1 - 0.05) inGap = true;
      } else if (o.ramp) {
        const r = o.ramp;
        if (z <= r.zStart && z >= r.zEnd && x >= b.x0 - 0.1 && x <= b.x1 + 0.1) {
          const t = (r.zStart - z) / (r.zStart - r.zEnd);
          const h = r.h0 + (r.h1 - r.h0) * t;
          if (h <= feet + 0.6 && h > best) {
            best = h;
            bo = o;
          }
        }
      } else if (o.walk) {
        if (x >= b.x0 - 0.2 && x <= b.x1 + 0.2 && z >= b.z0 - 0.1 && z <= b.z1 + 0.1 && b.y1 <= feet + 0.45 && b.y1 > best) {
          best = b.y1;
          bo = o;
        }
      }
    }
    this.sup.h = best === 0 && inGap ? -100 : best;
    this.sup.o = bo;
    return this.sup;
  }

  gapNear(z: number): Obst | null {
    for (const o of this.list) if (o.gap && z > o.box.z0 - 4 && z < o.box.z1 + 4) return o;
    return null;
  }

  free(x: number, z: number, r: number): boolean {
    for (const o of this.list) {
      if (o.dead) continue;
      const b = o.box;
      if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return false;
    }
    return true;
  }

  laneBlocked(lane: number, z0: number, z1: number): boolean {
    const lx = LANE_X[lane];
    for (const o of this.list) {
      if (o.dead || o.spent) continue;
      const b = o.box;
      if (lx + 1.4 > b.x0 && lx - 1.4 < b.x1 && z1 < b.z1 + 1 && z0 > b.z0 - 1) return true;
    }
    return false;
  }

  nextEnd(): number {
    let m = this.g.player.z;
    for (const o of this.list) m = Math.min(m, o.box.z0);
    return m;
  }

  targets(out: Target[]) {
    for (const o of this.list) if (o.shootable && !o.dead && !o.spent) out.push(o);
  }

  /* ------------------------------ collisions ------------------------------ */
  collide(p: Player) {
    if (p.state !== 'run') return;
    const g = this.g;
    for (const o of this.list) {
      if (o.spent || o.dead || o.gap || o.ramp || o.type === 'pad') continue;
      const b = o.box;
      if (p.z < b.z0 - 1 || p.z > b.z1 + 1) continue;
      if (p.x + 0.34 <= b.x0 || p.x - 0.34 >= b.x1) continue;
      if (p.z - 0.3 >= b.z1 || p.z + 0.3 <= b.z0) continue;
      if (o.contact === 'timed' && !o.active) continue;
      const py1 = p.y + p.h;
      if (p.y >= b.y1 - 0.02 || py1 <= b.y0 + 0.02) continue;
      if (o.walk && p.y >= b.y1 - 0.45) continue;
      if (o.contact === 'crater' && p.y > 0.45) continue;
      if (o.hitCd > 0) continue;

      if (p.dashT > 0) {
        this.smash(o);
        continue;
      }
      switch (o.contact) {
        case 'vault':
          if (!o.vaulted) {
            o.vaulted = true;
            p.vault();
            g.addTraversal('Vault', 'vaults');
          }
          break;
        case 'explode':
          this.explode(o);
          break;
        case 'none':
          break;
        default: {
          const hit = p.hurt(o.hurtAmt, true);
          if (o.contact === 'timed') {
            o.hitCd = 1.2;
          } else {
            o.spent = true;
            if (!o.heavy && o.mesh) o.fly = { vx: (Math.random() - 0.5) * 8 + (p.x - (b.x0 + b.x1) / 2) * -2, vy: 7, vz: 4 + Math.random() * 6, t: 0 };
            g.fx.explosion({ x: p.x, y: 1, z: p.z - 0.5 }, 0.5);
          }
          if (hit) g.audio.explosion();
        }
      }
    }
  }

  smash(o: Obst) {
    const g = this.g;
    if (o.explosive) return this.explode(o);
    o.spent = true;
    o.passed = true;
    if (o.mesh && !o.heavy) o.fly = { vx: (Math.random() - 0.5) * 18, vy: 10, vz: -14, t: 0 };
    g.fx.explosion({ x: (o.box.x0 + o.box.x1) / 2, y: 1, z: g.player.z - 0.5 }, 0.45, 0x80d8ff);
    g.audio.explosion();
    g.addScore(40);
  }

  explode(o: Obst) {
    if (o.dead) return;
    o.dead = true;
    const g = this.g;
    if (o.mesh) this.group.remove(o.mesh);
    const c = { x: (o.box.x0 + o.box.x1) / 2, y: 0.8, z: (o.box.z0 + o.box.z1) / 2 };
    g.explode(c.x, c.y, c.z, 5, 90, { player: true, playerDmg: 30 });
    g.stats.score += 25;
  }

  damage(o: Obst, d: number, p: V3, _from?: string) {
    void _from;
    if (!o.shootable || o.dead || o.spent) return;
    o.hp -= d;
    this.g.fx.sparks(p, o.type === 'barricade' ? 0xd66bff : 0xffd080, 5, 5);
    if (o.explosive) return this.explode(o);
    if (o.hp <= 0) {
      o.dead = true;
      if (o.mesh) this.group.remove(o.mesh);
      const c = { x: (o.box.x0 + o.box.x1) / 2, y: (o.box.y0 + o.box.y1) / 2, z: (o.box.z0 + o.box.z1) / 2 };
      this.g.fx.explosion(c, o.type === 'barricade' ? 1.4 : 0.7, o.type === 'barricade' ? 0xd66bff : 0xffa040);
      this.g.audio.explosion();
      this.g.shake(0.3);
      this.g.addScore(o.type === 'barricade' ? 150 : 30);
      this.g.toast(o.type === 'barricade' ? 'Barricade destroyed!' : 'Destroyed', 'good');
      o.onDestroy?.(o);
    }
  }

  /* -------------------------------- update -------------------------------- */
  update(dt: number) {
    const g = this.g;
    const pz = g.player.z;
    const t = g.time;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      o.hitCd = Math.max(0, o.hitCd - dt);
      if (o.fly && o.mesh) {
        const f = o.fly;
        f.t += dt;
        f.vy -= 28 * dt;
        o.mesh.position.x += f.vx * dt;
        o.mesh.position.y += f.vy * dt;
        o.mesh.position.z += f.vz * dt;
        o.mesh.rotation.z += f.vx * dt * 0.3;
        o.mesh.rotation.x += f.vz * dt * 0.2;
        if (f.t > 1.4) {
          this.group.remove(o.mesh);
          o.mesh = undefined;
          o.fly = null;
        }
      }
      o.onUpdate?.(o, dt, t);
      if (!o.passed && pz < o.box.z0 - 1.2) {
        o.passed = true;
        if (!o.spent && !o.dead && o.avoidable) g.stats.avoided++;
      }
      if (o.box.z1 > pz + 45 || (o.dead && o.box.z1 > pz + 10)) {
        if (o.mesh) this.group.remove(o.mesh);
        this.list.splice(i, 1);
      }
    }
    for (let i = this.crossings.length - 1; i >= 0; i--) {
      const c = this.crossings[i];
      if (c.z1 > pz + 45) {
        for (const m of c.objs) this.group.remove(m);
        this.crossings.splice(i, 1);
      }
    }
  }
}
