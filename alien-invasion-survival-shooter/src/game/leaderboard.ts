import { mulberry32 } from './util';
import { store, type RunStats } from './progress';

/**
 * Weekly global competition.
 *
 * Scoring only ever reads verified run statistics (distance, kills, bosses,
 * ships, challenges, survival) — currency purchases, gems and shop activity can
 * never contribute. Submissions are validated, de-duplicated and audited here;
 * a production build posts each run to a server that re-derives the score from
 * telemetry before it is accepted (see `submitRun`).
 */

const WEEK_MS = 7 * 86400000;

export function mondayOf(now = Date.now()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const shift = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - shift);
  return d;
}
export function weekStart(now = Date.now()): Date {
  return mondayOf(now);
}
export function weekEnd(now = Date.now()): Date {
  return new Date(mondayOf(now).getTime() + WEEK_MS);
}
export function weekIndex(now = Date.now()): number {
  return Math.floor(mondayOf(now).getTime() / WEEK_MS);
}
/** Reset moment rendered in the player's local time zone. */
export function resetLocal(now = Date.now()): string {
  return weekEnd(now).toLocaleString(undefined, { weekday: 'long', hour: '2-digit', minute: '2-digit' });
}
export function countdown(now = Date.now()): { d: number; h: number; m: number; s: number; ms: number } {
  const ms = Math.max(0, weekEnd(now).getTime() - now);
  return { d: Math.floor(ms / 86400000), h: Math.floor(ms / 3600000) % 24, m: Math.floor(ms / 60000) % 60, s: Math.floor(ms / 1000) % 60, ms };
}
export function countdownText(now = Date.now()): string {
  const c = countdown(now);
  return `${c.d}d ${String(c.h).padStart(2, '0')}h ${String(c.m).padStart(2, '0')}m ${String(c.s).padStart(2, '0')}s`;
}

/* ------------------------------- competitors ------------------------------ */
export interface Rival {
  name: string;
  char: string;
  score: number;
  dist: number;
  kills: number;
}
const HANDLES = [
  'Vortex', 'Nyx', 'Kestrel', 'Rampart', 'Hex', 'Onyx', 'Valkyrie', 'Rogue', 'Cipher', 'Bishop',
  'Nova', 'Talon', 'Wraith', 'Zephyr', 'Karma', 'Sable', 'Havoc', 'Piston', 'Mirage', 'Acheron',
  'Drift', 'Ember', 'Feral', 'Grimm', 'Hollow', 'Ion', 'Jinx', 'Kilo', 'Lynx', 'Mantis',
  'Nomad', 'Orbit', 'Prowl', 'Quartz', 'Rift', 'Static', 'Tundra', 'Umbra', 'Vector', 'Wolfe',
  'Xenon', 'Yonder', 'Zenith', 'Arc', 'Bolt', 'Cinder', 'Dusk', 'Flint', 'Gale', 'Haste',
  'Iris', 'Jolt', 'Krait', 'Lux', 'Mesa', 'Nitro', 'Omen', 'Pulse', 'Quill', 'Raze',
];
const CHARS = ['rook', 'vega', 'titan', 'nyx'];

const rivalCache = new Map<number, Rival[]>();
export function rivals(week: number): Rival[] {
  const hit = rivalCache.get(week);
  if (hit) return hit;
  const rnd = mulberry32((week * 7919 + 13) >>> 0);
  const top = 780000 + Math.floor(rnd() * 420000);
  const out: Rival[] = [];
  for (let i = 0; i < 250; i++) {
    const score = Math.max(1500, Math.round(top * Math.pow(0.9775, i) * (0.9 + rnd() * 0.2)));
    const dist = Math.round(score * (0.0032 + rnd() * 0.001));
    const kills = Math.round(dist / (26 + rnd() * 14));
    const handle = HANDLES[Math.floor(rnd() * HANDLES.length)];
    const suffix = Math.floor(rnd() * 900 + 100);
    out.push({
      name: `${handle}${suffix}`,
      char: CHARS[Math.floor(rnd() * CHARS.length)],
      score,
      dist: Math.max(600, dist),
      kills: Math.max(4, kills),
    });
  }
  sortRivals(out);
  rivalCache.set(week, out);
  return out;
}
/** Deterministic ordering: score → distance → kills → name (stable tie-break). */
function sortRivals(list: Rival[]) {
  list.sort((a, b) => b.score - a.score || b.dist - a.dist || b.kills - a.kills || a.name.localeCompare(b.name));
}

/* -------------------------------- scoring -------------------------------- */
export function scoreOf(s: {
  dist: number; kills: number; bosses: number; ships: number; time: number; challenges?: number;
}): number {
  const w = store.save.lboard.weights;
  return Math.round(
    s.dist * w.dist +
      s.kills * w.kill +
      s.bosses * w.boss +
      s.ships * w.ship +
      (s.challenges ?? 0) * w.challenge +
      s.time * w.survival,
  );
}
export function weeklyScore(): number {
  return scoreOf(store.save.week);
}

