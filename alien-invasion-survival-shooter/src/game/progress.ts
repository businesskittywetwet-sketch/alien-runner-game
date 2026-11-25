import { CATALOG, CHARACTERS, WEAPON_ORDER, type WeaponId } from './config';

export interface Totals {
  runs: number;
  kills: number;
  ships: number;
  bosses: number;
  events: number;
  traversals: number;
  ropes: number;
  zips: number;
  grapples: number;
  ladders: number;
  vaults: number;
  pickups: number;
  weaponPickups: number;
  ammo: number;
  avoided: number;
  shots: number;
  hits: number;
  dist: number;
  time: number;
  bestDist: number;
  bestScore: number;
  bestTime: number;
  bestAccuracy: number;
  bestAvoided: number;
  bestWeapons: number;
  flights: number;
  airKills: number;
  mothers: number;
  motherDmg: number;
  airTime: number;
}

export const emptyTotals = (): Totals => ({
  runs: 0, kills: 0, ships: 0, bosses: 0, events: 0, traversals: 0, ropes: 0, zips: 0, grapples: 0, ladders: 0,
  vaults: 0, pickups: 0, weaponPickups: 0, ammo: 0, avoided: 0, shots: 0, hits: 0, dist: 0, time: 0,
  bestDist: 0, bestScore: 0, bestTime: 0, bestAccuracy: 0, bestAvoided: 0, bestWeapons: 0,
  flights: 0, airKills: 0, mothers: 0, motherDmg: 0, airTime: 0,
});

export interface RunStats {
  dist: number;
  time: number;
  score: number;
  kills: number;
  ships: number;
  bosses: number;
  events: number;
  traversals: number;
  ropes: number;
  zips: number;
  grapples: number;
  ladders: number;
  vaults: number;
  pickups: number;
  weaponPickups: number;
  weaponsSeen: number;
  ammo: number;
  avoided: number;
  shots: number;
  hits: number;
  flights: number;
  airKills: number;
  mothers: number;
  motherDmg: number;
  airTime: number;
}
export const emptyRun = (): RunStats => ({
  dist: 0, time: 0, score: 0, kills: 0, ships: 0, bosses: 0, events: 0, traversals: 0, ropes: 0, zips: 0,
  grapples: 0, ladders: 0, vaults: 0, pickups: 0, weaponPickups: 0, weaponsSeen: 0, ammo: 0, avoided: 0, shots: 0, hits: 0,
  flights: 0, airKills: 0, mothers: 0, motherDmg: 0, airTime: 0,
});

