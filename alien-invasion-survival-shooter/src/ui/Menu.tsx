import { useState, type ReactNode } from 'react';
import type { Game } from '../game/game';
import { ACHIEVEMENTS, BP_TIERS, BP_XP_PER_TIER, store, TRAIN_LESSONS } from '../game/progress';
import { cn } from '../utils/cn';
import Tutorial from './Tutorial';
import Shop from './Shop';
import Leaderboard from './Leaderboard';
import Admin from './Admin';
import { Ads } from '../game/economy';

type Page = 'home' | 'shop' | 'missions' | 'help' | 'pass' | 'currency' | 'leaderboard' | 'admin' | 'training';

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'home', label: 'Play', icon: '▶' },
  { id: 'shop', label: 'Shop', icon: '🛒' },
  { id: 'missions', label: 'Missions', icon: '🎯' },
  { id: 'training', label: 'Training', icon: '🎓' },
  { id: 'help', label: 'How to Play', icon: '❓' },
  { id: 'pass', label: 'Battle Pass', icon: '🏅' },
  { id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
  { id: 'currency', label: 'Currency / Store', icon: '◆' },
  { id: 'admin', label: 'Administration', icon: '⚙' },
];
const TITLE: Record<Page, string> = {
  home: 'Nightfall Run', shop: 'Shop', missions: 'Missions', help: 'How to Play', pass: 'Battle Pass', currency: 'Currency / Store',
  leaderboard: 'Global Leaderboard', admin: 'Administration', training: 'Training',
};

