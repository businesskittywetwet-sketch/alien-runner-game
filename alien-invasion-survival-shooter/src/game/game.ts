import * as THREE from 'three';
import { ABILITIES, BASE_SPEED, districtAt, DISTRICT_NAMES, LANE_X, MAX_SPEED, WEAPON_ORDER, WEAPONS, type AbilityId, type WeaponId } from './config';
import { AudioSys } from './audio';
import { FX } from './fx';
import { World } from './world';
import { Player } from './player';
import { Weapons } from './weapons';
import { Obstacles } from './obstacles';
import { Traversal } from './traversal';
import { Enemies } from './enemies';
import { Ships } from './ships';
import { Pickups } from './pickups';
import { Director } from './director';
import { Input } from './input';
import { Flight, type AirHud, type Pad } from './flight';
import { TutorialCtl, type TrainHud } from './tutorialctl';
import { addChallenges, submitRun } from './leaderboard';
import { accuracyOf, emptyRun, store, type Achievement, type DailyChallenge, type RunStats } from './progress';
import type { Target } from './util';

export type GameState = 'menu' | 'playing' | 'paused' | 'dead';

export interface Toast {
  id: number;
  text: string;
  kind: 'good' | 'bad' | 'pickup' | 'info' | 'achv';
  color?: number;
}
export interface Banner {
  id: number;
  text: string;
  color: string;
  dur: number;
}

export interface HudState {
  dist: number;
  score: number;
  health: number;
  maxHealth: number;
  armor: number;
  shield: number;
  energy: number;
  weapon: { id: WeaponId; name: string; mag: number; magMax: number; reserve: number; infinite: boolean; reloading: boolean; reloadPct: number };
  owned: { id: WeaponId; name: string; active: boolean }[];
  grenades: number;
  eq: { grapple: number; zip: number; boots: number; gloves: number; pshield: number; speed: number; phase: number; drone: number };
  abilities: { id: AbilityId; name: string; ready: boolean; energy: number }[];
  prompt: string;
  boss: { name: string; hp: number } | null;
  threat: boolean[];
  lane: number;
  auto: boolean;
  hit: boolean;
  dmg: number;
  speed: number;
  district: string;
  event: boolean;
  bullet: boolean;
  traversalState: string;
  canGrapple: boolean;
  canZip: boolean;
  muted: boolean;
  bucks: number;
  medkits: number;
  laneButtons: boolean;
  mode: 'ground' | 'air';
  air: AirHud | null;
  train: TrainHud | null;
}

export interface RunSummary {
  stats: RunStats;
  credits: number;
  accuracy: number;
  newAch: Achievement[];
  daily: DailyChallenge[];
  best: boolean;
}

export class Game {
  container: HTMLElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  audio = new AudioSys();
  fx: FX;
  world: World;
  player: Player;
  weapons: Weapons;
  obstacles: Obstacles;
  traversal: Traversal;
  enemies: Enemies;
  ships: Ships;
  pickups: Pickups;
  director: Director;
  flight: Flight;
  tutorial: TutorialCtl;
  input: Input;
  mode: 'ground' | 'air' = 'ground';
  training = false;

  state: GameState = 'menu';
  stats: RunStats = emptyRun();
  time = 0;
  bulletT = 0;
  damageFlash = 0;
  camKick = 0;
  shakeAmt = 0;
  hitMarker = 0;
  laserHitShot = false;
  deathT = 0;
  lastDist = 0;
  milestones = 0;
  bucksFlush = 0;
  pendingHealth = false;
  pendingDouble = false;
  doubleScoreT = 0;
  achT = 2;
  abilityCd = 0;
  private last = 0;
  private raf = 0;
  private hudT = 0;
  private toastId = 1;
  private tcache: Target[] = [];
  private ro: ResizeObserver;
  private cam = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private slow = 1;

  onHud?: (h: HudState) => void;
  onToast?: (t: Toast) => void;
  onBanner?: (b: Banner) => void;
  onState?: (s: GameState, summary?: RunSummary) => void;