export const accuracyOf = (r: { shots: number; hits: number }) => (r.shots > 0 ? Math.min(1, r.hits / r.shots) : 0);

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  reward: number;
  check: (t: Totals) => boolean;
  progress?: (t: Totals) => [number, number];
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_blood', name: 'First Contact', desc: 'Eliminate your first alien.', reward: 25, check: (t) => t.kills >= 1, progress: (t) => [t.kills, 1] },
  { id: 'exterminator', name: 'Exterminator', desc: 'Eliminate 100 aliens in total.', reward: 150, check: (t) => t.kills >= 100, progress: (t) => [t.kills, 100] },
  { id: 'legion', name: 'Alien Bane', desc: 'Eliminate 500 aliens in total.', reward: 400, check: (t) => t.kills >= 500, progress: (t) => [t.kills, 500] },
  { id: 'run1k', name: 'Keep Moving', desc: 'Run 1,000 m in one run.', reward: 100, check: (t) => t.bestDist >= 1000, progress: (t) => [t.bestDist, 1000] },
  { id: 'run3k', name: 'Marathon', desc: 'Run 3,000 m in one run.', reward: 250, check: (t) => t.bestDist >= 3000, progress: (t) => [t.bestDist, 3000] },
  { id: 'run6k', name: 'Ultra Marathon', desc: 'Run 6,000 m in one run.', reward: 500, check: (t) => t.bestDist >= 6000, progress: (t) => [t.bestDist, 6000] },
  { id: 'skyhunter', name: 'Sky Hunter', desc: 'Destroy 5 alien ships.', reward: 200, check: (t) => t.ships >= 5, progress: (t) => [t.ships, 5] },
  { id: 'swinger', name: 'Tarzan', desc: 'Complete 5 rope or bar swings.', reward: 120, check: (t) => t.ropes >= 5, progress: (t) => [t.ropes, 5] },
  { id: 'zipper', name: 'Zip It', desc: 'Ride 3 ziplines.', reward: 120, check: (t) => t.zips >= 3, progress: (t) => [t.zips, 3] },
  { id: 'grappler', name: 'Hook, Line & Sinker', desc: 'Use the grappling hook 3 times.', reward: 120, check: (t) => t.grapples >= 3, progress: (t) => [t.grapples, 3] },
  { id: 'pilot', name: 'Wing Commander', desc: 'Board and fly a spacecraft 3 times.', reward: 150, check: (t) => t.flights >= 3, progress: (t) => [t.flights, 3] },
  { id: 'slayer', name: 'Mothership Slayer', desc: 'Destroy an alien mothership.', reward: 500, check: (t) => t.mothers >= 1, progress: (t) => [t.mothers, 1] },
  { id: 'ace', name: 'Sky Ace', desc: 'Shoot down 40 enemy spacecraft.', reward: 250, check: (t) => t.airKills >= 40, progress: (t) => [t.airKills, 40] },
  { id: 'parkour', name: 'Parkour Master', desc: 'Complete 40 traversal actions.', reward: 300, check: (t) => t.traversals >= 40, progress: (t) => [t.traversals, 40] },
  { id: 'boss', name: 'Commander Down', desc: 'Defeat an Alien Commander.', reward: 400, check: (t) => t.bosses >= 1, progress: (t) => [t.bosses, 1] },
  { id: 'event', name: 'Invasion Repelled', desc: 'Survive an invasion event.', reward: 250, check: (t) => t.events >= 1, progress: (t) => [t.events, 1] },
  { id: 'survivor', name: 'Survivor', desc: 'Survive 3 minutes in a run.', reward: 200, check: (t) => t.bestTime >= 180, progress: (t) => [t.bestTime, 180] },
  { id: 'sharp', name: 'Sharpshooter', desc: '60% accuracy with 40+ shots in a run.', reward: 250, check: (t) => t.bestAccuracy >= 0.6, progress: (t) => [Math.round(t.bestAccuracy * 100), 60] },
  { id: 'arsenal', name: 'Arsenal', desc: 'Hold 5 different weapons in one run.', reward: 200, check: (t) => t.bestWeapons >= 5, progress: (t) => [t.bestWeapons, 5] },
  { id: 'untouchable', name: 'Untouchable', desc: 'Dodge 40 obstacles in one run.', reward: 200, check: (t) => t.bestAvoided >= 40, progress: (t) => [t.bestAvoided, 40] },
  { id: 'score50k', name: 'High Roller', desc: 'Score 50,000 points in one run.', reward: 300, check: (t) => t.bestScore >= 50000, progress: (t) => [t.bestScore, 50000] },
];

type DailyKey = 'kills' | 'dist' | 'ships' | 'traversals' | 'pickups' | 'avoided';
interface DailyTpl {
  k: DailyKey;
  text: (n: number) => string;
  goals: number[];
}
const DAILY_TPL: DailyTpl[] = [
  { k: 'kills', text: (n) => `Eliminate ${n} aliens`, goals: [20, 35, 50] },
  { k: 'dist', text: (n) => `Run ${n} meters in total`, goals: [2000, 3500, 5000] },
  { k: 'ships', text: (n) => `Destroy ${n} alien ships`, goals: [2, 3, 5] },
  { k: 'traversals', text: (n) => `Complete ${n} traversal actions`, goals: [6, 10, 15] },
  { k: 'pickups', text: (n) => `Collect ${n} pickups`, goals: [15, 25, 35] },
  { k: 'avoided', text: (n) => `Dodge ${n} obstacles`, goals: [25, 40, 60] },
];

