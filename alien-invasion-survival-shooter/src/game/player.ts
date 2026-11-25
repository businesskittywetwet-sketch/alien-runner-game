import * as THREE from 'three';
import type { Game } from './game';
import { GRAVITY, JUMP_V, LANE_X, OUTFITS, SKINS, type WeaponId } from './config';
import { box, flashHumanoid, glowMat, makeGun, makeHumanoid, SPH, type Humanoid, mesh } from './models';
import { clamp, damp, newBox, setBox, type Box } from './util';
import { store } from './progress';
import type { Obst } from './obstacles';

export type PState = 'run' | 'rope' | 'bar' | 'zip' | 'ladder' | 'grapple' | 'zipl' | 'dead';

export class Player {
  g: Game;
  root = new THREE.Group();
  hum!: Humanoid;
  gun: THREE.Group | null = null;
  gunId: WeaponId | null = null;
  bubble: THREE.Mesh;
  x = LANE_X[1];
  y = 0;
  z = 0;
  vy = 0;
  fwd = 0;
  lane = 1;
  grounded = true;
  sliding = false;
  slideT = 0;
  slam = false;
  state: PState = 'run';
  h = 1.8;
  maxHealth = 100;
  health = 100;
  armor = 0;
  shield = 0;
  energy = 40;
  medkits = 0;
  invuln = 0;
  hitFlash = 0;
  dashT = 0;
  jumpBuf = 0;
  stumbleT = 0;
  airT = 0;
  groundObj: Obst | null = null;
  rampLaunch = false;
  runT = 0;
  recoil = 0;
  hangLean = 0;
  climbPhase = 0;
  box: Box = newBox();
  laneK = 18;
  jumpMul = 1;
  eq = { boots: 0, gloves: 0, speed: 0, pshield: 0, phase: 0, drone: 0, grapple: 0, zip: 0 };
  grabCooldown = 0;
  vaulting = false;

  constructor(g: Game) {
    this.g = g;
    g.scene.add(this.root);
    this.bubble = mesh(SPH, glowMat(0x7df9ff, 0.35), 2.6, 2.9, 2.6, 0, 1, 0);
    this.bubble.visible = false;
    this.root.add(this.bubble);
    this.buildModel();
  }

