import * as THREE from 'three';
import type { Game } from './game';
import { WEAPONS, type WeaponId } from './config';
import { makePickup, PICKUP_COLOR, PICKUP_LABEL, type PickupKind } from './models';
import { store } from './progress';

export interface PItem {
  kind: PickupKind;
  weapon?: WeaponId;
  tier: number;
  group: THREE.Group;
  item: THREE.Group;
  halo: THREE.Sprite | null;
  x: number;
  y: number;
  z: number;
  t: number;
}

/** Alien Buck value of each currency pickup. */
const BUCK_VALUE: Partial<Record<PickupKind, number>> = { buck: 10, buck3: 30, buckBundle: 75 };

export class Pickups {
  g: Game;
  list: PItem[] = [];
  group: THREE.Group;
  /** one pooled light that follows the nearest pickup — a small local glow, never a spotlight */
  light: THREE.PointLight;

  constructor(g: Game) {
    this.g = g;
    this.group = new THREE.Group();
    g.scene.add(this.group);
    this.light = new THREE.PointLight(0xffffff, 0, 7.5, 2);
    this.light.position.set(0, -50, 0);
    g.scene.add(this.light);
  }

  reset() {
    for (const p of this.list) this.group.remove(p.group);
    this.list.length = 0;
  }

  spawn(kind: PickupKind, x: number, y: number, z: number, weapon?: WeaponId, tier = 1) {
    const { group, item } = makePickup(kind, weapon, tier);
    group.position.set(x, y, z);
    this.group.add(group);
    const halo = group.children.find((c) => (c as THREE.Sprite).isSprite) as THREE.Sprite | null;
    const it: PItem = { kind, weapon, tier, group, item, halo, x, y, z, t: Math.random() * 6 };
    this.list.push(it);
    return it;
  }

  update(dt: number) {
    const g = this.g;
    const p = g.player;
    const magnet = p.eq.gloves > 0 ? 11 : 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      it.t += dt;
      it.item.rotation.y = it.t * 2.2;
      it.item.position.y = 0.95 + Math.sin(it.t * 3) * 0.08;
      if (it.halo) {
        const pulse = 1.45 + Math.sin(it.t * 3.4) * 0.16;
        it.halo.scale.set(pulse, pulse, 1);
      }
      if (magnet > 0 && p.state !== 'dead') {
        const dz = p.z - it.z;
        if (dz > -magnet && dz < 3 && Math.abs(p.x - it.x) < 6) {
          const k = Math.min(1, dt * 7);
          it.x += (p.x - it.x) * k;
          it.z += (p.z - it.z) * k;
          it.y += (p.y - it.y) * k * 0.7;
        }
      }
      it.group.position.set(it.x, it.y, it.z);
      if (p.state !== 'dead') {
        const reachX = p.eq.gloves > 0 ? 1.7 : 1.25;
        const near = Math.abs(p.x - it.x) < reachX && p.z <= it.z + 1.5 && p.z >= it.z - 1.5 - p.fwd * dt;
        const vert = p.y + p.h > it.y + 0.1 && p.y < it.y + 2.3;
        if (near && vert) {
          this.collect(it);
          this.group.remove(it.group);
          this.list.splice(i, 1);
          continue;
        }
      }
      if (it.z > p.z + 12) {
        this.group.remove(it.group);
        this.list.splice(i, 1);
      }
    }
    // small local light on the nearest pickup only
    let best: PItem | null = null;
    let bd = 20;
    for (const it of this.list) {
      const d = Math.abs(it.z - p.z);
      if (d < bd && Math.abs(it.x - p.x) < 9) {
        bd = d;
        best = it;
      }
    }
    if (best) {
      this.light.position.set(best.x, best.y + 1, best.z);
      this.light.color.setHex(PICKUP_COLOR[best.kind]);
      this.light.intensity = 11;
    } else this.light.intensity = 0;
  }

  collect(it: PItem) {
    const g = this.g;
    const p = g.player;
    const w = g.weapons;
    g.stats.pickups++;
    g.addScore(10);
    let msg = PICKUP_LABEL[it.kind];
    switch (it.kind) {
      case 'ammo': msg = w.addAmmo(); break;
      case 'health': {
        const heal = [15, 30, 50][it.tier] ?? 30;
        if (p.health >= p.maxHealth) {
          if (!g.training) store.addBucks(10);
          msg = 'Health full — converted to +10 Alien Bucks';
        } else {
          p.heal(heal);
          msg = `+${heal} Health`;
        }
        break;
      }
      case 'buck':
      case 'buck3':
      case 'buckBundle': {
        const v = BUCK_VALUE[it.kind] ?? 10;
        if (!g.training) store.addBucks(v);
        msg = g.training ? `+${v} ALIEN BUCKS (practice)` : `+${v} ALIEN BUCKS`;
        break;
      }
      case 'energy': p.energy = Math.min(100, p.energy + 35); msg = '+35 Energy'; break;
      case 'grenade': w.grenades = Math.min(6, w.grenades + 2); msg = '+2 Grenades'; break;
      case 'weapon': {
        const id = it.weapon ?? 'rifle';
        const isNew = !w.owned.has(id);
        w.addWeapon(id, true);
        g.stats.weaponPickups++;
        if (isNew) w.switchTo(id);
        msg = isNew ? `${WEAPONS[id].name} acquired!` : `${WEAPONS[id].name}: ammo restocked`;
        break;
      }
      case 'armor': p.armor = Math.min(75, p.armor + 40); msg = '+40 Armor'; break;
      case 'shield': p.eq.pshield = 8; p.shield = Math.min(100, p.shield + 25); msg = 'Energy Shield online (8s)'; break;
      case 'speed': p.eq.speed = 6; msg = 'SPEED BOOST — 2x score!'; break;
      case 'special': p.energy = Math.min(100, p.energy + 60); msg = '+60 Energy (ability charge)'; break;
      case 'grapple': p.eq.grapple = Math.min(4, p.eq.grapple + 2); msg = 'Grappling Hook +2 (tap 🪝 near anchors)'; break;
      case 'zip': p.eq.zip = Math.min(4, p.eq.zip + 2); msg = 'Zipline Launcher +2 (tap ➰ near gaps)'; break;
      case 'boots': p.eq.boots = 15; msg = 'Jump Boots (15s)'; break;
      case 'gloves': p.eq.gloves = 15; msg = 'Magnetic Gloves (15s)'; break;
    }
    g.toast(msg, 'pickup', PICKUP_COLOR[it.kind]);
    g.audio.pickup(it.kind);
    g.fx.ring({ x: it.x, y: it.y + 1, z: it.z }, PICKUP_COLOR[it.kind], 3);
    g.fx.sparks({ x: it.x, y: it.y + 1, z: it.z }, PICKUP_COLOR[it.kind], 10, 5);
  }
}