export interface DailyChallenge {
  id: string;
  k: DailyKey;
  goal: number;
  text: string;
  reward: number;
}

export function dailyChallenges(date: string): DailyChallenge[] {
  let seed = 0;
  for (let i = 0; i < date.length; i++) seed = (seed * 31 + date.charCodeAt(i)) >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pool = [...DAILY_TPL];
  const out: DailyChallenge[] = [];
  for (let i = 0; i < 3; i++) {
    const tpl = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    const goal = tpl.goals[i];
    out.push({ id: `${date}-${tpl.k}`, k: tpl.k, goal, text: tpl.text(goal), reward: 100 + i * 75 });
  }
  return out;
}

/* ------------------------------- Battle Pass ------------------------------- */
export interface BpTier {
  tier: number;
  xp: number;
  bucks: number;
  item?: { id: string; label: string };
}
export const BP_XP_PER_TIER = 200;
export const TRAIN_LESSONS = 12;
const BP_ITEMS: Record<number, { id: string; label: string }> = {
  5: { id: 'desert', label: 'Desert Camo outfit' },
  10: { id: 'skin_neon', label: 'Cyber Cyan weapon skin' },
  15: { id: 'hunter', label: 'Hunter Drone' },
  20: { id: 'vega', label: 'Vega — character' },
};
export const BP_TIERS: BpTier[] = Array.from({ length: 20 }, (_, i) => {
  const t = i + 1;
  return { tier: t, xp: t * BP_XP_PER_TIER, bucks: 20 + t * 10 + (t === 20 ? 200 : 0), item: BP_ITEMS[t] };
});

/* --------------------- monetization configuration (admin) --------------------- */
export interface PackCfg {
  id: string;
  kind: 'bucks' | 'gems';
  label: string;
  price: number; // USD
  amount: number;
  bonus: number;
  enabled: boolean;
}
export interface EconConfig {
  packs: PackCfg[];
  noAdsPrice: number;
  adminPass: string;
  testAds: boolean; // provider test advertisements during development
  simulateFailures: boolean; // force a declined transaction (testing)
  placements: { banner: boolean; interstitial: boolean; rewarded: boolean };
  caps: { interstitialGapMs: number; interstitialMaxPer10Min: number; rewardedPerDay: number };
  ecpm: { banner: number; interstitial: number; rewarded: number }; // USD per 1000 impressions
  storeFeePct: number; // Apple / Google cut
}
export interface RewardBand {
  min: number;
  max: number;
  bucks: number;
  gems: number;
}
export interface LeaderCfg {
  weights: { dist: number; kill: number; boss: number; ship: number; challenge: number; survival: number };
  rewards: RewardBand[];
  participation: number; // outside the top 250
  top: number; // leaderboard size
}

export interface Save {
  credits: number;
  gems: number;
  username: string;
  noAds: boolean;
  owned: string[];
  eq: { character: string; outfit: string; skin: string; drone: string; env: string; weapon: string };
  totals: Totals;
  achievements: string[];
  daily: { date: string; prog: Record<string, number>; claimed: string[] };
  settings: { sfx: boolean; music: boolean; auto: boolean; laneButtons: boolean; tutorialSeen: boolean };
  bp: { claimed: number[] };
  bonus: { last: string; streak: number };
  purchases: { id: string; product: string; label: string; price: number; ts: number; amount: number; kind: string }[];
  spent: { bucks: number; gems: number };
  receipts: string[];
  ads: { banner: number; interstitial: number; rewarded: number; revenue: number; lastInterstitial: number; rewardedDay: string; rewardedCount: number };
  rev: { gross: number; refunds: number; byProduct: Record<string, { count: number; gross: number }> };
  week: { id: number; dist: number; kills: number; bosses: number; ships: number; challenges: number; time: number; runs: number; score: number; flagged: boolean; claimed: boolean; rank: number };
  weekHistory: { week: number; rank: number; score: number; bucks: number; gems: number; at: number }[];
  champions: { week: number; name: string; score: number }[];
  audit: { ts: number; runId: string; verdict: string; score: number; detail: string }[];
  runIds: string[];
  econ: EconConfig;
  lboard: LeaderCfg;
  training: { done: boolean; lessons: number[]; bonus: boolean };
}

