import * as THREE from 'three';
import type { Game } from './game';
import { basic, box, BOX, lam, mesh, SPH, glowMat } from './models';
import type { Crossing, Obst } from './obstacles';
import { clamp } from './util';

interface Item {
  z: number;
  objs: THREE.Object3D[];
  used: boolean;
}
export interface Rope extends Item {
  x: number;
  ay: number;
  len: number;
  pivot: THREE.Group;
  cord: THREE.Mesh;
}
export interface Zip extends Item {
  bar: boolean;
  x: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  trolley: THREE.Mesh;
}
export interface Ladder extends Item {
  x: number;
  top: number;
  wall: Obst;
}

type Cur =
  | { type: 'rope'; rope: Rope; len: number; theta: number; omega: number; t: number }
  | { type: 'zip'; zip: Zip; s: number; t: number }
  | { type: 'ladder'; lad: Ladder; t: number; y0: number }
  | { type: 'grapple'; hx: number; hy: number; hz: number; sx: number; sy: number; sz: number; s: number; c: Crossing }
  | { type: 'zipl'; ex: number; ey: number; ez: number; sx: number; sy: number; sz: number; s: number; c: Crossing };

const HAND = 1.72;

export class Traversal {
  g: Game;
  ropes: Rope[] = [];
  zips: Zip[] = [];
  ladders: Ladder[] = [];
  cur: Cur | null = null;
  prompt = '';
  line: THREE.Mesh;
  v = new THREE.Vector3();

  constructor(g: Game) {
    this.g = g;
    this.line = mesh(BOX, basic(0x80ffff), 0.07, 0.07, 1);
    this.line.visible = false;
    g.scene.add(this.line);
  }

  reset() {
    for (const it of [...this.ropes, ...this.zips, ...this.ladders]) for (const o of it.objs) this.g.obstacles.group.remove(o);
    this.ropes.length = 0;
    this.zips.length = 0;
    this.ladders.length = 0;
    this.cur = null;
    this.line.visible = false;
    this.prompt = '';
  }

  /* ------------------------------- builders ------------------------------- */
  addRope(x: number, z: number, ay = 8.6, len = 5.2): Rope {
    const pivot = new THREE.Group();
    pivot.position.set(x, ay, z);
    const cord = mesh(BOX, lam(0xcdb27a, 0x2a2010, 1), 0.09, 1, 0.09, 0, -len / 2, 0);
    cord.scale.y = len;
    const handle = box(0.7, 0.14, 0.14, basic(0xffc400), 0, -len, 0);
    const knob = mesh(SPH, glowMat(0xffc400, 0.5), 0.9, 0.9, 0.9, 0, -len, 0);
    pivot.add(cord, handle, knob);
    this.g.obstacles.group.add(pivot);
    const r: Rope = { z, objs: [pivot], used: false, x, ay, len, pivot, cord };
    this.ropes.push(r);
    return r;
  }

  addZip(x: number, z0: number, z1: number, y0 = 3.8, y1 = 1.9, bar = false): Zip {
    const objs: THREE.Object3D[] = [];
    const dz = z1 - z0;
    const dy = y1 - y0;
    const L = Math.hypot(dz, dy);
    const lineM = mesh(BOX, basic(bar ? 0xffc400 : 0xe0e6ee), bar ? 0.14 : 0.05, bar ? 0.14 : 0.05, L, x, (y0 + y1) / 2, (z0 + z1) / 2);
    lineM.rotation.x = Math.atan2(-dy, -dz) * 0 + Math.atan2(dy, -dz) * -1; // pitch so +z end points down-slope
    lineM.lookAt(x, y1, z1);
    objs.push(lineM);
    for (const [zz, yy] of [[z0, y0], [z1, y1]] as const)
      for (const s of [-1, 1]) {
        objs.push(box(0.3, yy + 0.8, 0.3, lam(0x3b414c), x + s * 1.55, (yy + 0.8) / 2, zz));
      }
    for (const [zz, yy] of [[z0, y0], [z1, y1]] as const) objs.push(box(3.4, 0.22, 0.3, lam(0x3b414c), x, yy + 0.7, zz));
    const trolley = box(bar ? 0.9 : 0.5, 0.16, 0.2, basic(0xffee58), x, y0 + 0.02, z0);
    objs.push(trolley);
    if (bar) {
      objs.push(box(0.12, 0.12, L, lam(0x3b414c), x, y0 + 1.25, (z0 + z1) / 2));
      const n = Math.floor(L / 4);
      for (let i = 0; i <= n; i++) objs.push(box(0.1, 1.25, 0.1, lam(0x3b414c), x, y0 + 0.62, z0 + (dz * i) / n));
    }
    objs.push(mesh(SPH, glowMat(0xffee58, 0.4), 1.4, 1.4, 1.4, x, y0, z0));
    for (const o of objs) this.g.obstacles.group.add(o);
    const zp: Zip = { z: z0, objs, used: false, bar, x, z0, z1, y0, y1, trolley };
    this.zips.push(zp);
    return zp;
  }

