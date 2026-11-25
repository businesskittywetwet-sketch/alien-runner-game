export const LANE_X = [-4.5, -1.5, 1.5, 4.5];
export const ROAD_HALF = 6;
export const GRAVITY = 34;
export const JUMP_V = 11.5;
export const BASE_SPEED = 20;
export const MAX_SPEED = 35;

export type WeaponId = 'pistol' | 'rifle' | 'smg' | 'shotgun' | 'sniper' | 'plasma' | 'rocket' | 'laser' | 'railgun' | 'sunlance';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  desc: string;
  dmg: number;
  pellets: number;
  rate: number;
  mag: number;
  reserve: number; // max reserve ammo (0 = infinite)
  reload: number;
  spread: number;
  speed: number;
  range: number;
  pierce: number;
  splash: number;
  color: number;
  kind: 'bullet' | 'plasma' | 'rocket' | 'laser';
  cost: number;
  gems: number; // premium (Alien Gems) price, 0 = not gem-purchasable
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: { id: 'pistol', name: 'M9 Pistol', desc: 'Reliable sidearm with infinite reserve ammo.', dmg: 22, pellets: 1, rate: 4.5, mag: 12, reserve: 0, reload: 0.8, spread: 0.012, speed: 150, range: 130, pierce: 1, splash: 0, color: 0xffe08a, kind: 'bullet', cost: 0, gems: 0 },
  rifle: { id: 'rifle', name: 'AR-18 Rifle', desc: 'Accurate full-auto all-rounder.', dmg: 19, pellets: 1, rate: 9, mag: 30, reserve: 240, reload: 1.4, spread: 0.02, speed: 170, range: 140, pierce: 1, splash: 0, color: 0xffd54f, kind: 'bullet', cost: 0, gems: 0 },
  smg: { id: 'smg', name: 'Vector SMG', desc: 'Huge fire rate, close and mid range.', dmg: 11, pellets: 1, rate: 15, mag: 40, reserve: 320, reload: 1.2, spread: 0.045, speed: 150, range: 110, pierce: 1, splash: 0, color: 0xffcc80, kind: 'bullet', cost: 0, gems: 0 },
  shotgun: { id: 'shotgun', name: 'Breacher Shotgun', desc: '8 pellets. Devastating up close.', dmg: 10, pellets: 8, rate: 1.4, mag: 6, reserve: 48, reload: 1.7, spread: 0.1, speed: 130, range: 50, pierce: 1, splash: 0, color: 0xffab40, kind: 'bullet', cost: 0, gems: 0 },
  sniper: { id: 'sniper', name: 'Longshot Sniper', desc: 'Piercing high damage rounds.', dmg: 130, pellets: 1, rate: 0.95, mag: 5, reserve: 30, reload: 2.0, spread: 0, speed: 320, range: 220, pierce: 4, splash: 0, color: 0xffffff, kind: 'bullet', cost: 350, gems: 0 },
  plasma: { id: 'plasma', name: 'Plasma Rifle', desc: 'Alien tech bolts with splash damage.', dmg: 30, pellets: 1, rate: 4.5, mag: 24, reserve: 150, reload: 1.6, spread: 0.015, speed: 95, range: 130, pierce: 1, splash: 2.4, color: 0x40ffd0, kind: 'plasma', cost: 500, gems: 0 },
  rocket: { id: 'rocket', name: 'Rocket Launcher', desc: 'Massive blast radius. Wrecks barricades.', dmg: 110, pellets: 1, rate: 0.9, mag: 2, reserve: 12, reload: 2.2, spread: 0, speed: 60, range: 160, pierce: 1, splash: 5.5, color: 0xff7043, kind: 'rocket', cost: 650, gems: 0 },
  laser: { id: 'laser', name: 'Pulse Laser', desc: 'Continuous piercing beam.', dmg: 5.5, pellets: 1, rate: 18, mag: 90, reserve: 360, reload: 2.4, spread: 0, speed: 500, range: 85, pierce: 99, splash: 0, color: 0xff3d5a, kind: 'laser', cost: 800, gems: 0 },
  railgun: { id: 'railgun', name: 'Void Railgun', desc: 'Premium: charged slug that pierces 6 targets.', dmg: 175, pellets: 1, rate: 0.85, mag: 4, reserve: 24, reload: 1.9, spread: 0, speed: 420, range: 240, pierce: 6, splash: 0, color: 0xc77dff, kind: 'bullet', cost: -1, gems: 600 },
  sunlance: { id: 'sunlance', name: 'Sunlance', desc: 'Premium: violet plasma lance with splash.', dmg: 58, pellets: 1, rate: 7, mag: 30, reserve: 180, reload: 1.8, spread: 0.012, speed: 130, range: 150, pierce: 2, splash: 2.0, color: 0xff4dd2, kind: 'plasma', cost: -1, gems: 450 },
};
export const WEAPON_ORDER: WeaponId[] = ['pistol', 'rifle', 'smg', 'shotgun', 'sniper', 'plasma', 'rocket', 'laser', 'railgun', 'sunlance'];