const KEY = 'alien-invasion-runner-v1';
const todayStr = () => new Date().toISOString().slice(0, 10);

export function defaultEcon(): EconConfig {
  return {
    packs: [
      { id: 'bucks_099', kind: 'bucks', label: 'Starter Pack', price: 0.99, amount: 1000, bonus: 0, enabled: true },
      { id: 'bucks_499', kind: 'bucks', label: 'Small Pack', price: 4.99, amount: 5200, bonus: 200, enabled: true },
      { id: 'bucks_999', kind: 'bucks', label: 'Medium Pack', price: 9.99, amount: 11000, bonus: 700, enabled: true },
      { id: 'bucks_2499', kind: 'bucks', label: 'Large Pack', price: 24.99, amount: 30000, bonus: 4000, enabled: true },
      { id: 'bucks_5699', kind: 'bucks', label: 'Premium Pack', price: 56.99, amount: 75000, bonus: 15000, enabled: true },
      { id: 'bucks_9999', kind: 'bucks', label: 'Ultimate Pack', price: 99.99, amount: 140000, bonus: 40000, enabled: true },
      { id: 'gems_099', kind: 'gems', label: 'Starter Pack', price: 0.99, amount: 80, bonus: 0, enabled: true },
      { id: 'gems_499', kind: 'gems', label: 'Small Pack', price: 4.99, amount: 450, bonus: 30, enabled: true },
      { id: 'gems_999', kind: 'gems', label: 'Medium Pack', price: 9.99, amount: 1000, bonus: 120, enabled: true },
      { id: 'gems_2499', kind: 'gems', label: 'Large Pack', price: 24.99, amount: 2700, bonus: 500, enabled: true },
      { id: 'gems_5699', kind: 'gems', label: 'Premium Pack', price: 56.99, amount: 6800, bonus: 1600, enabled: true },
      { id: 'gems_9999', kind: 'gems', label: 'Ultimate Pack', price: 99.99, amount: 12500, bonus: 3500, enabled: true },
    ],
    noAdsPrice: 2.99,
    adminPass: 'NIGHTFALL',
    testAds: true,
    simulateFailures: false,
    placements: { banner: true, interstitial: true, rewarded: true },
    caps: { interstitialGapMs: 75000, interstitialMaxPer10Min: 3, rewardedPerDay: 6 },
    ecpm: { banner: 1.2, interstitial: 8, rewarded: 25 },
    storeFeePct: 30,
  };
}

export function defaultLeader(): LeaderCfg {
  return {
    weights: { dist: 1, kill: 25, boss: 800, ship: 120, challenge: 150, survival: 2 },
    rewards: [
      { min: 1, max: 1, bucks: 50000, gems: 500 },
      { min: 2, max: 2, bucks: 35000, gems: 300 },
      { min: 3, max: 3, bucks: 25000, gems: 200 },
      { min: 4, max: 4, bucks: 20000, gems: 150 },
      { min: 5, max: 5, bucks: 15000, gems: 100 },
      { min: 6, max: 10, bucks: 10000, gems: 0 },
      { min: 11, max: 25, bucks: 7500, gems: 0 },
      { min: 26, max: 50, bucks: 5000, gems: 0 },
      { min: 51, max: 100, bucks: 3000, gems: 0 },
      { min: 101, max: 250, bucks: 1500, gems: 0 },
    ],
    participation: 500,
    top: 250,
  };
}