  constructor(container: HTMLElement) {
    this.container = container;
    const mobile = window.matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.3, 560);
    this.fx = new FX(this.scene);
    this.world = new World(this.scene);
    this.world.onThunder = () => this.audio.explosion(true);
    this.player = new Player(this);
    this.weapons = new Weapons(this);
    this.obstacles = new Obstacles(this);
    this.traversal = new Traversal(this);
    this.enemies = new Enemies(this);
    this.ships = new Ships(this);
    this.pickups = new Pickups(this);
    this.director = new Director(this);
    this.flight = new Flight(this);
    this.tutorial = new TutorialCtl(this);
    this.input = new Input(this, this.renderer.domElement);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.audio.sfxOn = store.save.settings.sfx;
    this.audio.musicOn = store.save.settings.music;
    this.enterMenu();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.input.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // portrait: widen the fov so all four lanes stay visible
    this.camera.fov = w / h < 0.8 ? 84 : w / h < 1.2 ? 74 : 66;
    this.camera.updateProjectionMatrix();
    this.fx.setScale(this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
  }

  /* ------------------------------- lifecycle ------------------------------- */
  enterMenu() {
    this.flight.reset();
    this.flight.clearPads();
    this.tutorial.reset();
    this.mode = 'ground';
    this.training = false;
    this.player.root.visible = true;
    this.camera.up.set(0, 1, 0);
    this.state = 'menu';
    this.world.reset();
    this.world.setEnv(store.save.eq.env);
    this.obstacles.reset();
    this.traversal.reset();
    this.enemies.reset();
    this.ships.reset();
    this.pickups.reset();
    this.director.reset();
    this.player.reset();
    this.player.invuln = 0;
    this.weapons.reset(store.save.eq.weapon as WeaponId);
    this.player.fwd = 8;
    this.stats = emptyRun();
    this.onState?.('menu');
  }

  refreshLoadout() {
    if (this.state !== 'menu') return;
    this.world.setEnv(store.save.eq.env);
    this.player.reset();
    this.player.invuln = 0;
    this.weapons.reset(store.save.eq.weapon as WeaponId);
    this.player.fwd = 8;
  }

  /** Normal runs are locked until the training course has been completed once. */
  start() {
    if (this.training || !store.trainingDone()) {
      this.startTraining(this.training ? this.tutorial.lessonIdx : store.nextLesson());
      return;
    }
    this.beginRun(false);
  }
  startTraining(idx: number) {
    this.beginRun(true);
    this.tutorial.begin(idx);
  }
  private applyLoadout() {
    // permanent equipment purchased in the shop
    if (store.owns('eq_grenades')) this.weapons.grenades = Math.min(6, this.weapons.grenades + 3);
    if (store.owns('eq_reserve')) this.weapons.grenades = Math.min(6, this.weapons.grenades + 2);
    if (store.owns('eq_traversal')) {
      this.player.eq.grapple = Math.max(this.player.eq.grapple, 1);
      this.player.eq.zip = Math.max(this.player.eq.zip, 1);
    }
  }
  private beginRun(training: boolean) {
    this.audio.init();
    this.audio.ui();
    this.flight.reset();
    this.flight.clearPads();
    this.tutorial.reset();
    this.mode = 'ground';
    this.training = training;
    this.player.root.visible = true;
    this.camera.up.set(0, 1, 0);
    this.world.reset();
    this.world.setEnv(store.save.eq.env);
    this.obstacles.reset();
    this.traversal.reset();
    this.enemies.reset();
    this.ships.reset();
    this.pickups.reset();
    this.director.reset();
    this.stats = emptyRun();
    this.player.reset();
    this.weapons.reset(store.save.eq.weapon as WeaponId);
    this.weapons.auto = store.save.settings.auto;
    this.weapons.trig = false;
    if (!training) this.applyLoadout();
    this.milestones = 0;
    this.bucksFlush = 0;
    this.doubleScoreT = !training && this.pendingDouble ? 60 : 0;
    if (!training) this.pendingDouble = false;
    if (!training && this.pendingHealth) {
      this.pendingHealth = false;
      this.player.health = 100;
      this.player.armor = 40;
    }
    this.time = 0;
    this.bulletT = 0;
    this.deathT = 0;
    this.lastDist = 0;
    this.achT = 3;
    this.damageFlash = 0;
    this.slow = 1;
    this.state = 'playing';
    // snap the camera immediately so the opening frames are framed correctly
    const back = this.camera.aspect < 0.8 ? 9.6 : 8.6;
    const baseFov = this.camera.aspect < 0.8 ? 84 : this.camera.aspect < 1.2 ? 74 : 66;
    this.camera.position.set(this.player.x * 0.55, 4.9, this.player.z + back);
    this.camera.lookAt(this.player.x * 0.75, 1.5, this.player.z - 14);
    this.camera.fov = baseFov;
    this.camera.updateProjectionMatrix();
    this.onState?.('playing');
    if (!training) {
      this.banner(DISTRICT_NAMES.downtown, '#8ecbff', 2.5);
      this.toast('Swipe to dodge  •  Tap to shoot', 'info');
    }
  }