export type EnemyType = 'scout' | 'soldier' | 'brute' | 'drone' | 'hunter' | 'sniper' | 'commander';
export interface EnemyDef {
  name: string;
  hp: number;
  r: number; // half width
  h: number;
  score: number;
  from: number; // distance unlocked
  contact: number;
  weight: number;
}
export const ENEMIES: Record<EnemyType, EnemyDef> = {
  scout: { name: 'Alien Scout', hp: 34, r: 0.5, h: 1.7, score: 60, from: 0, contact: 14, weight: 10 },
  soldier: { name: 'Alien Soldier', hp: 70, r: 0.55, h: 1.9, score: 100, from: 150, contact: 12, weight: 8 },
  drone: { name: 'Alien Drone', hp: 30, r: 0.6, h: 0.9, score: 90, from: 350, contact: 12, weight: 6 },
  sniper: { name: 'Alien Sniper', hp: 55, r: 0.5, h: 1.9, score: 140, from: 550, contact: 0, weight: 4 },
  hunter: { name: 'Alien Hunter', hp: 100, r: 0.6, h: 1.6, score: 160, from: 650, contact: 20, weight: 5 },
  brute: { name: 'Alien Brute', hp: 340, r: 1.1, h: 3.4, score: 300, from: 900, contact: 38, weight: 3 },
  commander: { name: 'Alien Commander', hp: 800, r: 0.9, h: 3.0, score: 1200, from: 99999, contact: 0, weight: 0 },
};

/* ---------------------------- Unlockable content --------------------------- */
/** Maximum health is always exactly 100 for every character. */
export const MAX_HP = 100;
export const CHARACTERS = [
  { id: 'nyx', name: 'Nyx', desc: 'Premium: phantom operative. Agile with fast lane swaps.', cost: -1, gems: 900, hp: MAX_HP, shield: 10, lane: 1.25, jump: 1.08, suit: 0x111318, skin: 0xbfa98f, accent: 0x00e5ff },
  { id: 'champ', name: 'Champion', desc: 'Weekly champion character — earned by placing #1.', cost: -1, gems: -1, hp: MAX_HP, shield: 20, lane: 1.1, jump: 1.05, suit: 0x6b4c00, skin: 0xf3d9a4, accent: 0xffd700 },
  { id: 'champ2', name: 'Obsidian Champion', desc: 'Alternate weekly champion character.', cost: -1, gems: -1, hp: MAX_HP, shield: 20, lane: 1.1, jump: 1.05, suit: 0x14141c, skin: 0xd8d8e0, accent: 0xe040fb },
  { id: 'rook', name: 'Rook', desc: 'Balanced ex-soldier. Nothing but the standard kit.', cost: 0, hp: MAX_HP, shield: 0, lane: 1, jump: 1, suit: 0x3b5b8a, skin: 0xe0b090, accent: 0xffa000 },
  { id: 'vega', name: 'Vega', desc: 'Agile courier. Faster lane swaps and higher jumps.', cost: 400, hp: MAX_HP, shield: 0, lane: 1.35, jump: 1.1, suit: 0x8a3b6b, skin: 0xc68a64, accent: 0x00e5ff },
  { id: 'titan', name: 'Titan', desc: 'Heavy trooper. Starts every run with a 40 HP energy shield.', cost: 700, hp: MAX_HP, shield: 40, lane: 0.85, jump: 0.97, suit: 0x4a5a3a, skin: 0xf0c8a0, accent: 0xff3d00 },
];