function defaults(): Save {
  const free = CATALOG.filter((c) => c.cost === 0).map((c) => c.id);
  return {
    credits: 150,
    gems: 0,
    username: `Pilot${1000 + Math.floor(Math.random() * 9000)}`,
    noAds: false,
    owned: free,
    eq: { character: 'rook', outfit: 'default', skin: 'std', drone: 'sentry', env: 'night', weapon: 'pistol' },
    totals: emptyTotals(),
    achievements: [],
    daily: { date: todayStr(), prog: {}, claimed: [] },
    settings: { sfx: true, music: true, auto: false, laneButtons: false, tutorialSeen: false },
    bp: { claimed: [] },
    bonus: { last: '', streak: 0 },
    purchases: [],
    spent: { bucks: 0, gems: 0 },
    receipts: [],
    ads: { banner: 0, interstitial: 0, rewarded: 0, revenue: 0, lastInterstitial: 0, rewardedDay: '', rewardedCount: 0 },
    rev: { gross: 0, refunds: 0, byProduct: {} },
    week: { id: 0, dist: 0, kills: 0, bosses: 0, ships: 0, challenges: 0, time: 0, runs: 0, score: 0, flagged: false, claimed: false, rank: 0 },
    weekHistory: [],
    champions: [],
    audit: [],
    runIds: [],
    econ: defaultEcon(),
    lboard: defaultLeader(),
    training: { done: false, lessons: [], bonus: false },
  };
}