  addLadder(x: number, zFront: number, top: number, wall: Obst, mdl: THREE.Object3D) {
    mdl.position.set(x, 0, zFront + 0.08);
    this.g.obstacles.group.add(mdl);
    this.ladders.push({ z: zFront, objs: [mdl], used: false, x, top, wall });
  }

  /* ------------------------------- helpers -------------------------------- */
  get active() {
    return this.cur !== null;
  }
  reach() {
    return this.g.player.eq.gloves > 0 ? { rx: 2.1, rz: 2.3, ry: 1.2 } : { rx: 1.3, rz: 1.35, ry: 0 };
  }

  findCrossing(forGrapple: boolean): Crossing | null {
    const p = this.g.player;
    let best: Crossing | null = null;
    for (const c of this.g.obstacles.crossings) {
      if (forGrapple ? c.hookZ < p.z - 3 && c.hookZ > p.z - 62 : c.z1 < p.z - 6 && c.z0 > p.z - 72) {
        if (!best || c.z0 > best.z0) best = c;
      }
    }
    return best;
  }

  useGrapple() {
    const g = this.g;
    const p = g.player;
    if (p.state !== 'run') return;
    if (p.eq.grapple <= 0) return g.toast('No grappling hook — find a pickup', 'bad');
    const c = this.findCrossing(true);
    if (!c) return g.toast('No grapple point in range', 'bad');
    p.eq.grapple--;
    p.state = 'grapple';
    p.grounded = false;
    p.sliding = false;
    this.cur = { type: 'grapple', hx: p.x, hy: c.hookY, hz: c.hookZ, sx: p.x, sy: p.y + HAND, sz: p.z, s: 0, c };
    g.audio.grapple();
  }
  useZipLauncher() {
    const g = this.g;
    const p = g.player;
    if (p.state !== 'run') return;
    if (p.eq.zip <= 0) return g.toast('No zipline launcher — find a pickup', 'bad');
    const c = this.findCrossing(false);
    if (!c) return g.toast('No anchor point in range', 'bad');
    p.eq.zip--;
    p.state = 'zipl';
    p.grounded = false;
    p.sliding = false;
    this.cur = { type: 'zipl', ex: p.x, ey: 1.9, ez: c.z1 - 3, sx: p.x, sy: p.y + HAND, sz: p.z, s: 0, c };
    g.audio.zip();
    g.toast('Zipline deployed!', 'good');
  }

  onJumpPress() {
    const c = this.cur;
    if (!c) return;
    const p = this.g.player;
    if (c.type === 'rope' && c.t > 0.22) this.releaseRope(c);
    else if (c.type === 'zip' && c.t > 0.22) {
      p.release(c.zip.bar ? 21 : 19, 6.5);
      this.finishZip(c, false);
    }
  }

  private releaseRope(c: Extract<Cur, { type: 'rope' }>) {
    const g = this.g;
    const p = g.player;
    const sp = c.len * c.omega;
    let fwd = sp * Math.cos(c.theta) * 1.25 + 5.5;
    const vy = clamp(sp * Math.sin(c.theta) * 1.1 + 6, 4, 16);
    if (c.theta > 0.5 && c.theta < 1.05) {
      fwd += 4.5;
      g.toast('PERFECT RELEASE!', 'good');
      g.addScore(100);
    }
    fwd = clamp(fwd, 15, 35);
    c.rope.pivot.rotation.x = 0;
    c.rope.used = true;
    p.release(fwd, vy);
    g.addTraversal('Rope Swing', 'ropes');
    g.audio.swoosh();
    this.cur = null;
  }
  private finishZip(c: Extract<Cur, { type: 'zip' }>, complete: boolean) {
    c.zip.used = true;
    c.zip.trolley.position.set(c.zip.x, c.zip.y0 + 0.02, c.zip.z0);
    this.g.addTraversal(c.zip.bar ? 'Hanging Bar' : 'Zipline', c.zip.bar ? 'ropes' : 'zips');
    void complete;
    this.cur = null;
  }