/* ------------------------ Shop: functional equipment ----------------------- */
export interface SupplyDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  gems?: number;
}
/** Owned once, applied automatically at the start of every run. */
export const EQUIPMENT: SupplyDef[] = [
  { id: 'eq_reserve', name: "Veteran's Reserve", desc: 'Premium: start every run with +2 med-kits and +2 grenades.', cost: -1, gems: 250 },
  { id: 'eq_medkit', name: 'Med-Kit Stock', desc: 'Carry 3 auto-injectors: +15 HP whenever health drops below 30.', cost: 150 },
  { id: 'eq_armor', name: 'Armor Plates', desc: 'Start every run with +40 armor.', cost: 200 },
  { id: 'eq_shield', name: 'Energy Shield Cell', desc: 'Start every run with +35 shield.', cost: 180 },
  { id: 'eq_grenades', name: 'Grenade Belt', desc: 'Start every run with +3 grenades.', cost: 160 },
  { id: 'eq_traversal', name: 'Traversal Kit', desc: 'Start every run with a grappling hook and a zipline charge.', cost: 220 },
  { id: 'eq_boots', name: 'Jump Boots', desc: 'Start every run with 15s of high jump.', cost: 140 },
  { id: 'eq_gloves', name: 'Magnetic Gloves', desc: 'Start every run with 15s of magnetised item collection.', cost: 140 },
];
export const OUTFITS = [
  { id: 'default', name: 'Standard Issue', desc: 'Character default colors.', cost: 0, suit: -1, accent: -1 },
  { id: 'stealth', name: 'Stealth Ops', desc: 'Matte black with red trim.', cost: 200, suit: 0x1c1c26, accent: 0xff1744 },
  { id: 'desert', name: 'Desert Camo', desc: 'Sandy tactical gear.', cost: 250, suit: 0x9c8452, accent: 0x3e2723 },
  { id: 'neon', name: 'Neon Runner', desc: 'Glow-in-the-dark city style.', cost: 350, suit: 0xd81b9a, accent: 0x00ffd5 },
  { id: 'arctic', name: 'Arctic Frost', desc: 'White and blue winter kit.', cost: 300, suit: 0xdfe6ee, accent: 0x1e88e5 },
];
export const SKINS = [
  { id: 'skin_aurora', name: 'Aurora Protocol', desc: 'Premium legendary skin with violet tracers.', cost: -1, gems: 350, tint: 0x7c3aed, tracer: 0xc084fc },
  { id: 'skin_champ', name: 'Champion Gold', desc: 'Weekly champion skin — earned by placing #1.', cost: -1, gems: -1, tint: 0xd4af37, tracer: 0xffd700 },
  { id: 'skin_champ2', name: 'Obsidian Champion', desc: 'Alternate weekly champion skin.', cost: -1, gems: -1, tint: 0x1b1b24, tracer: 0xe040fb },
  { id: 'std', name: 'Gunmetal', desc: 'Standard finish.', cost: 0, tint: 0x4a505c, tracer: 0xffe08a },
  { id: 'skin_neon', name: 'Cyber Cyan', desc: 'Cyan glow + cyan tracers.', cost: 250, tint: 0x00bcd4, tracer: 0x40ffff },
  { id: 'gold', name: 'Gold Plated', desc: 'Luxury finish, golden tracers.', cost: 400, tint: 0xd4af37, tracer: 0xffd54f },
  { id: 'crimson', name: 'Crimson Fury', desc: 'Blood red with red tracers.', cost: 300, tint: 0xb71c1c, tracer: 0xff5252 },
];
export const DRONES = [
  { id: 'drone_warden', name: 'Warden Drone', desc: 'Premium companion: heavy, slow, relentless.', cost: -1, gems: 500, color: 0xe879f9, dmg: 22, rate: 2.4 },
  { id: 'sentry', name: 'Sentry Drone', desc: 'Balanced companion.', cost: 0, color: 0x40c4ff, dmg: 9, rate: 3 },
  { id: 'hunter', name: 'Hunter Drone', desc: 'Slow but hits hard.', cost: 450, color: 0xff5252, dmg: 18, rate: 2 },
  { id: 'guardian', name: 'Guardian Drone', desc: 'Also intercepts enemy bolts.', cost: 600, color: 0x69f0ae, dmg: 8, rate: 3.4 },
];
export const ENVS = [
  { id: 'night', name: 'Clear Night', desc: 'The classic invasion night.', cost: 0, tint: 0x000000, amt: 0, lightning: false },
  { id: 'blood', name: 'Blood Moon', desc: 'Crimson sky and fog.', cost: 350, tint: 0x4a0f18, amt: 0.55, lightning: false },
  { id: 'storm', name: 'Alien Storm', desc: 'Toxic green haze with lightning.', cost: 450, tint: 0x0d4a30, amt: 0.5, lightning: true },
  { id: 'env_neon', name: 'Neon Haze', desc: 'Violet cyber-fog.', cost: 400, tint: 0x3a1166, amt: 0.55, lightning: false },
];
export type AbilityId = 'dash' | 'bullet' | 'drone' | 'invuln' | 'blast';
export const ABILITIES: { id: AbilityId; name: string; desc: string; cost: number; energy: number }[] = [
  { id: 'dash', name: 'Energy Dash', desc: 'Burst forward, smash obstacles, cross gaps.', cost: 0, energy: 20 },
  { id: 'bullet', name: 'Bullet Time', desc: 'Slow the world for 4 seconds.', cost: 300, energy: 35 },
  { id: 'drone', name: 'Companion Drone', desc: 'A drone fights beside you for 25s.', cost: 350, energy: 30 },
  { id: 'invuln', name: 'Phase Shield', desc: 'Temporary invulnerability (5s).', cost: 500, energy: 60 },
  { id: 'blast', name: 'Explosive Pulse', desc: 'Shockwave destroys threats ahead.', cost: 450, energy: 50 },
];


