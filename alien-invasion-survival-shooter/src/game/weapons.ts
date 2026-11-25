import * as THREE from 'three';
import type { Game } from './game';
import { DRONES, SKINS, WEAPONS, WEAPON_ORDER, type WeaponId } from './config';
import { basic, BOX, glowMat, makeCompanion, mesh, SPH } from './models';
import { store } from './progress';
import { segBox, type Target, type V3 } from './util';

export interface Slot {
  mag: number;
  reserve: number;
}

interface Proj {
  owner: 'p' | 'e';
  kind: 'bullet' | 'plasma' | 'rocket' | 'grenade' | 'ebolt' | 'bomb';
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  dmg: number;
  life: number;
  pierce: number;
  splash: number;
  color: number;
  grav: number;
  mesh: THREE.Object3D;
  hit: Set<Target>;
  counted: boolean;
  weapon?: WeaponId;
  radius?: number;
}

const _v = new THREE.Vector3();
const _m = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Weapons {
  g: Game;
  owned = new Map<WeaponId, Slot>();
  cur: WeaponId = 'pistol';
  cd = 0;
  reloadT = 0;
  reloading = false;
  grenades = 2;
  trig = false;
  auto = false;
  projs: Proj[] = [];
  group = new THREE.Group();
  beam: THREE.Mesh;
  beamT = 0;
  laserTicks = 0;
  tapT = 0;
  companion: THREE.Group | null = null;
  compCd = 0;
  compColor = 0x40c4ff;
  tracer = 0xffe08a;
  empty = 0;

  constructor(g: Game) {
    this.g = g;
    g.scene.add(this.group);
    this.beam = mesh(BOX, basic(0xff3d5a, { add: true, opacity: 0.9 }), 0.12, 0.12, 1);
    this.beam.visible = false;
    this.group.add(this.beam);
  }

  reset(start: WeaponId) {
    for (const p of this.projs) this.group.remove(p.mesh);
    this.projs.length = 0;
    this.owned.clear();
    this.addWeapon('pistol', true);
    if (start !== 'pistol') this.addWeapon(start, true);
    this.cur = start;
    this.g.player.setGun(this.cur);
    this.cd = 0;
    this.reloadT = 0;
    this.reloading = false;
    this.grenades = 2;
    this.tracer = (SKINS.find((s) => s.id === store.save.eq.skin) ?? SKINS[0]).tracer;
    if (this.companion) {
      this.group.remove(this.companion);
      this.companion = null;
    }
    this.g.stats.weaponsSeen = this.owned.size;
  }

  slot() {
    return this.owned.get(this.cur)!;
  }

  addWeapon(id: WeaponId, silent = false) {
    const d = WEAPONS[id];
    if (this.owned.has(id)) {
      const s = this.owned.get(id)!;
      if (d.reserve > 0) s.reserve = Math.min(d.reserve, s.reserve + d.mag * 2);
      if (!silent) this.g.toast(`${d.name}: ammo restocked`, 'good');
      return;
    }
    this.owned.set(id, { mag: d.mag, reserve: d.reserve > 0 ? Math.floor(d.reserve * 0.5) : 0 });
    this.g.stats.weaponsSeen = this.owned.size;
  }

  switchTo(id: WeaponId) {
    if (!this.owned.has(id) || id === this.cur) return;
    this.cur = id;
    this.reloading = false;
    this.reloadT = 0;
    this.cd = 0.15;
    this.g.player.setGun(id);
    this.g.audio.reload();
  }
  cycle(dir: number) {
    const list = WEAPON_ORDER.filter((w) => this.owned.has(w));
    if (list.length < 2) return;
    const i = list.indexOf(this.cur);
    this.switchTo(list[(i + dir + list.length) % list.length]);
  }

  addAmmo(): string {
    let target: WeaponId = this.cur;
    if (WEAPONS[target].reserve === 0) {
      const alt = [...this.owned.keys()].filter((w) => WEAPONS[w].reserve > 0).sort((a, b) => (this.owned.get(a)!.reserve / WEAPONS[a].reserve) - (this.owned.get(b)!.reserve / WEAPONS[b].reserve));
      if (alt.length) target = alt[0];
    }
    const out: string[] = [];
    for (const [id, s] of this.owned) {
      const d = WEAPONS[id];
      if (d.reserve === 0) continue;
      const add = id === target ? d.mag * 2 : Math.ceil(d.mag * 0.6);
      const before = s.reserve;
      s.reserve = Math.min(d.reserve, s.reserve + add);
      if (id === target) {
        out.push(`+${s.reserve - before || add} ${d.name}`);
        this.g.stats.ammo += s.reserve - before;
      }
    }
    return out.join(' ') || 'Ammo full';
  }

  reload() {
    if (this.reloading) return;
    const d = WEAPONS[this.cur];
    const s = this.slot();
    if (s.mag >= d.mag) return;
    if (d.reserve > 0 && s.reserve <= 0) {
      this.g.toast('Out of reserve ammo!', 'bad');
      return;
    }
    this.reloading = true;
    this.reloadT = d.reload;
    this.g.audio.reload();
  }

  /* ------------------------------ targeting ------------------------------ */
  /** best auto-aim target ahead of the player */
  pickTarget(range = 110): Target | null {
    const p = this.g.player;
    let best: Target | null = null;
    let bs = 1e9;
    for (const t of this.g.allTargets()) {
      if (t.dead || (t.kind === 'obst' && !(t as unknown as { aim: boolean }).aim)) continue;
      const cx = (t.box.x0 + t.box.x1) / 2;
      const cz = (t.box.z0 + t.box.z1) / 2;
      const dz = p.z - cz;
      if (dz < 3 || dz > range) continue;
      const dx = Math.abs(cx - p.x);
      if (dx > dz * 0.65 + 2.6) continue;
      const cy = (t.box.y0 + t.box.y1) / 2;
      if (cy - p.y > dz * 0.9 + 2) continue;
      const sc = dz + dx * 5 - (dx < 1.7 ? 12 : 0);
      if (sc < bs) {
        bs = sc;
        best = t;
      }
    }
    return best;
  }

  /** compute aim direction with intercept lead; fills out */
  aim(origin: THREE.Vector3, speed: number, tgt: Target | null, out: THREE.Vector3) {
    const p = this.g.player;
    if (!tgt) {
      out.set(0, 0, -1);
      return;
    }
    const cx = (tgt.box.x0 + tgt.box.x1) / 2, cy = (tgt.box.y0 + tgt.box.y1) / 2, cz = (tgt.box.z0 + tgt.box.z1) / 2;
    const rx = cx - origin.x, ry = cy - origin.y, rz = cz - origin.z;
    const vx = tgt.vx, vz = tgt.vz + p.fwd;
    let t = Math.hypot(rx, ry, rz) / speed;
    for (let i = 0; i < 3; i++) t = Math.hypot(rx + vx * t, ry, rz + vz * t) / speed;
    out.set(rx + vx * t, ry, rz + vz * t).normalize();
  }

  /* -------------------------------- firing -------------------------------- */
  private tryFire() {
    const g = this.g;
    const d = WEAPONS[this.cur];
    const s = this.slot();
    if (this.reloading || this.cd > 0 || g.player.state === 'dead') return;
    if (s.mag <= 0) {
      if (d.reserve === 0 || s.reserve > 0) this.reload();
      else if (this.empty <= 0) {
        g.audio.empty();
        this.empty = 0.4;
        g.toast('Out of ammo — switch weapon!', 'bad');
        this.autoSwitch();
      }
      return;
    }
    const p = g.player;
    this.cd = 1 / d.rate;
    s.mag--;
    p.root.updateMatrixWorld(true);
    p.muzzlePos(_m);
    const tgt = this.pickTarget(d.kind === 'laser' ? d.range : d.range);
    if (d.kind === 'laser') {
      this.laserTicks++;
      if (this.laserTicks % 6 === 1) g.stats.shots++;
    } else g.stats.shots++;
    this.aim(_m, d.speed, tgt, _d);
    g.audio.shoot(d.id);
    p.recoil = 1;
    g.camKick += d.id === 'sniper' || d.id === 'rocket' ? 0.5 : d.id === 'shotgun' ? 0.35 : 0.08;
    g.fx.muzzle(_m, d.kind === 'laser' ? 0xff3d5a : d.color, d.id === 'shotgun' || d.id === 'rocket' ? 1.4 : 0.8);
    if (d.id === 'shotgun' || d.id === 'rocket' || d.id === 'sniper') g.fx.flash(_m, d.color, 12);

    if (d.kind === 'laser') {
      this.fireLaser(_m, _d, d);
    } else {
      for (let i = 0; i < d.pellets; i++) {
        _v.copy(_d);
        if (d.spread > 0) {
          _v.x += (Math.random() - 0.5) * 2 * d.spread;
          _v.y += (Math.random() - 0.5) * 2 * d.spread * 0.6;
          _v.normalize();
        }
        this.spawnPlayerProj(d, _m, _v);
      }
    }
    if (s.mag <= 0) this.reload();
  }

  private autoSwitch() {
    for (const id of WEAPON_ORDER) {
      const s = this.owned.get(id);
      if (s && id !== this.cur && (s.mag > 0 || s.reserve > 0 || WEAPONS[id].reserve === 0)) {
        this.switchTo(id);
        return;
      }
    }
  }

  private spawnPlayerProj(d: (typeof WEAPONS)[WeaponId], origin: THREE.Vector3, dir: THREE.Vector3) {
    if (this.projs.length > 90) return;
    const g = this.g;
    const vel = dir.clone().multiplyScalar(d.speed);
    vel.z -= g.player.fwd;
    let m: THREE.Object3D;
    let kind: Proj['kind'] = 'bullet';
    let color = d.color;
    if (d.kind === 'plasma') {
      kind = 'plasma';
      m = new THREE.Group();
      m.add(mesh(SPH, basic(0xffffff), 0.35, 0.35, 0.35), mesh(SPH, glowMat(d.color, 0.7), 1.0, 1.0, 1.0));
    } else if (d.kind === 'rocket') {
      kind = 'rocket';
      m = new THREE.Group();
      m.add(mesh(BOX, basic(0x9aa0aa), 0.22, 0.22, 0.9), mesh(SPH, glowMat(0xff8a40, 0.8), 0.7, 0.7, 0.7, 0, 0, 0.6));
    } else {
      color = d.id === 'rifle' || d.id === 'smg' || d.id === 'pistol' ? this.tracer : d.color;
      m = mesh(BOX, basic(color), 0.07, 0.07, d.id === 'sniper' ? 4 : 1.6);
    }
    m.position.copy(origin);
    m.lookAt(origin.x + vel.x, origin.y + vel.y, origin.z + vel.z);
    this.group.add(m);
    this.projs.push({
      owner: 'p', kind, pos: origin.clone(), prev: origin.clone(), vel, dmg: d.dmg, life: d.range / d.speed + 0.2,
      pierce: d.pierce, splash: d.splash, color, grav: 0, mesh: m, hit: new Set(), counted: false, weapon: d.id,
    });
  }

  private fireLaser(origin: THREE.Vector3, dir: THREE.Vector3, d: (typeof WEAPONS)[WeaponId]) {
    const g = this.g;
    const end = origin.clone().addScaledVector(dir, d.range);
    let hitAny = false;
    for (const t of g.allTargets()) {
      if (t.dead) continue;
      const k = segBox(origin.x, origin.y, origin.z, end.x, end.y, end.z, t.box, 0.2);
      if (k >= 0) {
        _v.copy(origin).lerp(end, k);
        t.hurt(d.dmg, _v, 'laser');
        g.fx.sparks(_v, 0xff3d5a, 3, 4);
        hitAny = true;
      }
    }
    if (hitAny) {
      g.hitMarker = 0.12;
      if (!g.laserHitShot) {
        g.stats.hits++;
        g.laserHitShot = true;
      }
    } else g.laserHitShot = false;
    this.beam.position.copy(origin).lerp(end, 0.5);
    this.beam.scale.set(0.12, 0.12, d.range);
    this.beam.lookAt(end);
    this.beam.visible = true;
    this.beamT = 0.07;
  }

  throwGrenade() {
    const g = this.g;
    const p = g.player;
    if (this.grenades <= 0) return g.toast('No grenades', 'bad');
    if (p.state === 'dead') return;
    this.grenades--;
    p.root.updateMatrixWorld(true);
    p.muzzlePos(_m);
    const tgt = this.pickTarget(60);
    let tx: number, ty: number, tz: number;
    const T = 0.95;
    if (tgt) {
      tx = (tgt.box.x0 + tgt.box.x1) / 2 + tgt.vx * T;
      ty = 0.4;
      tz = (tgt.box.z0 + tgt.box.z1) / 2 + tgt.vz * T;
    } else {
      tx = p.x;
      ty = 0.3;
      tz = p.z - 28 - p.fwd * T;
    }
    const grav = 24;
    const vx = (tx - _m.x) / T;
    const vz = (tz - _m.z) / T - p.fwd * 0 + 0;
    const vy = (ty - _m.y + 0.5 * grav * T * T) / T;
    const m = mesh(SPH, basic(0x7cb342), 0.35, 0.35, 0.35);
    m.position.copy(_m);
    this.group.add(m);
    this.projs.push({
      owner: 'p', kind: 'grenade', pos: _m.clone(), prev: _m.clone(), vel: new THREE.Vector3(vx, vy, vz), dmg: 130, life: T + 0.05,
      pierce: 1, splash: 5.5, color: 0x9ccc65, grav, mesh: m, hit: new Set(), counted: true,
    });
    g.audio.swoosh();
    p.recoil = 1;
  }

  /* ------------------------------ enemy fire ------------------------------ */
  leadPlayer(origin: V3, speed: number, aimY: number, out: THREE.Vector3) {
    const p = this.g.player;
    let t = Math.hypot(p.x - origin.x, aimY - origin.y, p.z - origin.z) / speed;
    for (let i = 0; i < 2; i++) t = Math.hypot(p.x - origin.x, aimY - origin.y, p.z - p.fwd * t - origin.z) / speed;
    out.set(p.x, aimY, p.z - p.fwd * t);
  }

  enemyBolt(origin: V3, target: V3, speed: number, dmg: number, color = 0xff4d6d, size = 0.45) {
    if (this.projs.length > 120) return;
    const dir = new THREE.Vector3(target.x - origin.x, target.y - origin.y, target.z - origin.z).normalize();
    const m = new THREE.Group();
    m.add(mesh(SPH, basic(0xffffff), size * 0.6, size * 0.6, size * 0.6), mesh(SPH, glowMat(color, 0.8), size * 2.2, size * 2.2, size * 2.2));
    m.position.set(origin.x, origin.y, origin.z);
    this.group.add(m);
    this.projs.push({
      owner: 'e', kind: 'ebolt', pos: new THREE.Vector3(origin.x, origin.y, origin.z), prev: new THREE.Vector3(origin.x, origin.y, origin.z),
      vel: dir.multiplyScalar(speed), dmg, life: 4, pierce: 1, splash: 0, color, grav: 0, mesh: m, hit: new Set(), counted: false,
    });
  }

  addBomb(x: number, y: number, z: number, speed: number) {
    const m = new THREE.Group();
    m.add(mesh(SPH, basic(0x222222), 0.7, 0.7, 0.7), mesh(SPH, glowMat(0xff3a1a, 0.9), 1.5, 1.5, 1.5));
    m.position.set(x, y, z);
    this.group.add(m);
    this.projs.push({
      owner: 'e', kind: 'bomb', pos: new THREE.Vector3(x, y, z), prev: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(0, -speed, 0),
      dmg: 32, life: 5, pierce: 1, splash: 2.4, color: 0xff3a1a, grav: 0, mesh: m, hit: new Set(), counted: false,
    });
    this.g.audio.bombWhistle();
  }

  /** a quick screen tap fires a short burst */
  tapFire() {
    this.tapT = 0.3;
  }

  clearEnemyShots() {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      if (this.projs[i].owner === 'e') {
        this.g.fx.sparks(this.projs[i].pos, this.projs[i].color, 4, 4);
        this.remove(i);
      }
    }
  }

  private remove(i: number) {
    this.group.remove(this.projs[i].mesh);
    this.projs.splice(i, 1);
  }

  /* -------------------------------- update -------------------------------- */
  update(dt: number, rawDt: number) {
    const g = this.g;
    const p = g.player;
    // timers use "effective" dt (bullet-time gives the player a rate boost)
    const boost = g.bulletT > 0 ? 1.8 : 1;
    this.cd = Math.max(0, this.cd - dt * boost);
    this.empty = Math.max(0, this.empty - dt);
    this.tapT = Math.max(0, this.tapT - rawDt);
    if (this.reloading) {
      this.reloadT -= dt * boost;
      if (this.reloadT <= 0) {
        const d = WEAPONS[this.cur];
        const s = this.slot();
        const need = d.mag - s.mag;
        const take = d.reserve === 0 ? need : Math.min(need, s.reserve);
        s.mag += take;
        if (d.reserve > 0) s.reserve -= take;
        this.reloading = false;
      }
    }
    if (this.beamT > 0) {
      this.beamT -= rawDt;
      if (this.beamT <= 0) this.beam.visible = false;
    }
    if (p.state !== 'dead') {
      let fire = this.trig || this.tapT > 0;
      if (this.auto && !fire) fire = this.pickTarget(WEAPONS[this.cur].range * 0.85) !== null;
      if (fire) this.tryFire();
      else if (this.cur === 'laser') this.laserTicks = 0;
    }

    // projectiles
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i];
      pr.prev.copy(pr.pos);
      pr.vel.y -= pr.grav * dt;
      pr.pos.addScaledVector(pr.vel, dt);
      pr.life -= dt;
      pr.mesh.position.copy(pr.pos);
      let kill = pr.life <= 0;
      if (pr.owner === 'p') {
        if (pr.kind === 'plasma') g.fx.trail(pr.pos, pr.color, 0.5);
        if (pr.kind === 'rocket') {
          g.fx.trail(pr.pos, 0xff9a40, 0.7);
          g.fx.smokePuff(pr.pos, 0.6, 0.35);
        }
        if (pr.kind === 'grenade') pr.mesh.rotation.x += dt * 10;
        for (const t of g.allTargets()) {
          if (t.dead || pr.hit.has(t)) continue;
          const k = segBox(pr.prev.x, pr.prev.y, pr.prev.z, pr.pos.x, pr.pos.y, pr.pos.z, t.box, pr.kind === 'grenade' ? 0.3 : 0.12);
          if (k < 0) continue;
          _v.copy(pr.prev).lerp(pr.pos, k);
          pr.hit.add(t);
          if (!pr.counted) {
            pr.counted = true;
            g.stats.hits++;
          }
          g.hitMarker = 0.14;
          if (pr.splash > 0) {
            this.detonate(pr, _v);
            kill = true;
            break;
          }
          t.hurt(pr.dmg, _v, pr.weapon);
          g.audio.hit();
          g.fx.sparks(_v, pr.color, 4, 5);
          if (--pr.pierce <= 0) {
            kill = true;
            break;
          }
        }
        if (!kill && pr.pos.y < 0.05 && pr.vel.y < 0) {
          if (pr.splash > 0) {
            _v.copy(pr.pos);
            _v.y = 0.2;
            this.detonate(pr, _v);
          } else g.fx.sparks({ x: pr.pos.x, y: 0.1, z: pr.pos.z }, 0xffd080, 2, 3);
          kill = true;
        }
        if (!kill && pr.life <= 0 && pr.splash > 0) {
          this.detonate(pr, pr.pos);
        }
        if (pr.pos.z > p.z + 25) kill = true;
      } else {
        g.fx.trail(pr.pos, pr.color, pr.kind === 'bomb' ? 0.8 : 0.4);
        if (pr.kind === 'bomb') {
          if (pr.pos.y <= 0.3) {
            g.explode(pr.pos.x, 0.5, pr.pos.z, 2.4, 0, { player: true, playerDmg: pr.dmg, color: 0xff5a2a, scale: 1.1 });
            kill = true;
          }
        } else {
          // guardian drone interception
          if (this.companion && DRONES.find((d) => d.id === store.save.eq.drone)?.id === 'guardian') {
            if (this.companion.position.distanceTo(pr.pos) < 1.6) {
              g.fx.sparks(pr.pos, 0x69f0ae, 6, 5);
              g.audio.hit();
              kill = true;
            }
          }
          if (!kill && p.state !== 'dead') {
            const b = p.getBox();
            const k = segBox(pr.prev.x, pr.prev.y, pr.prev.z, pr.pos.x, pr.pos.y, pr.pos.z, b, 0.1);
            if (k >= 0) {
              p.hurt(pr.dmg);
              g.fx.sparks(pr.pos, pr.color, 6, 5);
              kill = true;
            }
          }
          if (pr.pos.y < 0 || pr.pos.z > p.z + 30) kill = true;
        }
      }
      if (kill) this.remove(i);
    }
    this.updateCompanion(dt);
  }

  private detonate(pr: Proj, at: V3) {
    const g = this.g;
    const big = pr.kind !== 'plasma';
    g.explode(at.x, at.y, at.z, pr.splash, pr.dmg, {
      color: pr.kind === 'plasma' ? 0x40ffd0 : 0xff8a30,
      scale: pr.kind === 'plasma' ? 0.55 : pr.kind === 'grenade' ? 1.0 : 1.2,
      big,
    });
  }

  /* ------------------------------ companion ------------------------------- */
  private updateCompanion(dt: number) {
    const g = this.g;
    const p = g.player;
    const active = p.eq.drone > 0 && p.state !== 'dead';
    if (active && !this.companion) {
      const dr = DRONES.find((d) => d.id === store.save.eq.drone) ?? DRONES[0];
      this.compColor = dr.color;
      this.companion = makeCompanion(dr.color);
      this.companion.position.set(p.x - 1.6, 3, p.z - 2);
      this.group.add(this.companion);
    } else if (!active && this.companion) {
      g.fx.sparks(this.companion.position, this.compColor, 10, 5);
      this.group.remove(this.companion);
      this.companion = null;
    }
    if (!this.companion) return;
    const t = g.time;
    const c = this.companion;
    const tx = p.x + Math.sin(t * 1.3) * 1.2 - 1.4;
    c.position.x += (tx - c.position.x) * Math.min(1, dt * 6);
    c.position.y = 2.8 + Math.sin(t * 3) * 0.25;
    c.position.z += (p.z - 2.5 - c.position.z) * Math.min(1, dt * 10);
    c.rotation.y += dt * 3;
    this.compCd -= dt;
    const dr = DRONES.find((d) => d.id === store.save.eq.drone) ?? DRONES[0];
    if (this.compCd <= 0) {
      const tgt = this.pickTarget(90);
      if (tgt && this.projs.length < 90) {
        this.compCd = 1 / dr.rate;
        this.aim(c.position, 110, tgt, _d);
        const vel = _d.clone().multiplyScalar(110);
        vel.z -= p.fwd;
        const m = mesh(BOX, basic(dr.color), 0.1, 0.1, 1.2);
        m.position.copy(c.position);
        m.lookAt(c.position.x + vel.x, c.position.y + vel.y, c.position.z + vel.z);
        this.group.add(m);
        this.projs.push({
          owner: 'p', kind: 'bullet', pos: c.position.clone(), prev: c.position.clone(), vel, dmg: dr.dmg, life: 1.4, pierce: 1, splash: 0,
          color: dr.color, grav: 0, mesh: m, hit: new Set(), counted: true,
        });
        g.audio.tone(1200, 0.05, 'square', 0.03, 600);
      }
    }
  }
}