  buildModel() {
    if (this.hum) this.root.remove(this.hum.root);
    const ch = store.character();
    const of = OUTFITS.find((o) => o.id === store.save.eq.outfit) ?? OUTFITS[0];
    this.hum = makeHumanoid({
      skin: ch.skin,
      suit: of.suit >= 0 ? of.suit : ch.suit,
      accent: of.accent >= 0 ? of.accent : ch.accent,
      eye: 0x111111,
      scale: 0.88,
      helmet: true,
    });
    this.root.add(this.hum.root);
    this.hum.root.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (mm.isMesh) {
        mm.castShadow = true;
        mm.receiveShadow = true;
      }
    });
    this.gun = null;
    this.gunId = null;
  }

  setGun(id: WeaponId) {
    if (this.gunId === id) return;
    if (this.gun) this.hum.hand.remove(this.gun);
    const sk = SKINS.find((s) => s.id === store.save.eq.skin) ?? SKINS[0];
    this.gun = makeGun(id, sk.tint);
    this.gun.rotation.x = -Math.PI / 2;
    this.gun.position.y = -0.02;
    this.hum.hand.add(this.gun);
    this.gunId = id;
  }

  muzzlePos(out: THREE.Vector3) {
    if (this.gun) (this.gun.userData.muzzle as THREE.Object3D).getWorldPosition(out);
    else out.set(this.x, this.y + 1.3, this.z - 1);
    return out;
  }

  reset() {
    const ch = store.character();
    this.buildModel();
    this.x = LANE_X[1];
    this.lane = 1;
    this.y = 0;
    this.z = 0;
    this.vy = 0;
    this.fwd = 0;
    this.grounded = true;
    this.sliding = false;
    this.slam = false;
    this.state = 'run';
    // health is hard-capped at exactly 100 for every character
    this.maxHealth = 100;
    this.health = 100;
    this.armor = 0;
    this.shield = Math.min(100, ch.shield);
    this.energy = 40;
    // purchased equipment loadout (permanent shop unlocks)
    this.medkits = (store.owns('eq_medkit') ? 3 : 0) + (store.owns('eq_reserve') ? 2 : 0);
    if (store.owns('eq_armor')) this.armor = 40;
    if (store.owns('eq_shield')) this.shield = Math.min(100, this.shield + 35);
    if (store.owns('eq_boots')) this.eq.boots = 15;
    if (store.owns('eq_gloves')) this.eq.gloves = 15;
    this.invuln = 1.0;
    this.hitFlash = 0;
    this.dashT = 0;
    this.stumbleT = 0;
    this.laneK = 18 * ch.lane;
    this.jumpMul = ch.jump;
    this.eq = { boots: 0, gloves: 0, speed: 0, pshield: 0, phase: 0, drone: 0, grapple: 0, zip: 0 };
    this.groundObj = null;
    this.hum.root.rotation.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.recoil = 0;
  }

  /* ----------------------------- input actions ----------------------------- */
  moveLane(d: number) {
    if (this.state === 'dead') return;
    this.lane = clamp(this.lane + d, 0, 3);
    this.g.audio.swoosh();
  }
  setLane(i: number) {
    if (this.state === 'dead') return;
    if (i !== this.lane) this.g.audio.swoosh();
    this.lane = clamp(i, 0, 3);
  }
  jump() {
    if (this.state === 'dead') return;
    this.jumpBuf = 0.16;
    this.g.traversal.onJumpPress();
  }
  slide() {
    if (this.state !== 'run') return;
    if (this.grounded) {
      this.sliding = true;
      this.slideT = 0.78;
      this.g.audio.slide();
    } else {
      this.slam = true;
      this.vy = Math.min(this.vy, -22);
    }
  }
  private doJump() {
    let v = JUMP_V * this.jumpMul * (this.eq.boots > 0 ? 1.32 : 1);
    if (this.groundObj?.ramp) {
      const r = this.groundObj.ramp;
      v += ((r.h1 - r.h0) / (r.zStart - r.zEnd)) * this.fwd * 0.95;
      this.rampLaunch = true;
    }
    this.vy = v;
    this.grounded = false;
    this.sliding = false;
    this.airT = 0;
    this.g.audio.jump();
    this.g.fx.dust({ x: this.x, y: this.y, z: this.z }, 3);
  }
  startDash() {
    this.dashT = 0.5;
    this.sliding = false;
    this.invuln = Math.max(this.invuln, 0.7);
    this.g.audio.grapple();
    this.g.shake(0.4);
  }

  /* ------------------------------- damage -------------------------------- */
  /** returns true when damage was actually applied */
  hurt(amount: number, stumble = false): boolean {
    if (this.g.training) {
      if (this.state !== 'dead') this.g.trainingHit();
      return false;
    }
    if (this.state === 'dead' || this.invuln > 0 || this.eq.phase > 0 || this.dashT > 0) return false;
    if (this.eq.pshield > 0) {
      this.g.fx.ring({ x: this.x, y: this.y + 1, z: this.z }, 0x7df9ff, 3);
      this.g.audio.hit();
      this.invuln = 0.25;
      return false;
    }
    let dmg = amount;
    if (this.shield > 0) {
      const a = Math.min(this.shield, dmg);
      this.shield -= a;
      dmg -= a;
    }
    if (dmg > 0 && this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * 0.6);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.health -= dmg;
    this.invuln = 0.75;
    this.hitFlash = 0.4;
    this.g.damageFlash = 1;
    this.g.audio.hurt();
    this.g.shake(0.7);
    if (stumble) this.stumbleT = 0.7;
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
    return true;
  }
  heal(a: number) {
    if (this.state === 'dead') return;
    this.health = Math.min(this.maxHealth, this.health + a);
  }
  die() {
    this.state = 'dead';
    this.g.onPlayerDeath();
  }
  getBox(): Box {
    setBox(this.box, this.x, this.y, this.z, 0.36, this.h, 0.3);
    return this.box;
  }
  center() {
    return { x: this.x, y: this.y + this.h * 0.55, z: this.z };
  }

  /* -------------------------------- update -------------------------------- */
  update(dt: number) {
    const g = this.g;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.stumbleT = Math.max(0, this.stumbleT - dt);
    this.grabCooldown = Math.max(0, this.grabCooldown - dt);
    for (const k of ['boots', 'gloves', 'speed', 'pshield', 'phase', 'drone'] as const) this.eq[k] = Math.max(0, this.eq[k] - dt);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.shield = Math.min(100, this.shield);

    if (this.state === 'dead') {
      this.animate(dt);
      return;
    }
    if (this.state === 'run') this.physics(dt);
    this.h = this.sliding ? 0.75 : 1.8;
    this.animate(dt);
    void g;
  }

  private physics(dt: number) {
    const g = this.g;
    const target = g.runSpeed() * (this.stumbleT > 0 ? 0.6 : 1);
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.fwd = 62;
      this.vy = 0;
    } else {
      this.fwd = damp(this.fwd, target, this.grounded ? 5 : 1.2, dt);
    }
    this.z -= this.fwd * dt;

    // lateral
    const tx = LANE_X[this.lane];
    this.x += (tx - this.x) * (1 - Math.exp(-this.laneK * dt));

    // jump buffer
    if (this.jumpBuf > 0) {
      this.jumpBuf -= dt;
      if (this.grounded && this.dashT <= 0) {
        this.doJump();
        this.jumpBuf = 0;
      }
    }
    if (this.sliding) {
      this.slideT -= dt;
      if (this.slideT <= 0) this.sliding = false;
    }

    const ob = g.obstacles;
    const prevY = this.y;
    if (this.dashT > 0) {
      const s = ob.support(this.x, this.z, this.y);
      if (this.grounded && s.h > this.y) this.y = s.h;
      this.airT = 0;
      return;
    }
    if (this.grounded) {
      const s = ob.support(this.x, this.z, this.y);
      if (s.h >= this.y - 0.25) {
        this.y = s.h;
        this.groundObj = s.o;
      } else {
        this.grounded = false;
        this.airT = 0;
        this.vy = 0;
        if (this.groundObj?.ramp) {
          const r = this.groundObj.ramp;
          this.vy = ((r.h1 - r.h0) / (r.zStart - r.zEnd)) * this.fwd * 0.95;
          this.rampLaunch = true;
        }
        this.groundObj = null;
      }
    } else {
      this.airT += dt;
      this.vy -= GRAVITY * dt;
      const ny = this.y + this.vy * dt;
      const s = ob.support(this.x, this.z, prevY);
      if (this.vy <= 0 && ny <= s.h) {
        this.land(s.h, s.o);
      } else {
        this.y = ny;
        if (this.y < -3.5 && s.h < -20) this.fallInPit();
      }
    }
  }

  private land(h: number, o: Obst | null) {
    const g = this.g;
    const impact = -this.vy;
    this.y = h;
    this.vy = 0;
    this.grounded = true;
    this.groundObj = o;
    if (impact > 9) {
      g.audio.land();
      g.fx.dust({ x: this.x, y: this.y, z: this.z }, 5);
      if (impact > 18) g.shake(0.25);
    }
    if (this.slam) {
      this.slam = false;
      this.sliding = true;
      this.slideT = 0.7;
      g.audio.slide();
      g.fx.ring({ x: this.x, y: this.y + 0.1, z: this.z }, 0xffffff, 2);
    }
    if (o && o.walk && !o.ramp && o.box.y1 >= 0.95 && !o.landed) {
      o.landed = true;
      g.addTraversal(o.label ?? 'Climb');
    }
    if (this.rampLaunch) {
      if (this.airT > 0.75) g.addTraversal('Ramp Jump');
      this.rampLaunch = false;
    }
    this.vaulting = false;
  }

  vault() {
    this.vy = Math.max(this.vy, 9.6);
    this.grounded = false;
    this.airT = 0;
    this.sliding = false;
    this.vaulting = true;
    this.g.audio.jump();
  }

  private fallInPit() {
    const g = this.g;
    const gap = g.obstacles.gapNear(this.z);
    this.hurtDirect(30);
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.z = gap ? gap.box.z0 - 2.5 : this.z - 6;
    this.fwd = 16;
    this.invuln = 1.6;
    g.shake(1);
    g.toast('Emergency tether! -30 HP', 'bad');
    g.fx.explosion({ x: this.x, y: 0.5, z: this.z + 2 }, 0.6, 0x40e0ff);
  }
  /** damage that ignores invulnerability windows (still respects shields/armor) */
  hurtDirect(a: number) {
    const inv = this.invuln;
    const ph = this.eq.phase;
    this.invuln = 0;
    this.eq.phase = 0;
    const ps = this.eq.pshield;
    this.eq.pshield = 0;
    this.hurt(a);
    this.eq.pshield = ps;
    if (this.state !== 'dead') {
      this.invuln = Math.max(inv, this.invuln);
      this.eq.phase = ph;
    }
  }

  /** place at a traversal pose */
  setPose(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /** release back to normal running after traversal */
  release(fwd: number, vy: number) {
    this.state = 'run';
    this.fwd = fwd;
    this.vy = vy;
    this.grounded = false;
    this.airT = 0;
    this.grabCooldown = 0.35;
    this.lane = this.nearestLane();
    this.hangLean = 0;
    this.jumpBuf = 0;
  }
  nearestLane() {
    let b = 0;
    for (let i = 1; i < 4; i++) if (Math.abs(LANE_X[i] - this.x) < Math.abs(LANE_X[b] - this.x)) b = i;
    return b;
  }

  /* ------------------------------- animation ------------------------------- */
  private animate(dt: number) {
    const h = this.hum;
    const st = this.state;
    this.runT += dt * (6 + this.fwd * 0.28);
    const sw = Math.sin(this.runT);
    const hips = 0.95;
    let lean = -0.16;
    let by = hips;
    let aim = Math.PI / 2 - 0.12;
    let aimL = Math.PI / 2 - 0.35;
    let legL = 0, legR = 0;
    if (st === 'run') {
      if (this.sliding) {
        lean = 1.15;
        by = 0.5;
        legL = 0.05;
        legR = 0.05;
        aim = Math.PI / 2 - lean;
        aimL = aim - 0.15;
      } else if (!this.grounded) {
        legL = -0.9;
        legR = 0.5;
        lean = this.vy > 0 ? -0.22 : -0.05;
      } else {
        legL = sw * 1.0;
        legR = -sw * 1.0;
        by = hips + Math.abs(Math.cos(this.runT)) * 0.07;
        if (this.dashT > 0) lean = -0.75;
      }
      if (this.dashT > 0) lean = -0.75;
      aim += this.recoil * 0.22;
      aimL += this.recoil * 0.15;
      h.armR.rotation.x = aim;
      h.armL.rotation.x = aimL;
    } else if (st === 'rope' || st === 'bar' || st === 'zip' || st === 'zipl' || st === 'grapple') {
      lean = this.hangLean;
      h.armR.rotation.x = Math.PI - 0.1;
      h.armL.rotation.x = Math.PI - 0.1;
      h.armR.rotation.z = -0.12;
      h.armL.rotation.z = 0.12;
      legL = Math.sin(this.runT * 0.4) * 0.35 - 0.2;
      legR = -Math.sin(this.runT * 0.4) * 0.35 - 0.2;
      by = hips + 0.1;
    } else if (st === 'ladder') {
      lean = 0;
      this.climbPhase += dt * 11;
      const c = Math.sin(this.climbPhase);
      h.armR.rotation.x = Math.PI - 0.2 + c * 0.7;
      h.armL.rotation.x = Math.PI - 0.2 - c * 0.7;
      legL = -c * 0.8 - 0.3;
      legR = c * 0.8 - 0.3;
    } else if (st === 'dead') {
      lean = 1.45;
      by = 0.35;
      h.armR.rotation.x = 1.0;
      h.armL.rotation.x = 1.3;
    }
    if (st !== 'rope' && st !== 'bar' && st !== 'zip' && st !== 'zipl' && st !== 'grapple') {
      h.armR.rotation.z = 0;
      h.armL.rotation.z = 0;
    }
    h.body.rotation.x = damp(h.body.rotation.x, lean, 20, dt);
    h.body.position.y = damp(h.body.position.y, by, 25, dt);
    h.legL.rotation.x = legL;
    h.legR.rotation.x = legR;
    h.head.rotation.x = -lean * 0.4;

    this.root.position.set(this.x, this.y, this.z);
    const dx = LANE_X[this.lane] - this.x;
    this.root.rotation.z = st === 'run' ? clamp(-dx * 0.09, -0.3, 0.3) : 0;
    if (st === 'dead') this.root.rotation.z = 0;

    // flashes
    // only flicker briefly right after taking damage — never hide the runner while idle
    const blink = this.hitFlash > 0 && Math.floor(this.hitFlash * 30) % 2 === 0;
    h.root.visible = !blink || st === 'dead';
    flashHumanoid(h, this.hitFlash > 0 ? 1.2 : 0, 0xff2a2a);

    // bubble
    const bub = this.eq.pshield > 0 || this.eq.phase > 0 || this.shield > 0;
    this.bubble.visible = bub;
    if (bub) {
      const t = performance.now() * 0.006;
      const mat = this.bubble.material as THREE.MeshBasicMaterial;
      const expiring = (this.eq.pshield > 0 && this.eq.pshield < 1.5) || (this.eq.phase > 0 && this.eq.phase < 1.2);
      mat.opacity = (this.eq.pshield > 0 || this.eq.phase > 0 ? 0.4 : 0.14) * (expiring ? 0.6 + 0.4 * Math.sin(t * 6) : 1) + 0.05 * Math.sin(t);
      mat.color.setHex(this.eq.phase > 0 ? 0xffe066 : 0x7df9ff);
      this.bubble.position.y = this.h * 0.55 + 0.1;
    }
  }
}

void box;
