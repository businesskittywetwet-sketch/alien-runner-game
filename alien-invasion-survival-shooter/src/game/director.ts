import type { Game } from './game';
import { districtAt, ENEMIES, LANE_X, type DistrictId, type EnemyType } from './config';
import { Patterns, type GapKind } from './patterns';
import type { Enemy } from './enemies';
import type { ShipKind } from './ships';
import { lerp, rand } from './util';
import type { PickupKind } from './models';
import { store } from './progress';

type PatName =
  | 'car' | 'burning' | 'barrier' | 'debris' | 'fallenLight' | 'crater' | 'lowWall' | 'railing' | 'pipe' | 'crates'
  | 'truckRamp' | 'shipPad' | 'billboard' | 'scaffold' | 'barricade' | 'electric' | 'barrels' | 'debrisFall' | 'gap';

export class Director {
  g: Game;
  pat: Patterns;
  nextZ = -110;
  nextPickupZ = -70;
  lastPadZ = 300;
  enemyT = 6;
  shipT = 30;
  lastGapZ = 0;
  event = { active: false, t: 0, beamT: 3, next: 700 };
  boss = { active: false, next: 1800 };
  eventI = 0;
  lastGapKind: GapKind = 'rope';

  constructor(g: Game) {
    this.g = g;
    this.pat = new Patterns(g);
  }

  reset() {
    this.nextZ = -110;
    this.nextPickupZ = -70;
    this.lastPadZ = 300;
    this.enemyT = 7;
    this.shipT = 30;
    this.lastGapZ = 0;
    this.event = { active: false, t: 0, beamT: 3, next: 700 };
    this.boss = { active: false, next: 1800 };
    this.eventI = 0;
  }

  intensity() {
    const d = Math.min(1, -this.g.player.z / 5000) * 0.8;
    return Math.min(1, d + (this.event.active ? 0.3 : 0) + (this.boss.active ? 0.2 : 0));
  }

  /* ------------------------------- obstacles ------------------------------- */
  private weights(dist: number, dd: DistrictId): [PatName, number][] {
    const ind = dd === 'industrial';
    const dt = dd === 'downtown';
    const hw = dd === 'highway';
    const padOk = dist > 450 && this.nextZ < this.lastPadZ - 1000 && !this.boss.active && !this.event.active && this.g.flight.pads.length === 0;
    const w: [PatName, number][] = [
      ['car', hw ? 14 : 9],
      ['burning', hw || dt ? 8 : 5],
      ['barrier', ind ? 12 : 8],
      ['debris', 7],
      ['fallenLight', dt ? 9 : 6],
      ['crater', 5],
      ['lowWall', 7],
      ['railing', 5],
      ['pipe', ind ? 10 : 3],
      ['crates', ind ? 9 : 4],
      ['truckRamp', hw || ind ? 8 : 4],
      ['shipPad', padOk ? 14 : 0],
      ['billboard', dt ? 8 : 4],
      ['scaffold', ind ? 8 : 4],
    ];
    if (dist > 250) w.push(['electric', ind ? 9 : 4], ['barrels', ind ? 8 : 4]);
    if (dist > 350) w.push(['debrisFall', dt ? 7 : 3]);
    if (dist > 400) w.push(['barricade', hw ? 7 : 4]);
    if (dist > 250 && this.nextZ < this.lastGapZ - 230 && !this.boss.active) w.push(['gap', 11]);
    return w;
  }

  private spawnPattern(z: number): number {
    const g = this.g;
    const dist = -z;
    const dd = districtAt(dist);
    const w = this.weights(dist, dd);
    let tot = 0;
    for (const [, x] of w) tot += x;
    let r = Math.random() * tot;
    let name: PatName = 'car';
    for (const [n, x] of w) {
      r -= x;
      if (r <= 0) {
        name = n;
        break;
      }
    }
    const P = this.pat;
    if (name === 'gap') {
      const kinds: GapKind[] = ['rope', 'zip', 'bar', 'plat', 'grapple'];
      let k = kinds[Math.floor(Math.random() * kinds.length)];
      if (k === this.lastGapKind) k = kinds[(kinds.indexOf(k) + 1) % kinds.length];
      this.lastGapKind = k;
      this.lastGapZ = z;
      // equipment hint before the gap
      const p = g.player;
      if (k === 'grapple' && p.eq.grapple <= 0 && Math.random() < 0.8) this.placeAt('grapple', z + 32);
      else if (p.eq.zip <= 0 && p.eq.grapple <= 0 && Math.random() < 0.35) this.placeAt(Math.random() < 0.5 ? 'zip' : 'grapple', z + 30);
      return P.gap(z, k);
    }
    return P[name](z);
  }

  private placeAt(kind: PickupKind, z: number) {
    const g = this.g;
    for (let i = 0; i < 6; i++) {
      const l = Math.floor(Math.random() * 4);
      if (g.obstacles.free(LANE_X[l], z, 3)) {
        g.pickups.spawn(kind, LANE_X[l], 0, z);
        return;
      }
      z += 2;
    }
  }