/* ------------------------- spacecraft (aerial mode) ------------------------ */
export type AirWeaponId = 'laser' | 'rapid' | 'dual' | 'plasma' | 'charge';
export interface AirWeaponDef {
  id: AirWeaponId;
  name: string;
  desc: string;
  dmg: number;
  rate: number;
  energy: number;
  speed: number;
  color: number;
  splash: number;
  unlock: string | null;
}
export const AIR_WEAPONS: AirWeaponDef[] = [
  { id: 'laser', name: 'Laser Cannons', desc: 'Standard twin lasers.', dmg: 14, rate: 6, energy: 0.8, speed: 270, color: 0x4ff0ff, splash: 0, unlock: null },
  { id: 'rapid', name: 'Rapid-Fire Lasers', desc: 'Very high rate of fire, lighter hits.', dmg: 8, rate: 14, energy: 0.7, speed: 290, color: 0xffee58, splash: 0, unlock: 'fw_rapid' },
  { id: 'dual', name: 'Dual Laser Cannons', desc: 'Both cannons fire together for heavier hits.', dmg: 15, rate: 5, energy: 1.6, speed: 280, color: 0x7cff7c, splash: 0, unlock: 'fw_dual' },
  { id: 'plasma', name: 'Plasma Cannons', desc: 'Slow plasma bolts with splash damage.', dmg: 40, rate: 2.2, energy: 4.5, speed: 150, color: 0xff4dd2, splash: 7, unlock: 'fw_plasma' },
  { id: 'charge', name: 'Charged Energy Cannon', desc: 'Hold to charge, release for a piercing blast.', dmg: 190, rate: 1, energy: 16, speed: 330, color: 0xc084fc, splash: 0, unlock: 'fw_charge' },
];
export const SHIP_UPGRADES: SupplyDef[] = [
  { id: 'fw_rapid', name: 'Rapid-Fire Lasers', desc: 'Spacecraft: unlock the rapid-fire laser mode.', cost: 600 },
  { id: 'fw_dual', name: 'Dual Laser Cannons', desc: 'Spacecraft: both cannons fire together.', cost: 900 },
  { id: 'fw_plasma', name: 'Plasma Cannons', desc: 'Spacecraft: splash-damage plasma bolts.', cost: 1400 },
  { id: 'fw_charge', name: 'Charged Energy Cannon', desc: 'Spacecraft: hold-to-charge piercing blast.', cost: 1800 },
  { id: 'fw_missiles', name: 'Missile Rack', desc: 'Spacecraft: carry 8 homing missiles instead of 4.', cost: 700 },
  { id: 'fw_hull', name: 'Reinforced Hull', desc: 'Spacecraft: take 20% less damage.', cost: 1000 },
  { id: 'fw_phantom', name: 'Phantom Hull Paint', desc: 'Premium spacecraft paint — violet stealth finish.', cost: -1, gems: 300 },
];