/* ----------------------------- shared widgets ----------------------------- */
function BucksChip({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-[#6b5512] bg-[#14141c] px-2 py-0.5" title="Alien Bucks">
      <span className="text-[8px] font-light uppercase tracking-[0.18em] text-slate-400">Alien Bucks</span>
      <span className="text-xs font-normal tabular-nums text-amber-300">◆ {n.toLocaleString()}</span>
    </div>
  );
}

function Burger({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Open menu" className="grid h-10 w-10 place-items-center rounded-lg border border-[#3a3a4c] bg-[#14141c] text-xl leading-none text-white active:scale-95">
      ☰
    </button>
  );
}

/* -------------------------------- Training -------------------------------- */
const LESSON_NAMES = [
  ['🏃', 'Basic Movement', 'Running and the four lanes'],
  ['⤒', 'Jumping', 'Jump over low obstacles'],
  ['⤓', 'Sliding', 'Slide under high obstacles'],
  ['🎯', 'Shooting', 'Fire at still and moving targets'],
  ['🔫', 'Weapons', 'Collect, switch, weapon types'],
  ['📦', 'Ammunition', 'Reload and ammo capacity'],
  ['✚', 'Health', 'Damage, kits and the 100 HP cap'],
  ['◆', 'Currency', 'Alien Bucks vs Alien Gems'],
  ['🛡', 'Pickups & Equipment', 'Shields, grenades, abilities'],
  ['🪝', 'Environmental Traversal', 'Ramps, ropes, zip, grapple, vault'],
  ['👾', 'Alien Combat', 'Ground & flying enemies'],
  ['🚀', 'Spacecraft Combat', 'Fly, fight a mothership, eject'],
];

function TrainingPage({ game }: { game: Game }) {
  const done = store.trainingDone();
  const completed = store.save.training.lessons.length;
  const next = store.nextLesson();
  return (
    <div className="space-y-3">
      <div className={cn('rounded-2xl border p-3', done ? 'border-emerald-500 bg-[#12251c]' : 'border-cyan-500 bg-[#0f2733]')}>
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300">{done ? 'Training complete' : 'Required training'}</div>
        <div className="text-lg font-black text-white">
          {completed}/{TRAIN_LESSONS} lessons done
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#0b0b12]">
          <div className="h-full bg-emerald-400" style={{ width: `${(completed / TRAIN_LESSONS) * 100}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-300">
          {done
            ? 'You can replay any lesson at any time. Nothing in training costs health or currency.'
            : 'Finish every lesson to unlock the main game. Each lesson teaches one mechanic with a demonstration, unlimited attempts and no penalties.'}
        </p>
        <button onClick={() => game.startTraining(done ? 0 : next)} className="mt-2 w-full rounded-xl bg-cyan-400 py-2.5 text-sm font-black uppercase tracking-wider text-black">
          {done ? '↻ Replay full course' : completed ? `▶ Continue — lesson ${next + 1}` : '▶ Start training'}
        </button>
      </div>
      <div className="space-y-1.5">
        {LESSON_NAMES.map(([icon, name, sub], i) => {
          const ok = store.lessonDone(i);
          const open = ok || done || i === next;
          return (
            <div key={name} className={cn('flex items-center gap-3 rounded-xl border p-2.5', ok ? 'border-emerald-600 bg-[#10231a]' : open ? 'border-cyan-600 bg-[#1a1a24]' : 'border-[#2a2a3c] bg-[#14141c]')}>
              <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg text-lg', ok ? 'bg-emerald-600' : open ? 'bg-[#242434]' : 'bg-[#1a1a24] text-slate-600')}>{ok ? '✓' : icon}</div>
              <div className="min-w-0 flex-1">
                <div className={cn('text-sm font-extrabold', open ? 'text-white' : 'text-slate-500')}>
                  {i + 1}. {name}
                </div>
                <div className="text-[11px] text-slate-400">{sub}</div>
              </div>
              <button
                disabled={!open}
                onClick={() => game.startTraining(i)}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-black uppercase', open ? (ok ? 'bg-[#2a2a3c] text-white' : 'bg-cyan-400 text-black') : 'bg-[#1a1a24] text-slate-600')}
              >
                {ok ? 'Replay' : open ? 'Start' : '🔒'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- Missions -------------------------------- */
function Missions() {
  const s = store.save;
  const ch = store.challenges();
  const t = s.totals;
  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-black uppercase tracking-widest text-cyan-300">Daily Challenges</h3>
        <div className="space-y-2">
          {ch.map((c) => {
            const prog = Math.min(c.goal, s.daily.prog[c.k] ?? 0);
            const done = s.daily.claimed.includes(c.id);
            return (
              <div key={c.id} className="rounded-xl border border-[#34344a] bg-[#1a1a24] p-2.5">
                <div className="flex items-center justify-between text-sm font-bold text-white">
                  <span>{c.text}</span>
                  <span className={done ? 'text-emerald-300' : 'text-amber-300'}>{done ? '✔ CLAIMED' : `◆ ${c.reward}`}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#0d0d14]">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(prog / c.goal) * 100}%` }} />
                </div>
                <div className="mt-0.5 text-right text-[10px] text-slate-400">
                  {Math.floor(prog)} / {c.goal}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-black uppercase tracking-widest text-amber-300">
          Achievements ({s.achievements.length}/{ACHIEVEMENTS.length})
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACHIEVEMENTS.map((a) => {
            const done = s.achievements.includes(a.id);
            const [cur, goal] = a.progress ? a.progress(t) : [done ? 1 : 0, 1];
            return (
              <div key={a.id} className={cn('rounded-xl border p-2.5', done ? 'border-amber-400 bg-[#2a2410]' : 'border-[#34344a] bg-[#1a1a24]')}>
                <div className="flex items-center justify-between text-sm font-extrabold text-white">
                  <span>
                    {done ? '🏆' : '🔒'} {a.name}
                  </span>
                  <span className="text-xs text-amber-300">◆ {a.reward}</span>
                </div>
                <div className="text-[11px] text-slate-400">{a.desc}</div>
                {!done && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#0d0d14]">
                    <div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, (cur / goal) * 100)}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
        {[
          ['Best distance', `${Math.floor(t.bestDist)} m`],
          ['Best score', Math.floor(t.bestScore).toLocaleString()],
          ['Total kills', t.kills],
          ['Ships downed', t.ships],
          ['Traversals', t.traversals],
          ['Runs', t.runs],
          ['Obstacles dodged', t.avoided],
          ['Accuracy', t.shots ? `${Math.round((t.hits / t.shots) * 100)}%` : '—'],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-lg border border-[#34344a] bg-[#1a1a24] p-2">
            <div className="text-lg font-black text-white">{v}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">{k}</div>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ------------------------------- Battle Pass ------------------------------ */
function BattlePass({ game, refresh }: { game: Game; refresh: () => void }) {
  const xp = store.bpXp();
  const cur = BP_TIERS.filter((t) => xp >= t.xp).length;
  const next = BP_TIERS[cur];
  const into = next ? xp - (cur > 0 ? BP_TIERS[cur - 1].xp : 0) : BP_XP_PER_TIER;
  const claimed = store.save.bp.claimed;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#6b5512] bg-[#1d1a10] p-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400">Season 1 · Free pass</div>
            <div className="text-2xl font-black text-white">Tier {cur}<span className="text-sm font-bold text-slate-400"> / {BP_TIERS.length}</span></div>
          </div>
          <div className="text-right text-xs font-bold text-slate-300">{xp.toLocaleString()} XP</div>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-[#0d0d14]">
          <div className="h-full rounded-full bg-amber-400" style={{ width: `${next ? (into / BP_XP_PER_TIER) * 100 : 100}%` }} />
        </div>
        <div className="mt-1 text-[11px] text-slate-400">
          {next ? `${next.xp - xp} XP to Tier ${next.tier}` : 'Pass complete!'} · XP comes from kills, distance, ships, traversals, bosses and invasion events.
        </div>
      </div>
      <div className="space-y-2">
        {BP_TIERS.map((t) => {
          const unlocked = store.bpUnlocked(t);
          const done = claimed.includes(t.tier);
          return (
            <div key={t.tier} className={cn('flex items-center gap-3 rounded-xl border p-2.5', done ? 'border-[#1f5a3a] bg-[#10231a]' : unlocked ? 'border-amber-400 bg-[#2a2410]' : 'border-[#34344a] bg-[#1a1a24]')}>
              <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg text-sm font-black', unlocked ? 'bg-amber-400 text-black' : 'bg-[#2a2a38] text-slate-400')}>{t.tier}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-extrabold text-white">◆ {t.bucks} Alien Bucks</div>
                {t.item ? <div className="text-[11px] font-bold text-violet-300">+ {t.item.label}</div> : <div className="text-[11px] text-slate-500">{t.xp.toLocaleString()} XP</div>}
              </div>
              {done ? (
                <span className="rounded-lg bg-[#123524] px-3 py-1.5 text-xs font-black text-emerald-300">CLAIMED</span>
              ) : (
                <button
                  disabled={!unlocked}
                  onClick={() => {
                    if (store.claimBp(t)) {
                      game.audio.init();
                      game.audio.buy();
                      refresh();
                    }
                  }}
                  className={cn('rounded-lg px-3 py-1.5 text-xs font-black', unlocked ? 'bg-amber-400 text-black' : 'bg-[#2a2a38] text-slate-500')}
                >
                  {unlocked ? 'CLAIM' : '🔒 LOCKED'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------- Currency / Store page --------------------------- */
function Currency({ game, refresh }: { game: Game; refresh: () => void }) {
  const can = store.canClaimDaily();
  const { streak, reward } = store.dailyReward();
  const rows: [string, string][] = [
    ['Alien Buck coin pickup', '+10'],
    ['Coin cluster', '+30'],
    ['Coin bundle', '+75'],
    ['Alien Scout / Drone / Soldier', '+2 to +4'],
    ['Hunter / Sniper', '+6'],
    ['Alien Brute', '+12'],
    ['Destroyed spaceship', '+12'],
    ['Every 500 m milestone', '+50'],
    ['Alien Commander boss', '+150'],
    ['Daily challenges & achievements', 'varies'],
    ['Battle Pass tiers', '+30 to +420'],
    ['Rare enemy bundle drop (5%)', '+30 / +75'],
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#6b5512] bg-[#1d1a10] p-4 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-400">Your balance</div>
        <div className="text-4xl font-black tabular-nums text-amber-300">◆ {store.bucks().toLocaleString()}</div>
        <div className="text-[11px] text-slate-400">Alien Bucks are saved to your account and never lost when a run ends.</div>
      </div>
      <div className="rounded-2xl border border-[#34344a] bg-[#1a1a24] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black uppercase tracking-wider text-white">Daily bonus</div>
            <div className="text-[11px] text-slate-400">
              {can ? `Day ${streak} streak — claim ◆ ${reward} now. Keep your streak for up to +70.` : `Claimed today (streak ${store.save.bonus.streak}). Come back tomorrow!`}
            </div>
          </div>
          <button
            disabled={!can}
            onClick={() => {
              if (store.claimDaily() > 0) {
                game.audio.init();
                game.audio.buy();
                refresh();
              }
            }}
            className={cn('shrink-0 rounded-xl px-4 py-2.5 text-sm font-black', can ? 'bg-amber-400 text-black' : 'bg-[#2a2a38] text-slate-500')}
          >
            {can ? `CLAIM ◆ ${reward}` : 'CLAIMED'}
          </button>
        </div>
      </div>
      <div className="rounded-2xl border border-[#34344a] bg-[#1a1a24] p-3">
        <div className="mb-2 text-sm font-black uppercase tracking-wider text-cyan-300">How to earn Alien Bucks</div>
        <div className="divide-y divide-[#2a2a3c]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-slate-300">{k}</span>
              <span className="font-black text-amber-300">◆ {v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Menu ---------------------------------- */
export default function Menu({ game }: { game: Game }) {
  const [page, setPage] = useState<Page>('home');
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const refresh = () => setTick((x) => x + 1);
  const go = (p: Page) => {
    game.audio.init();
    game.audio.ui();
    setPage(p);
    setOpen(false);
  };
  const bucks = store.bucks();

  const drawer: ReactNode = (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[78%] max-w-[300px] flex-col border-r border-[#34344a] bg-[#12121a] shadow-[8px_0_30px_#000] transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-[#2a2a3c] px-4 py-4">
          <div className="text-lg font-black uppercase leading-none text-white">
            Night<span className="text-cyan-300">fall</span> Run
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-lg bg-[#242434] text-lg text-white">
            ✕
          </button>
        </div>
        <nav className="flex-1 space-y-1.5 overflow-y-auto p-3">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => go(n.id)}
              className={cn('flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-black uppercase tracking-wider', page === n.id ? 'bg-cyan-400 text-black' : 'bg-[#1a1a24] text-white')}
            >
              <span className="w-6 text-center text-base">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-[#2a2a3c] p-3">
          <BucksChip n={bucks} />
        </div>
      </aside>
    </>
  );

  if (page === 'home') {
    return (
      <div className="absolute inset-0 z-30 flex flex-col">
        <div className="flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <Burger onClick={() => setOpen(true)} />
          <BucksChip n={bucks} />
        </div>
        <h1 className="mt-4 px-4 text-center text-5xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-7xl" style={{ textShadow: '0 0 30px #1aa7d6, 0 3px 0 #000' }}>
          Night<span className="text-cyan-300">fall</span>
          <br />
          Run
        </h1>
        <div className="mt-auto px-5 pb-2">
          {Ads.bannerAllowed() && (
            <div className="mx-auto mb-3 flex max-w-md items-center justify-between rounded-lg border border-[#34344a] bg-[#14141c] px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500">
              <span>Advertisement</span>
              <span className="text-slate-400">banner 320×50</span>
            </div>
          )}
        </div>
        <div className="px-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => game.start()}
            className={cn(
              'mx-auto block w-full max-w-md rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 py-5 font-black uppercase text-white shadow-[0_0_40px_#c2410c] active:scale-95',
              store.trainingDone() ? 'text-3xl tracking-[0.2em]' : 'text-2xl tracking-[0.1em]',
            )}
          >
            {store.trainingDone() ? '▶ Start Run' : '▶ Start Training'}
          </button>
        </div>
        {drawer}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#0d0d14]">
      <header className="flex items-center gap-3 border-b border-[#2a2a3c] bg-[#12121a] p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Burger onClick={() => setOpen(true)} />
        <h2 className="flex-1 truncate text-lg font-black uppercase tracking-wide text-white">{TITLE[page]}</h2>
        <BucksChip n={bucks} />
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-3xl">
          {page === 'shop' && <Shop game={game} refresh={refresh} />}
          {page === 'missions' && <Missions />}
          {page === 'help' && <Tutorial embedded />}
          {page === 'training' && <TrainingPage game={game} />}
          {page === 'pass' && <BattlePass game={game} refresh={refresh} />}
          {page === 'currency' && <Currency game={game} refresh={refresh} />}
          {page === 'leaderboard' && <Leaderboard />}
          {page === 'admin' && <Admin onExit={() => go('home')} />}
        </div>
      </div>
      <div className="border-t border-[#2a2a3c] bg-[#12121a] p-3">
        <button onClick={() => go('home')} className="mx-auto block w-full max-w-md rounded-xl bg-gradient-to-r from-red-600 to-orange-500 py-3 text-lg font-black uppercase tracking-widest text-white">
          ▶ Play
        </button>
      </div>
      {drawer}
    </div>
  );
}