  private spawnPickup(z: number) {
    const g = this.g;
    const P = this.pat;
    for (let i = 0; i < 6; i++) {
      const l = Math.floor(Math.random() * 4);
      const zz = z - i * 2;
      if (g.obstacles.free(LANE_X[l], zz, 3.2)) {
        P.reward(LANE_X[l], 0, zz);
        return;
      }
    }
  }

  /* ------------------------------- enemies -------------------------------- */
  private pickEnemy(dist: number): EnemyType {
    const g = this.g;
    const types = (Object.keys(ENEMIES) as EnemyType[]).filter((t) => t !== 'commander' && ENEMIES[t].from <= dist);
    const e = g.enemies;
    const w = types.map((t) => {
      let x = ENEMIES[t].weight;
      if (t === 'brute' && e.count('brute') >= (this.event.active ? 2 : 1)) x = 0;
      if (t === 'sniper' && e.count('sniper') >= 2) x = 0;
      if (t === 'hunter' && e.count('hunter') >= 2) x = 0;
      if (t === 'drone' && e.count('drone') >= 3) x = 0;
      return x;
    });
    let tot = w.reduce((a, b) => a + b, 0);
    if (tot <= 0) return 'scout';
    let r = Math.random() * tot;
    for (let i = 0; i < types.length; i++) {
      r -= w[i];
      if (r <= 0) return types[i];
    }
    tot = 0;
    return 'scout';
  }

  private freeLane(z: number, prefer?: number): number {
    const g = this.g;
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    if (prefer !== undefined) order.unshift(prefer);
    for (const l of order) if (!g.obstacles.laneBlocked(l, z - 18, z + 28)) return l;
    return order[0];
  }

  private spawnEnemyGroup() {
    const g = this.g;
    const p = g.player;
    const dist = -p.z;
    const z = p.z - rand(120, 145);
    const type = this.pickEnemy(dist);
    const preferPlayer = Math.random() < 0.3 ? p.lane : undefined;
    if (type === 'sniper') {
      const side = Math.random() < 0.5 ? -1 : 1;
      const b = g.world.buildingAt(side, z);
      if (b && Math.abs((b.z0 + b.z1) / 2 - z) < 14) {
        g.enemies.spawn('sniper', 0, (b.z0 + b.z1) / 2, { side, y: b.h });
        return;
      }
      g.enemies.spawn('scout', this.freeLane(z, preferPlayer), z);
      return;
    }
    if (type === 'scout') {
      const n = 1 + Math.floor(Math.random() * (1 + Math.min(2, dist / 800)));
      const used: number[] = [];
      for (let i = 0; i < n; i++) {
        let l = this.freeLane(z - i * 4, i === 0 ? preferPlayer : undefined);
        if (used.includes(l)) l = (l + 1) % 4;
        used.push(l);
        g.enemies.spawn('scout', l, z - i * 4);
      }
      return;
    }
    g.enemies.spawn(type, this.freeLane(z, preferPlayer), z);
  }