export type UnlockKind = 'character' | 'outfit' | 'skin' | 'drone' | 'env' | 'weapon' | 'ability' | 'equipment' | 'ship';
export interface CatalogItem {
  id: string;
  kind: UnlockKind;
  name: string;
  desc: string;
  cost: number;
  gems: number;
}
export const CATALOG: CatalogItem[] = [
  ...CHARACTERS.map((c) => ({ id: c.id, kind: 'character' as const, name: c.name, desc: c.desc, cost: c.cost, gems: (c as { gems?: number }).gems ?? 0 })),
  ...OUTFITS.map((c) => ({ id: c.id, kind: 'outfit' as const, name: c.name, desc: c.desc, cost: c.cost, gems: 0 })),
  ...SKINS.map((c) => ({ id: c.id, kind: 'skin' as const, name: c.name, desc: c.desc, cost: c.cost, gems: (c as { gems?: number }).gems ?? 0 })),
  ...DRONES.map((c) => ({ id: c.id, kind: 'drone' as const, name: c.name, desc: c.desc, cost: c.cost, gems: (c as { gems?: number }).gems ?? 0 })),
  ...ENVS.map((c) => ({ id: c.id, kind: 'env' as const, name: c.name, desc: c.desc, cost: c.cost, gems: 0 })),
  ...WEAPON_ORDER.map((w) => ({ id: w, kind: 'weapon' as const, name: WEAPONS[w].name, desc: WEAPONS[w].desc, cost: WEAPONS[w].cost, gems: WEAPONS[w].gems })),
  ...ABILITIES.map((a) => ({ id: a.id, kind: 'ability' as const, name: a.name, desc: a.desc, cost: a.cost, gems: 0 })),
  ...EQUIPMENT.map((e) => ({ id: e.id, kind: 'equipment' as const, name: e.name, desc: e.desc, cost: e.cost, gems: e.gems ?? 0 })),
  ...SHIP_UPGRADES.map((e) => ({ id: e.id, kind: 'ship' as const, name: e.name, desc: e.desc, cost: e.cost, gems: e.gems ?? 0 })),
];

export type DistrictId = 'downtown' | 'residential' | 'industrial' | 'highway';
export const DISTRICT_ORDER: DistrictId[] = ['downtown', 'residential', 'industrial', 'highway'];
export const DISTRICT_LEN = 650;
export const DISTRICT_NAMES: Record<DistrictId, string> = {
  downtown: 'Downtown',
  residential: 'Residential Heights',
  industrial: 'Industrial District',
  highway: 'Skyway Highway',
};
export const districtAt = (dist: number): DistrictId =>
  DISTRICT_ORDER[((Math.floor(dist / DISTRICT_LEN) % 4) + 4) % 4];