/* ------------------------------ score intake ------------------------------ */
export interface SubmitResult {
  verdict: 'accepted' | 'duplicate' | 'flagged';
  detail: string;
  score: number;
}
/** Runs a weekly score submission through validation before it is counted. */
export function submitRun(run: RunStats, runId: string): SubmitResult {
  const s = store.save;
  if (s.runIds.includes(runId)) return { verdict: 'duplicate', detail: 'Submission already recorded.', score: 0 };
  s.runIds.push(runId);
  if (s.runIds.length > 40) s.runIds.splice(0, s.runIds.length - 40);

  const t = Math.max(1, run.time);
  const problems: string[] = [];
  if (run.dist > 35 * t * 1.15 + 200) problems.push('impossible distance for elapsed time');
  if (run.kills > run.dist / 6 + t * 1.4 + 60) problems.push('impossible kill rate');
  if (run.ships > t * 0.15 + 8) problems.push('impossible ship count');
  if (run.bosses > 8) problems.push('impossible boss count');
  if (run.time > 7200) problems.push('impossible survival time');

  const score = scoreOf(run);
  if (problems.length) {
    const flags = s.audit.filter((a) => a.verdict === 'flagged').length;
    s.audit.unshift({ ts: Date.now(), runId, verdict: 'flagged', score, detail: problems.join('; ') });
    if (flags + 1 >= 3) s.week.flagged = true; // repeated violations → account review
    if (s.audit.length > 60) s.audit.pop();
    store.persist();
    return { verdict: 'flagged', detail: `Rejected: ${problems.join('; ')}.`, score };
  }

  s.week.dist += run.dist;
  s.week.kills += run.kills;
  s.week.bosses += run.bosses;
  s.week.ships += run.ships;
  s.week.time += run.time;
  s.week.runs += 1;
  s.week.score = scoreOf(s.week);
  s.audit.unshift({ ts: Date.now(), runId, verdict: 'accepted', score, detail: `${Math.round(run.dist)} m, ${run.kills} kills` });
  if (s.audit.length > 60) s.audit.pop();
  store.persist();
  return { verdict: 'accepted', detail: 'Score verified.', score };
}
export function addChallenges(n: number) {
  if (n <= 0) return;
  store.save.week.challenges += n;
  store.save.week.score = scoreOf(store.save.week);
  store.persist();
}

/* -------------------------------- standings ------------------------------- */
export interface Row {
  rank: number;
  name: string;
  char: string;
  score: number;
  dist: number;
  kills: number;
  bucks: number;
  gems: number;
  you: boolean;
}
export interface Standings {
  rows: Row[]; // top 250
  qualifies: boolean;
  myRank: number | null;
  myScore: number;
  myDist: number;
  myKills: number;
  gapToNext: number;
  tierLabel: string;
  reward: { bucks: number; gems: number };
  total: number;
}

export function rewardFor(rank: number): { bucks: number; gems: number } {
  const cfg = store.save.lboard;
  const band = cfg.rewards.find((b) => rank >= b.min && rank <= b.max);
  return band ? { bucks: band.bucks, gems: band.gems } : { bucks: 0, gems: 0 };
}
export function tierLabel(rank: number | null): string {
  if (rank === null) return 'Not ranked';
  if (rank === 1) return 'Grand Champion';
  if (rank <= 5) return 'Top 5 reward';
  if (rank <= 10) return '6th–10th reward';
  if (rank <= 25) return '11th–25th reward';
  if (rank <= 50) return '26th–50th reward';
  if (rank <= 100) return '51st–100th reward';
  if (rank <= 250) return '101st–250th reward';
  return 'Participation reward';
}

export function qualifies(): boolean {
  const w = store.save.week;
  return w.runs >= 1 && w.score > 0 && !w.flagged;
}

export function standings(): Standings {
  const s = store.save;
  const week = weekIndex();
  const list: (Rival & { you?: boolean })[] = rivals(week).slice();
  const ok = qualifies();
  const myScore = s.week.score;
  if (ok) {
    list.push({ name: s.username, char: s.eq.character, score: myScore, dist: Math.round(s.week.dist), kills: s.week.kills, you: true });
    sortRivals(list);
  }
  const myRank = ok ? list.findIndex((r) => r.you) + 1 : null;
  const rows: Row[] = list.slice(0, 250).map((r, i) => {
    const rw = rewardFor(i + 1);
    return { rank: i + 1, name: r.name, char: r.char, score: r.score, dist: r.dist, kills: r.kills, bucks: rw.bucks, gems: rw.gems, you: !!r.you };
  });
  let gap = 0;
  let reward = { bucks: 0, gems: 0 };
  if (myRank !== null) {
    const idx = myRank - 1;
    reward = idx < 250 ? rewardFor(myRank) : { bucks: store.save.lboard.participation, gems: 0 };
    if (idx > 0) gap = list[idx - 1].score - myScore;
  }
  return {
    rows,
    qualifies: ok,
    myRank,
    myScore,
    myDist: Math.round(s.week.dist),
    myKills: s.week.kills,
    gapToNext: Math.max(0, gap),
    tierLabel: tierLabel(myRank),
    reward,
    total: list.length,
  };
}