  pause() {
    if (this.state !== 'playing' || this.player.state === 'dead') return;
    this.state = 'paused';
    this.weapons.trig = false;
    store.persist();
    this.onState?.('paused');
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.audio.init();
    this.onState?.('playing');
  }
  quit() {
    this.enterMenu();
  }

  onPlayerDeath() {
    this.deathT = 0;
    this.audio.dead();
    this.weapons.trig = false;
    this.fx.explosion(this.player.center(), 0.8, 0xff5030);
    this.shake(1.2);
  }

  /** the spacecraft was destroyed before the pilot ejected */
  onAirDeath() {
    this.deathT = 0;
    this.player.state = 'dead';
    this.weapons.trig = false;
    this.audio.dead();
    this.shake(1.2);
  }

  /* ---------------------------- aerial mode switching ---------------------------- */
  enterAir(pad: Pad | null) {
    if (this.mode === 'air') return;
    this.mode = 'air';
    this.obstacles.reset();
    this.traversal.reset();
    this.enemies.reset();
    this.pickups.reset();
    this.ships.reset();
    for (const pr of this.weapons.projs) this.weapons.group.remove(pr.mesh);
    this.weapons.projs.length = 0;
    this.weapons.trig = false;
    this.player.sliding = false;
    this.flight.begin(pad, this.training);
  }
  exitAir(kind: 'victory' | 'eject', x: number, z: number) {
    const p = this.player;
    const f = this.flight;
    f.reset();
    f.clearPads();
    f.landed = true;
    this.mode = 'ground';
    p.root.visible = true;
    p.state = 'run';
    p.grounded = true;
    p.y = 0;
    p.vy = 0;
    p.sliding = false;
    p.dashT = 0;
    p.x = Math.max(-5.6, Math.min(5.6, x));
    p.z = z;
    p.lane = p.nearestLane();
    p.fwd = 22;
    p.invuln = 2.5;
    p.groundObj = null;
    this.camera.up.set(0, 1, 0);
    this.lastDist = Math.max(this.lastDist, -z);
    if (!this.training) this.director.afterAir(z);
    this.toast(kind === 'eject' ? 'Safe landing — keep running!' : 'Touchdown — back on the street!', 'good');
    this.audio.land();
  }
  /** training: a would-be hit was blocked */
  trainingHit() {
    this.audio.hit();
    this.tutorial.onHit();
  }