  callReinforcements() {
    const g = this.g;
    const p = g.player;
    const lanes = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 3; i++) g.enemies.spawn(i === 2 ? 'soldier' : 'scout', lanes[i], p.z - 85 - i * 4, { y: 26, fall: true });
  }

  /* --------------------------------- loot --------------------------------- */
  onKill(e: Enemy) {
    const g = this.g;
    if (g.training) return; // training never pays or drops loot
    // Alien Bucks for every kill, with a rare bundle drop
    const bucks = { scout: 2, soldier: 4, brute: 12, drone: 3, hunter: 6, sniper: 6, commander: 150 }[e.type];
    store.addBucks(bucks);
    const ch = { scout: 0.1, soldier: 0.22, brute: 1, drone: 0.15, hunter: 0.5, sniper: 0.4, commander: 0 }[e.type];
    let l = 0;
    for (let i = 1; i < 4; i++) if (Math.abs(LANE_X[i] - e.x) < Math.abs(LANE_X[l] - e.x)) l = i;
    if (Math.random() < ch && g.obstacles.free(LANE_X[l], e.z, 2.5)) {
      this.pat.reward(LANE_X[l], 0, e.z, e.type === 'brute' && Math.random() < 0.4 ? 'weapon' : undefined);
    } else if (Math.random() < 0.05) {
      if (g.obstacles.free(LANE_X[l], e.z, 2.5)) g.pickups.spawn(Math.random() < 0.75 ? 'buck3' : 'buckBundle', LANE_X[l], 0, e.z);
    }
  }
  dropLoot(x: number, z: number, from: string) {
    const g = this.g;
    if (from === 'ship') store.addBucks(12);
    let l = 0;
    for (let i = 1; i < 4; i++) if (Math.abs(LANE_X[i] - x) < Math.abs(LANE_X[l] - x)) l = i;
    const kind: PickupKind = from === 'ship' ? (Math.random() < 0.4 ? 'weapon' : Math.random() < 0.5 ? 'energy' : 'health') : 'ammo';
    for (let i = 0; i < 5; i++) {
      if (g.obstacles.free(LANE_X[l], z - i * 3, 2.5)) {
        this.pat.reward(LANE_X[l], 0, z - i * 3, kind);
        return;
      }
    }
  }
  /** after a spacecraft sortie: restart the street generator ahead of the landing point */
  afterAir(z: number) {
    this.nextZ = z - 130;
    this.nextPickupZ = z - 100;
    this.enemyT = 6;
    this.shipT = 25;
    this.event.next = Math.max(this.event.next, -z + 700);
    this.boss.next = Math.max(this.boss.next, -z + 1500);
    this.lastPadZ = z;
  }
  bossDown() {
    const g = this.g;
    this.boss.active = false;
    this.boss.next = -g.player.z + 2400;
    g.addScore(1000);
    store.addBucks(150);
    const z = g.player.z - 55;
    const ks: PickupKind[] = ['weapon', 'health', 'armor', 'energy'];
    ks.forEach((k, i) => this.pat.reward(LANE_X[i], 0, z - i * 3, k));
  }

  /* -------------------------------- events -------------------------------- */
  private startEvent() {
    const g = this.g;
    this.event.active = true;
    this.event.t = 0;
    this.event.beamT = 4;
    g.banner('ALIEN INVASION!', '#ff3355', 4);
    g.toast('The mothership is attacking — survive!', 'bad');
    g.audio.siren(4);
    g.audio.screech();
    g.shake(0.6);
    const kinds: ShipKind[] = ['fighter', 'fighter', 'transport', 'bomber'];
    kinds.forEach((k, i) => setTimeout(() => this.g.state === 'playing' && this.event.active && this.g.ships.spawn(k), 800 + i * 3500));
  }
  private endEvent() {
    const g = this.g;
    this.event.active = false;
    this.event.next = -g.player.z + 1500;
    g.stats.events++;
    g.addScore(500);
    g.banner('INVASION REPELLED  +500', '#40ffa0', 3);
    g.audio.fanfare();
    const z = g.player.z - 60;
    this.pat.reward(LANE_X[1], 0, z, 'health');
    this.pat.reward(LANE_X[2], 0, z - 4, 'special');
  }

  /* -------------------------------- update -------------------------------- */
  update(dt: number) {
    const g = this.g;
    const p = g.player;
    const dist = -p.z;
    const d = Math.min(1, dist / 5000);

    while (this.nextZ > p.z - 190) {
      const len = this.spawnPattern(this.nextZ);
      this.nextZ -= len + lerp(46, 26, d) + rand(0, 10);
    }
    while (this.nextPickupZ > p.z - 150) {
      this.spawnPickup(this.nextPickupZ);
      this.nextPickupZ -= rand(34, 62);
    }

    // enemies
    this.enemyT -= dt;
    const alive = g.enemies.count();
    const cap = 4 + Math.floor(8 * d) + (this.event.active ? 3 : 0);
    if (this.enemyT <= 0 && dist > 60) {
      if (alive < cap) this.spawnEnemyGroup();
      this.enemyT = (lerp(3.4, 1.4, d) / (this.event.active ? 1.7 : 1)) * (this.boss.active ? 1.6 : 1) * rand(0.8, 1.2);
    }

    // ships
    this.shipT -= dt;
    const maxShips = this.event.active ? 5 : 2;
    if (this.shipT <= 0 && dist > 260) {
      this.shipT = rand(16, 26) / (this.event.active ? 2.2 : 1);
      if (g.ships.count() < maxShips) {
        const opts: [ShipKind, number][] = [['scout', 4]];
        if (dist > 600) opts.push(['fighter', 3]);
        if (dist > 900) opts.push(['bomber', 2.5]);
        if (dist > 1300) opts.push(['transport', 2]);
        let tot = 0;
        for (const [, x] of opts) tot += x;
        let r = Math.random() * tot;
        let k: ShipKind = 'scout';
        for (const [kk, x] of opts) {
          r -= x;
          if (r <= 0) {
            k = kk;
            break;
          }
        }
        g.ships.spawn(k);
      }
    }

    // invasion events
    const ev = this.event;
    if (!ev.active && dist > ev.next && !this.boss.active) this.startEvent();
    if (ev.active) {
      ev.t += dt;
      ev.beamT -= dt;
      if (ev.beamT <= 0) {
        ev.beamT = rand(2.2, 3.4);
        g.ships.beamStrike(Math.random() < 0.65 ? p.lane : Math.floor(Math.random() * 4));
      }
      if (ev.t > 26) this.endEvent();
    }
    this.eventI += ((ev.active ? 1 : 0) - this.eventI) * Math.min(1, dt * 0.8);
    g.world.eventI = this.eventI;

    // boss
    if (!this.boss.active && !ev.active && dist > this.boss.next) {
      this.boss.active = true;
      g.enemies.spawn('commander', 1, p.z - 55, { hpMul: 1 + Math.floor(dist / 2400) * 0.35 });
      g.banner('ALIEN COMMANDER', '#ffd54f', 3.5);
      g.toast('Boss fight — take him down!', 'bad');
      g.audio.siren(2);
    }
    if (this.boss.active && !g.enemies.commander) {
      this.boss.active = false;
      this.boss.next = dist + 1800;
    }
  }
}