  private setLine(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const L = this.line;
    this.v.set(bx - ax, by - ay, bz - az);
    const len = this.v.length();
    L.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    L.scale.set(0.07, 0.07, len);
    L.lookAt(bx, by, bz);
    L.visible = true;
  }

  /* ------------------------------- update -------------------------------- */
  update(dt: number) {
    const g = this.g;
    const p = g.player;
    this.prompt = '';
    this.line.visible = false;

    // prune
    for (const arr of [this.ropes, this.zips, this.ladders] as Item[][])
      for (let i = arr.length - 1; i >= 0; i--)
        if (arr[i].z > p.z + 50) {
          for (const o of arr[i].objs) g.obstacles.group.remove(o);
          arr.splice(i, 1);
        }

    const c = this.cur;
    if (c) {
      p.hangLean = 0;
      switch (c.type) {
        case 'rope': {
          c.t += dt;
          const r = c.rope;
          c.omega += -(26 / c.len) * Math.sin(c.theta) * dt;
          c.omega *= 1 - 0.12 * dt;
          c.theta += c.omega * dt;
          r.pivot.rotation.x = c.theta;
          r.cord.scale.y = c.len;
          r.cord.position.y = -c.len / 2;
          p.setPose(r.x, r.ay - c.len * Math.cos(c.theta) - HAND, r.pivot.position.z - c.len * Math.sin(c.theta));
          p.hangLean = c.theta;
          p.fwd = Math.max(0, c.len * c.omega * Math.cos(c.theta));
          if (c.theta > 1.25 || (c.omega < 0 && c.theta > 0.25 && c.t > 0.3)) this.releaseRope(c);
          this.prompt = 'JUMP to release — time it for distance!';
          break;
        }
        case 'zip': {
          c.t += dt;
          const z = c.zip;
          const L = Math.hypot(z.z1 - z.z0, z.y1 - z.y0);
          c.s += ((z.bar ? 21 : 22) * dt) / L;
          const s = Math.min(1, c.s);
          const hz = z.z0 + (z.z1 - z.z0) * s;
          const hy = z.y0 + (z.y1 - z.y0) * s;
          p.setPose(z.x, hy - HAND, hz);
          p.fwd = z.bar ? 21 : 22;
          p.hangLean = z.bar ? Math.sin(c.t * 5) * 0.08 : -0.12;
          z.trolley.position.set(z.x, hy + 0.02, hz);
          if (c.s >= 1) {
            p.release(z.bar ? 22 : 22, z.bar ? 5 : 1);
            this.finishZip(c, true);
          }
          this.prompt = 'JUMP to drop';
          break;
        }
        case 'ladder': {
          c.t += dt;
          const k = Math.min(1, c.t / 0.7);
          p.setPose(c.lad.x, c.y0 + (c.lad.top - c.y0) * k, c.lad.z + 0.5);
          p.fwd = 0;
          if (k >= 1) {
            p.state = 'run';
            p.setPose(c.lad.x, c.lad.top, c.lad.z - 0.7);
            p.grounded = true;
            p.vy = 0;
            p.fwd = 12;
            p.lane = p.nearestLane();
            c.lad.used = true;
            g.addTraversal('Ladder Climb', 'ladders');
            this.cur = null;
          }
          this.prompt = 'Climbing...';
          break;
        }
        case 'grapple': {
          const dist = Math.hypot(c.hx - c.sx, c.hy - c.sy, c.hz - c.sz);
          c.s += ((22 + c.s * 50) * dt) / dist;
          const s = Math.min(1, c.s);
          const hx = c.sx + (c.hx - c.sx) * s, hy = c.sy + (c.hy - c.sy) * s, hz = c.sz + (c.hz - c.sz) * s;
          p.setPose(hx, hy - HAND, hz);
          p.fwd = 30;
          p.hangLean = -0.2;
          this.setLine(hx, hy, hz, c.hx, c.hy, c.hz);
          g.fx.trail({ x: hx, y: hy, z: hz }, 0x40ffff, 0.5);
          if (c.s >= 1) {
            p.x = c.hx;
            p.release(28, 3);
            g.addTraversal('Grappling Hook', 'grapples');
            g.fx.ring({ x: c.hx, y: c.hy, z: c.hz }, 0x40ffff, 3);
            this.cur = null;
          }
          break;
        }
        case 'zipl': {
          const dist = Math.hypot(c.ex - c.sx, c.ey - c.sy, c.ez - c.sz);
          c.s += (26 * dt) / dist;
          const s = Math.min(1, c.s);
          const hx = c.sx + (c.ex - c.sx) * s, hy = c.sy + (c.ey - c.sy) * s - Math.sin(s * Math.PI) * 0.8, hz = c.sz + (c.ez - c.sz) * s;
          p.setPose(hx, hy - HAND, hz);
          p.fwd = 26;
          p.hangLean = -0.12;
          this.setLine(c.sx, c.sy + 2, c.sz, c.ex, c.ey + 0.2, c.ez);
          if (c.s >= 1) {
            p.release(22, 0);
            g.addTraversal('Zipline Launcher', 'zips');
            this.cur = null;
          }
          break;
        }
      }
      return;
    }

    if (p.state !== 'run') return;

    /* ---- detect grabs ---- */
    const hx = p.x, hy = p.y + HAND, hz = p.z;
    const { rx, rz, ry } = this.reach();
    if (!p.grounded && p.grabCooldown <= 0) {
      for (const r of this.ropes) {
        if (r.used) continue;
        if (Math.abs(hx - r.x) < rx && Math.abs(hz - r.z) < rz && hy > r.ay - r.len - 0.7 - ry && hy < r.ay - 0.9 + ry) {
          const dz = hz - r.z, dy = hy - r.ay;
          const len = clamp(Math.hypot(dz, dy), 3.4, r.len + 0.4);
          const theta = clamp(Math.atan2(-dz, -dy), -0.9, 0.9);
          let om = (p.fwd * Math.cos(theta) + p.vy * Math.sin(theta)) / len;
          om = clamp(om, 8 / len, 13.5 / len);
          p.state = 'rope';
          p.sliding = false;
          this.cur = { type: 'rope', rope: r, len, theta, omega: om, t: 0 };
          g.audio.grab();
          g.toast('Rope grabbed!', 'good');
          return;
        }
      }
      for (const z of this.zips) {
        if (z.used) continue;
        const inZ = z.bar ? hz < z.z0 + 0.6 && hz > z.z1 + 4 : hz < z.z0 + 1.5 && hz > z.z0 - rz - 0.8;
        if (Math.abs(hx - z.x) < rx && inZ && hy > z.y0 - 1.3 - ry && hy < z.y0 + 1.7 + ry) {
          p.state = 'zip';
          p.sliding = false;
          this.cur = { type: 'zip', zip: z, s: 0, t: 0 };
          if (z.bar) {
            // start at the current position along the bar
            this.cur.s = clamp((z.z0 - hz) / Math.abs(z.z1 - z.z0), 0, 0.9);
          }
          g.audio.grab();
          g.audio.zip();
          g.toast(z.bar ? 'Hanging on the bar!' : 'Zipline!', 'good');
          return;
        }
      }
    }
    for (const l of this.ladders) {
      if (l.used) continue;
      if (Math.abs(p.x - l.x) < 1.05 && p.z < l.z + 2.6 && p.z > l.z - 0.2 && p.y < 2.2) {
        p.state = 'ladder';
        p.sliding = false;
        p.grounded = false;
        p.vy = 0;
        this.cur = { type: 'ladder', lad: l, t: 0, y0: p.y };
        g.audio.grab();
        return;
      }
    }

    /* ---- prompts ---- */
    let best = '';
    let bd = 22;
    const consider = (z: number, x: number, text: string, w = 1.9) => {
      const d = p.z - z;
      if (d > -2 && d < bd && Math.abs(p.x - x) < w) {
        bd = d;
        best = text;
      }
    };
    for (const r of this.ropes) if (!r.used) consider(r.z, r.x, 'JUMP to grab the rope');
    for (const z of this.zips) if (!z.used) consider(z.z0, z.x, z.bar ? 'JUMP to grab the bar' : 'JUMP to grab the zipline');
    for (const l of this.ladders) if (!l.used) consider(l.z, l.x, 'Run into the ladder to CLIMB');
    if (!best) {
      for (const o of g.obstacles.list) {
        if (o.ramp && !o.spent) consider(o.ramp.zStart, (o.box.x0 + o.box.x1) / 2, 'RAMP — JUMP at the end!', 1.9);
      }
    }
    if (!best) {
      const gc = this.findCrossing(true);
      if (gc && gc.z0 - p.z > -60) {
        const t: string[] = [];
        if (p.eq.grapple > 0) t.push('Tap 🪝 to grapple');
        if (p.eq.zip > 0) t.push('Tap ➰ for zipline');
        if (t.length) best = t.join('  •  ');
      }
    }
    this.prompt = best;
  }
}