  finishRun() {
    const s = this.stats;
    s.dist = -this.player.z;
    const acc = accuracyOf(s);
    const credits = Math.floor(s.score / 60) + s.kills * 2 + s.ships * 12 + Math.floor(s.dist / 25) + s.bosses * 60;
    const prevBest = store.save.totals.bestScore;
    const newAch = store.checkAchievements(s);
    const { dailyDone } = store.commitRun(s, credits);
    // weekly competition: validated submission of verified run statistics only
    submitRun(s, `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    addChallenges(dailyDone.length);
    const summary: RunSummary = { stats: { ...s, score: Math.floor(s.score) }, credits, accuracy: acc, newAch, daily: dailyDone, best: s.score > prevBest };
    this.state = 'dead';
    this.onState?.('dead', summary);
  }

  /* -------------------------------- helpers -------------------------------- */
  runSpeed() {
    if (this.state === 'menu') return 8;
    if (this.training) return 15;
    const dist = -this.player.z;
    let s = Math.min(MAX_SPEED, BASE_SPEED + dist / 380);
    if (this.player.eq.speed > 0) s *= 1.3;
    return s;
  }
  intensity() {
    return this.director.intensity();
  }
  allTargets(): Target[] {
    return this.tcache;
  }
  private rebuildTargets() {
    const t = this.tcache;
    t.length = 0;
    for (const e of this.enemies.list) if (!e.dead) t.push(e);
    for (const s of this.ships.list) if (!s.dead) t.push(s);
    this.obstacles.targets(t);
  }
  addScore(n: number) {
    let m = this.player.eq.speed > 0 ? 2 : 1;
    if (this.doubleScoreT > 0) m *= 2;
    this.stats.score += n * m;
  }
  /** rewarded-ad revive: only ever offered on the game-over screen */
  reviveFromAd(): boolean {
    if (this.mode === 'air') {
      if (this.state !== 'dead') return false;
      this.flight.revive();
      this.player.state = 'run';
      this.deathT = 0;
      this.state = 'playing';
      this.onState?.('playing');
      this.toast('Hull restored — back in the fight!', 'good');
      this.audio.fanfare();
      return true;
    }
    if (this.state !== 'dead' || this.player.state !== 'dead') return false;
    this.player.state = 'run';
    this.player.health = 60;
    this.player.invuln = 2.5;
    this.player.grounded = true;
    this.player.vy = 0;
    this.player.y = 0;
    this.deathT = 0;
    this.state = 'playing';
    this.onState?.('playing');
    this.toast('Revived — keep running!', 'good');
    this.audio.fanfare();
    return true;
  }
  shake(a: number) {
    this.shakeAmt = Math.min(1.5, Math.max(this.shakeAmt, a));
  }
  toast(text: string, kind: Toast['kind'] = 'info', color?: number) {
    this.onToast?.({ id: this.toastId++, text, kind, color });
  }
  banner(text: string, color = '#ffffff', dur = 3) {
    this.onBanner?.({ id: this.toastId++, text, color, dur });
  }
  addTraversal(label: string, key?: 'ropes' | 'zips' | 'grapples' | 'ladders' | 'vaults') {
    this.stats.traversals++;
    if (key) this.stats[key]++;
    this.addScore(60);
    this.toast(`${label}  +60`, 'good');
  }

  explode(x: number, y: number, z: number, r: number, dmg: number, o: { player?: boolean; playerDmg?: number; color?: number; scale?: number; big?: boolean } = {}) {
    const p = this.player;
    this.fx.explosion({ x, y, z }, o.scale ?? r / 4, o.color ?? 0xff8a30);
    this.audio.explosion(o.big ?? r > 3);
    const dp = Math.hypot(p.x - x, p.y + 1 - y, p.z - z);
    this.shake(Math.min(1, (r / 6) * Math.max(0.2, 1 - dp / 40)));
    if (dmg > 0) {
      const list = [...this.tcache];
      for (const t of list) {
        if (t.dead) continue;
        const b = t.box;
        const dx = Math.max(b.x0 - x, 0, x - b.x1);
        const dy = Math.max(b.y0 - y, 0, y - b.y1);
        const dz = Math.max(b.z0 - z, 0, z - b.z1);
        const d = Math.hypot(dx, dy, dz);
        if (d <= r) t.hurt(dmg * (1 - 0.6 * (d / r)), { x, y, z }, 'explosion');
      }
    }
    if (o.player && dp <= r * 0.8 + 0.5) p.hurt(o.playerDmg ?? 25);
  }

  /* ------------------------------ input actions ------------------------------ */
  moveLane(d: number) {
    if (this.state === 'playing' && this.mode === 'ground') this.player.moveLane(d);
  }
  setLane(i: number) {
    if (this.state === 'playing' && this.mode === 'ground') this.player.setLane(i);
  }
  jump() {
    if (this.state === 'playing' && this.mode === 'ground') this.player.jump();
  }
  slide() {
    if (this.state === 'playing' && this.mode === 'ground') this.player.slide();
  }
  shoot(on: boolean) {
    if (this.mode === 'air') {
      this.flight.setFire(on && this.state === 'playing');
      return;
    }
    this.weapons.trig = on && this.state === 'playing';
  }
  tapShoot() {
    if (this.state !== 'playing') return;
    if (this.mode === 'air') this.flight.tapFire();
    else this.weapons.tapFire();
  }
  toggleAuto() {
    this.weapons.auto = !this.weapons.auto;
    store.save.settings.auto = this.weapons.auto;
    store.persist();
    this.toast(this.weapons.auto ? 'AUTO-FIRE ON' : 'AUTO-FIRE OFF', 'info');
  }
  setMuted(m: boolean) {
    this.audio.setSfx(!m);
    this.audio.setMusic(!m);
    store.save.settings.sfx = !m;
    store.save.settings.music = !m;
    store.persist();
  }

  useAbility(id: AbilityId) {
    const p = this.player;
    if (this.state !== 'playing' || this.mode !== 'ground' || p.state === 'dead' || this.abilityCd > 0) return;
    const ab = ABILITIES.find((a) => a.id === id)!;
    if (!store.owns(id)) return this.toast(`${ab.name} is locked — unlock it in the Armory`, 'bad');
    if (p.energy < ab.energy) return this.toast(`Need ${ab.energy} energy for ${ab.name}`, 'bad');
    if (id === 'dash' && (p.state !== 'run' || p.dashT > 0)) return;
    p.energy -= ab.energy;
    this.abilityCd = 0.5;
    this.audio.ui();
    switch (id) {
      case 'dash': p.startDash(); break;
      case 'bullet': this.bulletT = 4; this.toast('BULLET TIME', 'good'); break;
      case 'drone': p.eq.drone = 25; this.toast('Companion drone online', 'good'); break;
      case 'invuln': p.eq.phase = 5; this.toast('PHASE SHIELD — invulnerable!', 'good'); break;
      case 'blast': this.blast(); break;
    }
  }
  private blast() {
    const p = this.player;
    this.fx.ring({ x: p.x, y: 1, z: p.z - 2 }, 0xffb040, 14);
    this.fx.ring({ x: p.x, y: 1, z: p.z - 8 }, 0xffe080, 20);
    this.fx.explosion({ x: p.x, y: 1, z: p.z - 12 }, 1.5, 0xffb040);
    this.audio.explosion(true);
    this.shake(1);
    for (const t of [...this.tcache]) {
      if (t.dead) continue;
      const cz = (t.box.z0 + t.box.z1) / 2;
      if (cz < p.z + 6 && cz > p.z - 60) t.hurt(260, { x: (t.box.x0 + t.box.x1) / 2, y: 1.5, z: cz }, 'blast');
    }
    this.weapons.clearEnemyShots();
  }

  /* ---------------------------------- loop ---------------------------------- */
  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const raw = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.frame(raw);
  };

  private frame(raw: number) {
    if (this.state === 'paused') {
      this.render(0);
      return;
    }
    let target = 1;
    if (this.bulletT > 0 && this.state === 'playing') {
      this.bulletT -= raw;
      target = 0.42;
    }
    if (this.player.state === 'dead') target = 0.3;
    this.slow += (target - this.slow) * Math.min(1, raw * 8);
    const dt = raw * this.slow;
    this.time += dt;
    this.abilityCd = Math.max(0, this.abilityCd - raw);

    const p = this.player;
    if (this.state === 'menu') {
      p.update(dt);
      this.world.update(dt, p.z, this.camera.position, this.time);
      this.fx.update(dt);
      this.audio.update(raw, false);
      this.menuCamera();
      this.render(dt);
      return;
    }
    if (this.state === 'dead') {
      // keep the world alive behind the summary screen
      this.fx.update(dt);
      this.world.update(dt, p.z, this.camera.position, this.time);
      this.render(dt);
      return;
    }

    if (this.mode === 'air') {
      this.airFrame(raw, dt);
      return;
    }

    this.rebuildTargets();
    p.update(dt);
    this.traversal.update(dt);
    this.obstacles.collide(p);
    this.obstacles.update(dt);
    this.pickups.update(dt);
    this.weapons.update(dt, raw);
    this.enemies.update(dt);
    this.ships.update(dt);
    if (this.training) this.tutorial.update(dt);
    else this.director.update(dt);
    this.flight.updatePads(dt);
    this.world.update(dt, p.z, this.camera.position, this.time);
    this.fx.update(dt);

    // run stats & score
    if (p.state !== 'dead') {
      const d = -p.z;
      if (d > this.lastDist) {
        this.addScore(d - this.lastDist);
        this.lastDist = d;
      }
      const ms = Math.floor(d / 500);
      if (!this.training && ms > this.milestones) {
        this.milestones = ms;
        store.addBucks(50);
        this.toast(`Distance milestone ${ms * 500}m  +50 ALIEN BUCKS`, 'good');
        this.audio.pickup('buck');
      }
      if (p.medkits > 0 && p.health > 0 && p.health < 30) {
        p.medkits--;
        p.heal(15);
        this.toast('Auto med-kit: +15 HP', 'good');
        this.audio.pickup('health');
        this.fx.ring(p.center(), 0x39ff6a, 2.5);
      }
      this.stats.dist = d;
      this.stats.time += raw;
      p.energy = Math.min(100, p.energy + dt * 0.6);
      this.doubleScoreT = Math.max(0, this.doubleScoreT - raw);
      this.bucksFlush += raw;
      if (this.bucksFlush > 4) {
        this.bucksFlush = 0;
        store.persist();
      }
    } else {
      this.deathT += raw;
      if (this.deathT > 1.9) this.finishRun();
    }
    this.hitMarker = Math.max(0, this.hitMarker - raw);
    this.damageFlash = Math.max(0, this.damageFlash - raw * 2.2);
    this.audio.intensity += (this.director.intensity() - this.audio.intensity) * Math.min(1, raw * 0.5);
    this.audio.update(raw, true);

    this.achT -= raw;
    if (this.achT <= 0 && p.state !== 'dead' && !this.training) {
      this.achT = 2;
      this.stats.weaponsSeen = this.weapons.owned.size;
      for (const a of store.checkAchievements(this.stats)) {
        this.toast(`Achievement: ${a.name}  (+${a.reward} ◆ Alien Bucks)`, 'achv');
        this.audio.fanfare();
      }
    }

    this.updateCamera(dt);
    this.render(dt);

    this.hudT -= raw;
    if (this.hudT <= 0 && this.onHud) {
      this.hudT = 0.07;
      this.onHud(this.hudSnapshot());
    }
  }

  /** aerial spacecraft frame: own physics, camera, weapons and health */
  private airFrame(raw: number, dt: number) {
    const p = this.player;
    const f = this.flight;
    f.update(dt, raw);
    if (this.mode !== 'air') return; // the sortie just ended
    if (this.training) this.tutorial.update(dt);
    this.world.update(dt, f.z, this.camera.position, this.time);
    this.fx.update(dt);
    f.updateCamera(this.camera, dt);
    if (p.state !== 'dead') {
      const d = -f.z;
      if (d > this.lastDist) {
        this.addScore(d - this.lastDist);
        this.lastDist = d;
      }
      const ms = Math.floor(d / 500);
      if (!this.training && ms > this.milestones) {
        this.milestones = ms;
        store.addBucks(50);
        this.toast(`Distance milestone ${ms * 500}m  +50 ALIEN BUCKS`, 'good');
        this.audio.pickup('buck');
      }
      this.stats.dist = d;
      this.stats.time += raw;
      this.stats.airTime += raw;
      this.bucksFlush += raw;
      if (this.bucksFlush > 4) {
        this.bucksFlush = 0;
        store.persist();
      }
    } else {
      this.deathT += raw;
      if (this.deathT > 2.4) this.finishRun();
    }
    this.hitMarker = Math.max(0, this.hitMarker - raw);
    this.damageFlash = Math.max(0, this.damageFlash - raw * 2.2);
    this.audio.intensity += (0.9 - this.audio.intensity) * Math.min(1, raw * 0.5);
    this.audio.update(raw, true);
    this.render(dt);
    this.hudT -= raw;
    if (this.hudT <= 0 && this.onHud) {
      this.hudT = 0.07;
      this.onHud(this.hudSnapshot());
    }
  }

  private render(dt: number) {
    void dt;
    this.renderer.render(this.scene, this.camera);
  }

  private menuCamera() {
    const p = this.player;
    const t = this.time * 0.35;
    this.camera.position.set(p.x + 3.2 + Math.sin(t) * 0.8, 1.7 + Math.sin(t * 0.7) * 0.2, p.z - 4.6);
    this.camera.lookAt(p.x, 1.25, p.z - 0.4);
    this.camera.fov = 52;
    this.camera.updateProjectionMatrix();
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const c = this.camera;
    const portrait = c.aspect < 0.8;
    const back = (portrait ? 9.6 : 8.6) + (p.state === 'rope' || p.state === 'grapple' ? 2 : 0) + (p.dashT > 0 ? 1.5 : 0);
    const up = (portrait ? 4.9 : 4.2) + p.y * 0.6;
    this.cam.set(p.x * 0.55, up, p.z + back);
    const k = Math.min(1, dt * 7);
    c.position.x += (this.cam.x - c.position.x) * k;
    c.position.y += (this.cam.y - c.position.y) * Math.min(1, dt * 5);
    c.position.z = this.cam.z;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    this.camKick = Math.max(0, this.camKick - dt * 6);
    if (this.shakeAmt > 0.001) {
      c.position.x += (Math.random() - 0.5) * this.shakeAmt * 0.5;
      c.position.y += (Math.random() - 0.5) * this.shakeAmt * 0.4;
    }
    c.position.y += this.camKick * 0.04;
    this.lookAt.set(p.x * 0.75, 1.5 + p.y * 0.45 - this.camKick * 0.1, p.z - 14);
    c.lookAt(this.lookAt);
    const baseFov = c.aspect < 0.8 ? 84 : c.aspect < 1.2 ? 74 : 66;
    const tf = baseFov + (this.runSpeed() - 20) * 0.35 + (p.dashT > 0 ? 12 : 0);
    if (Math.abs(c.fov - tf) > 0.05) {
      c.fov += (tf - c.fov) * Math.min(1, dt * 4);
      c.updateProjectionMatrix();
    }
  }

  /* ----------------------------------- HUD ----------------------------------- */
  private laneOfX(x: number) {
    let b = 0;
    for (let i = 1; i < 4; i++) if (Math.abs(LANE_X[i] - x) < Math.abs(LANE_X[b] - x)) b = i;
    return b;
  }

  hudSnapshot(): HudState {
    const p = this.player;
    const w = this.weapons;
    const def = WEAPONS[w.cur];
    const slot = w.slot();
    const threat = [false, false, false, false];
    for (const pr of w.projs) {
      if (pr.owner !== 'e') continue;
      const dz = p.z - pr.pos.z;
      if (dz > -2 && dz < 70) threat[this.laneOfX(pr.pos.x + pr.vel.x * 0.4)] = true;
    }
    for (const m of this.ships.markers) threat[this.laneOfX(m.x)] = true;
    for (const b of this.ships.beams) threat[this.laneOfX(b.x)] = true;
    for (const e of this.enemies.list) {
      if (e.dead || e.def.contact <= 0) continue;
      const dz = p.z - e.z;
      if (dz > 0 && dz < 38) threat[this.laneOfX(e.x)] = true;
    }
    const cmd = this.enemies.commander;
    const dist = -p.z;
    const ab = ABILITIES.filter((a) => store.owns(a.id)).map((a) => ({ id: a.id, name: a.name, ready: p.energy >= a.energy, energy: a.energy }));
    return {
      dist: Math.floor(dist),
      score: Math.floor(this.stats.score),
      health: Math.ceil(p.health),
      maxHealth: p.maxHealth,
      armor: Math.ceil(p.armor),
      shield: Math.ceil(p.shield),
      energy: Math.floor(p.energy),
      weapon: {
        id: w.cur, name: def.name, mag: slot.mag, magMax: def.mag, reserve: slot.reserve, infinite: def.reserve === 0,
        reloading: w.reloading, reloadPct: w.reloading ? 1 - w.reloadT / def.reload : 0,
      },
      owned: WEAPON_ORDER.filter((id) => w.owned.has(id)).map((id) => ({ id, name: WEAPONS[id].name, active: id === w.cur })),
      grenades: w.grenades,
      eq: { grapple: p.eq.grapple, zip: p.eq.zip, boots: Math.ceil(p.eq.boots), gloves: Math.ceil(p.eq.gloves), pshield: Math.ceil(p.eq.pshield), speed: Math.ceil(p.eq.speed), phase: Math.ceil(p.eq.phase), drone: Math.ceil(p.eq.drone) },
      abilities: ab,
      prompt: this.traversal.prompt || this.flight.padPrompt(),
      boss: cmd && !cmd.dead ? { name: cmd.def.name, hp: cmd.hp / cmd.maxHp } : null,
      threat,
      lane: p.lane,
      auto: w.auto,
      hit: this.hitMarker > 0,
      dmg: this.damageFlash,
      speed: this.runSpeed(),
      district: DISTRICT_NAMES[districtAt(dist)],
      event: this.director.event.active,
      bullet: this.bulletT > 0,
      traversalState: p.state,
      canGrapple: p.eq.grapple > 0 && this.traversal.findCrossing(true) !== null && p.state === 'run',
      canZip: p.eq.zip > 0 && this.traversal.findCrossing(false) !== null && p.state === 'run',
      muted: !this.audio.sfxOn,
      bucks: store.bucks(),
      medkits: p.medkits,
      laneButtons: store.save.settings.laneButtons,
      mode: this.mode,
      air: this.mode === 'air' ? this.flight.hud() : null,
      train: this.training ? this.tutorial.hud() : null,
    };
  }
}