class ProgressStore {
  save: Save;
  constructor() {
    this.save = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const d = defaults();
        this.save = { ...d, ...s, eq: { ...d.eq, ...s.eq }, totals: { ...d.totals, ...s.totals }, settings: { ...d.settings, ...s.settings } };
        for (const id of d.owned) if (!this.save.owned.includes(id)) this.save.owned.push(id);
        // migrate ids that used to collide across categories
        if (this.save.eq.skin === 'neon') this.save.eq.skin = 'std';
        if (this.save.eq.env === 'neon') this.save.eq.env = 'night';
        if (!this.save.bp || !Array.isArray(this.save.bp.claimed)) this.save.bp = { claimed: [] };
        if (!this.save.bonus) this.save.bonus = { last: '', streak: 0 };
        const d2 = defaults();
        if (!Array.isArray(this.save.purchases)) this.save.purchases = d2.purchases;
        if (!Array.isArray(this.save.receipts)) this.save.receipts = d2.receipts;
        if (!this.save.spent) this.save.spent = d2.spent;
        if (!Array.isArray(this.save.weekHistory)) this.save.weekHistory = d2.weekHistory;
        if (!Array.isArray(this.save.champions)) this.save.champions = d2.champions;
        if (!Array.isArray(this.save.audit)) this.save.audit = d2.audit;
        if (!Array.isArray(this.save.runIds)) this.save.runIds = d2.runIds;
        if (!this.save.ads) this.save.ads = d2.ads;
        if (!this.save.rev) this.save.rev = d2.rev;
        if (!this.save.week) this.save.week = d2.week;
        if (!this.save.econ) this.save.econ = d2.econ;
        else for (const k of Object.keys(d2.econ) as (keyof EconConfig)[])
          if (this.save.econ[k] === undefined) this.save.econ[k] = d2.econ[k] as never;
        if (!this.save.lboard) this.save.lboard = d2.lboard;
        else for (const k of Object.keys(d2.lboard) as (keyof LeaderCfg)[])
          if (this.save.lboard[k] === undefined) this.save.lboard[k] = d2.lboard[k] as never;
        if (typeof this.save.gems !== 'number') this.save.gems = 0;
        if (!this.save.training) {
          // accounts that already played before the training system existed are grandfathered in
          const veteran = (this.save.totals.runs ?? 0) > 0;
          this.save.training = { done: veteran, lessons: veteran ? Array.from({ length: TRAIN_LESSONS }, (_, i) => i) : [], bonus: veteran };
        }
        if (!this.save.username) this.save.username = d2.username;
        if (typeof this.save.noAds !== 'boolean') this.save.noAds = false;
      }
    } catch {
      /* ignore */
    }
    this.rollDaily();
  }
  persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.save));
    } catch {
      /* ignore */
    }
  }
  rollDaily() {
    if (this.save.daily.date !== todayStr()) this.save.daily = { date: todayStr(), prog: {}, claimed: [] };
  }
  challenges() {
    return dailyChallenges(this.save.daily.date);
  }
  owns(id: string) {
    return this.save.owned.includes(id);
  }
  /** Alien Bucks: added immediately during a run, flushed to storage periodically. */
  addBucks(n: number) {
    if (n === 0) return;
    this.save.credits = Math.max(0, this.save.credits + n);
  }
  bucks() {
    return this.save.credits;
  }
  gems() {
    return this.save.gems;
  }
  addGems(n: number) {
    if (n === 0) return;
    this.save.gems = Math.max(0, this.save.gems + n);
  }
  /** guarded spend — never allows a negative balance */
  spendBucks(n: number): boolean {
    if (n < 0 || this.save.credits < n) return false;
    this.save.credits -= n;
    this.save.spent.bucks += n;
    return true;
  }
  spendGems(n: number): boolean {
    if (n < 0 || this.save.gems < n) return false;
    this.save.gems -= n;
    this.save.spent.gems += n;
    return true;
  }
  recordPurchase(rec: Save['purchases'][number], receipt: string) {
    if (this.save.receipts.includes(receipt)) return false; // duplicate transaction guard
    this.save.receipts.push(receipt);
    if (this.save.receipts.length > 60) this.save.receipts.splice(0, this.save.receipts.length - 60);
    this.save.purchases.unshift(rec);
    if (this.save.purchases.length > 80) this.save.purchases.pop();
    this.persist();
    return true;
  }
  buy(id: string): boolean {
    const item = CATALOG.find((c) => c.id === id);
    if (!item || item.cost < 0 || this.owns(id) || this.save.credits < item.cost) return false; // gems-only items can never be bought with Bucks
    this.save.credits -= item.cost;
    this.save.owned.push(id);
    this.persist();
    return true;
  }
  equip(kind: keyof Save['eq'], id: string) {
    if (!this.owns(id)) return;
    this.save.eq[kind] = id;
    this.persist();
  }
  trainingDone() {
    return this.save.training.done;
  }
  lessonDone(i: number) {
    return this.save.training.lessons.includes(i);
  }
  nextLesson(): number {
    for (let i = 0; i < TRAIN_LESSONS; i++) if (!this.lessonDone(i)) return i;
    return 0;
  }
  /** returns true when this completion finishes the whole tutorial for the first time */
  completeLesson(i: number): boolean {
    const t = this.save.training;
    if (!t.lessons.includes(i)) t.lessons.push(i);
    let first = false;
    if (!t.done && t.lessons.length >= TRAIN_LESSONS) {
      t.done = true;
      first = true;
      if (!t.bonus) {
        t.bonus = true;
        this.addBucks(300); // one-time graduation bonus
      }
    }
    this.persist();
    return first;
  }
  /** lifetime Battle Pass XP, derived from real progress */
  bpXp(): number {
    const t = this.save.totals;
    return t.kills * 4 + t.ships * 30 + t.traversals * 8 + Math.floor(t.dist / 10) + t.bosses * 150 + t.events * 100;
  }
  bpUnlocked(tier: BpTier) {
    return this.bpXp() >= tier.xp;
  }
  claimBp(tier: BpTier): boolean {
    if (!this.bpUnlocked(tier) || this.save.bp.claimed.includes(tier.tier)) return false;
    this.save.bp.claimed.push(tier.tier);
    this.addBucks(tier.bucks);
    if (tier.item && !this.owns(tier.item.id)) this.save.owned.push(tier.item.id);
    this.persist();
    return true;
  }
  canClaimDaily() {
    return this.save.bonus.last !== todayStr();
  }
  dailyReward() {
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const streak = this.save.bonus.last === y ? this.save.bonus.streak + 1 : 1;
    return { streak, reward: 40 + Math.min(streak, 7) * 10 };
  }
  claimDaily(): number {
    if (!this.canClaimDaily()) return 0;
    const { streak, reward } = this.dailyReward();
    this.save.bonus = { last: todayStr(), streak };
    this.addBucks(reward);
    this.persist();
    return reward;
  }
  unlockedWeapons(): WeaponId[] {
    return WEAPON_ORDER.filter((w) => this.owns(w));
  }
  character() {
    return CHARACTERS.find((c) => c.id === this.save.eq.character) ?? CHARACTERS[0];
  }
  /** merge a (possibly partial) run into totals copy */
  merged(run: RunStats): Totals {
    const t = { ...this.save.totals };
    t.kills += run.kills; t.ships += run.ships; t.bosses += run.bosses; t.events += run.events;
    t.traversals += run.traversals; t.ropes += run.ropes; t.zips += run.zips; t.grapples += run.grapples;
    t.ladders += run.ladders; t.vaults += run.vaults; t.pickups += run.pickups; t.weaponPickups += run.weaponPickups;
    t.ammo += run.ammo; t.avoided += run.avoided; t.shots += run.shots; t.hits += run.hits;
    t.dist += run.dist; t.time += run.time;
    t.flights += run.flights; t.airKills += run.airKills; t.mothers += run.mothers; t.motherDmg += run.motherDmg; t.airTime += run.airTime;
    t.bestDist = Math.max(t.bestDist, run.dist);
    t.bestScore = Math.max(t.bestScore, run.score);
    t.bestTime = Math.max(t.bestTime, run.time);
    t.bestAvoided = Math.max(t.bestAvoided, run.avoided);
    t.bestWeapons = Math.max(t.bestWeapons, run.weaponsSeen);
    if (run.shots >= 40) t.bestAccuracy = Math.max(t.bestAccuracy, accuracyOf(run));
    return t;
  }
  /** check for new achievements given an in-progress run. Returns the newly unlocked. */
  checkAchievements(run: RunStats): Achievement[] {
    const t = this.merged(run);
    const out: Achievement[] = [];
    for (const a of ACHIEVEMENTS) {
      if (!this.save.achievements.includes(a.id) && a.check(t)) {
        this.save.achievements.push(a.id);
        this.save.credits += a.reward;
        out.push(a);
      }
    }
    if (out.length) this.persist();
    return out;
  }
  /** end of run: commit totals, daily progress and credits */
  commitRun(run: RunStats, credits: number): { dailyDone: DailyChallenge[] } {
    this.save.totals = this.merged(run);
    this.save.totals.runs += 1;
    this.save.credits += credits;
    this.rollDaily();
    const dailyDone: DailyChallenge[] = [];
    const map: Record<DailyKey, number> = {
      kills: run.kills, dist: run.dist, ships: run.ships, traversals: run.traversals, pickups: run.pickups, avoided: run.avoided,
    };
    for (const c of this.challenges()) {
      const was = this.save.daily.prog[c.k] ?? 0;
      this.save.daily.prog[c.k] = was + map[c.k];
      if (!this.save.daily.claimed.includes(c.id) && this.save.daily.prog[c.k] >= c.goal) {
        this.save.daily.claimed.push(c.id);
        this.save.credits += c.reward;
        dailyDone.push(c);
      }
    }
    this.persist();
    return { dailyDone };
  }
}

export const store = new ProgressStore();