/* --------------------------- champion content ---------------------------- */
export interface ChampionSet {
  charId: string;
  skinId: string;
  name: string;
}
/** Different weeks award different permanent champion cosmetics. */
export function championSetFor(week: number): ChampionSet {
  return week % 2 === 0
    ? { charId: 'champ', skinId: 'skin_champ', name: 'Champion (Gold)' }
    : { charId: 'champ2', skinId: 'skin_champ2', name: 'Obsidian Champion' };
}
/** Historical champions archive: your own wins plus the simulated global winners. */
export function championArchive(): { week: number; name: string; score: number; you: boolean }[] {
  const now = weekIndex();
  const mine = new Map(store.save.champions.map((c) => [c.week, c]));
  const out: { week: number; name: string; score: number; you: boolean }[] = [];
  for (let w = now - 1; w > now - 12 && w > 0; w--) {
    const m = mine.get(w);
    if (m) out.push({ week: w, name: m.name, score: m.score, you: true });
    else {
      const r = rivals(w)[0];
      out.push({ week: w, name: r.name, score: r.score, you: false });
    }
  }
  return out;
}

/* ------------------------------- settlement ------------------------------- */
export interface Announcement {
  week: number;
  rank: number;
  score: number;
  bucks: number;
  gems: number;
  champion?: ChampionSet;
}
export interface SettleResult {
  settled: boolean;
  announcement?: Announcement;
}

/**
 * Runs at start-up and whenever the page becomes visible again: if the current
 * competition has ended (including while the player was offline) it finalises
 * the standings, pays the rewards exactly once and opens the next week.
 */
export function settle(now = Date.now()): SettleResult {
  const s = store.save;
  const current = weekIndex(now);
  if (s.week.id === 0) {
    s.week.id = current;
    store.persist();
    return { settled: false };
  }
  if (s.week.id >= current) return { settled: false }; // still competing

  // ---- competition closed: verify, rank, pay, archive ----
  const ok = qualifies();
  const myScore = s.week.score;
  let rank = 0;
  if (ok) {
    const list = rivals(s.week.id).slice();
    list.push({ name: s.username, char: s.eq.character, score: myScore, dist: Math.round(s.week.dist), kills: s.week.kills });
    sortRivals(list);
    rank = list.findIndex((r) => r.name === s.username && r.score === myScore) + 1;
    if (rank <= 0) rank = list.length + 1;
  }
  let bucks = 0;
  let gems = 0;
  let champion: ChampionSet | undefined;
  if (ok && rank >= 1 && rank <= 250) {
    const rw = rewardFor(rank);
    bucks = rw.bucks;
    gems = rw.gems;
    if (rank === 1) {
      champion = championSetFor(s.week.id);
      if (!s.owned.includes(champion.charId)) s.owned.push(champion.charId);
      if (!s.owned.includes(champion.skinId)) s.owned.push(champion.skinId);
      s.champions.push({ week: s.week.id, name: s.username, score: myScore });
      s.weekHistory.unshift({ week: s.week.id, rank, score: myScore, bucks, gems, at: now });
      store.addBucks(bucks);
      store.addGems(gems);
      store.persist();
      const fresh = { ...s.week, id: current, dist: 0, kills: 0, bosses: 0, ships: 0, challenges: 0, time: 0, runs: 0, score: 0, flagged: false, claimed: false, rank: 0 };
      s.week = fresh;
      store.persist();
      return { settled: true, announcement: { week: s.weekHistory[0].week, rank, score: myScore, bucks, gems, champion } };
    }
  } else if (ok) {
    bucks = store.save.lboard.participation;
  }
  if (ok) {
    store.addBucks(bucks);
    if (gems) store.addGems(gems);
    s.weekHistory.unshift({ week: s.week.id, rank: rank || 9999, score: myScore, bucks, gems, at: now });
    if (s.weekHistory.length > 30) s.weekHistory.pop();
    store.persist();
  }
  const settled: Announcement | undefined = ok
    ? { week: s.week.id, rank: rank || 9999, score: myScore, bucks, gems }
    : undefined;
  s.week = { id: current, dist: 0, kills: 0, bosses: 0, ships: 0, challenges: 0, time: 0, runs: 0, score: 0, flagged: false, claimed: false, rank: 0 };
  store.persist();
  return { settled: true, announcement: settled };
}
