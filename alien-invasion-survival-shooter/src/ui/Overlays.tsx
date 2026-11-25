import { useState } from 'react';
import type { Game, RunSummary } from '../game/game';
import { store } from '../game/progress';
import { Ads } from '../game/economy';
import { cn } from '../utils/cn';

export function PauseOverlay({ game, muted, training = false }: { game: Game; muted: boolean; training?: boolean }) {
  const [, setTick] = useState(0);
  const lanes = store.save.settings.laneButtons;
  return (
    <div className="absolute inset-0 z-40 grid place-items-center overflow-y-auto bg-[#05050a] p-4 text-white">
      <div className="w-full max-w-sm space-y-3 rounded-2xl border border-[#34344a] bg-[#1a1a24] p-5">
        <h2 className="text-center text-3xl font-black uppercase tracking-widest">Paused</h2>
        <button onClick={() => game.resume()} className="w-full rounded-xl bg-cyan-400 py-3 text-lg font-black uppercase tracking-widest text-black">
          Resume
        </button>
        <button onClick={() => game.start()} className="w-full rounded-xl bg-[#2a2a3c] py-2.5 font-bold uppercase tracking-wider text-white">
          {training ? 'Retry lesson' : 'Restart run'}
        </button>
        <button onClick={() => game.setMuted(!muted)} className="w-full rounded-xl bg-[#2a2a3c] py-2.5 font-bold uppercase tracking-wider text-white">
          Sound: {muted ? 'OFF' : 'ON'}
        </button>
        <button
          onClick={() => {
            store.save.settings.laneButtons = !lanes;
            store.persist();
            setTick((x) => x + 1);
          }}
          className={cn('w-full rounded-xl py-2.5 font-bold uppercase tracking-wider', lanes ? 'bg-cyan-400 text-black' : 'bg-[#2a2a3c] text-white')}
        >
          Lane buttons: {lanes ? 'ON' : 'OFF'}
        </button>
        <button onClick={() => game.quit()} className="w-full rounded-xl bg-red-700 py-2.5 font-bold uppercase tracking-wider text-white">
          {training ? 'Exit training' : 'Quit to menu'}
        </button>
        <p className="text-center text-[11px] text-slate-400">Swipe ← → one lane per swipe · ↑ jump · ↓ slide · tap to shoot</p>
      </div>
    </div>
  );
}

export function GameOver({ game, s }: { game: Game; s: RunSummary }) {
  const st = s.stats;
  const [reviving, setReviving] = useState(false);
  const watchRevive = async () => {
    if (reviving) return;
    setReviving(true);
    await new Promise((r) => setTimeout(r, 1200)); // rewarded ad playback
    const ok = Ads.consumeRewarded();
    setReviving(false);
    if (ok) game.reviveFromAd();
    else game.toast('Daily rewarded-ad limit reached.', 'bad');
  };
  const rows: [string, string | number][] = [
    ['Distance', `${Math.floor(st.dist).toLocaleString()} m`],
    ['Survival time', `${Math.floor(st.time / 60)}:${String(Math.floor(st.time % 60)).padStart(2, '0')}`],
    ['Alien kills', st.kills],
    ['Ships destroyed', st.ships],
    ['Traversal actions', st.traversals],
    ['Obstacles avoided', st.avoided],
    ['Pickups collected', st.pickups],
    ['Weapons found', st.weaponPickups],
    ['Ammo collected', st.ammo],
    ['Accuracy', st.shots ? `${Math.round(s.accuracy * 100)}%` : '—'],
  ];
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-[#05050a] p-4 text-white">
      <div className="mx-auto my-4 w-full max-w-md space-y-3 rounded-2xl border border-[#5a2a2a] bg-[#1a1a24] p-5">
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-[0.4em] text-red-400">Mission failed</div>
          <h2 className="text-4xl font-black uppercase tracking-wider">You Fell</h2>
          {s.best && <div className="mt-1 inline-block rounded-full bg-amber-400 px-3 py-0.5 text-xs font-black text-black">★ NEW HIGH SCORE ★</div>}
        </div>
        <div className="rounded-xl bg-[#0d0d14] p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-slate-400">Score</div>
          <div className="text-4xl font-black tabular-nums text-amber-300">{st.score.toLocaleString()}</div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-[#2a2a3c] py-0.5">
              <span className="text-slate-400">{k}</span>
              <span className="font-bold tabular-nums">{v}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-[#6b5512] bg-[#1d1a10] p-2.5 text-center">
          <span className="text-sm font-bold text-amber-200">Run bonus: </span>
          <span className="text-xl font-black text-amber-300">◆ {s.credits}</span>
        </div>
        {s.newAch.length > 0 && (
          <div className="space-y-1">
            {s.newAch.map((a) => (
              <div key={a.id} className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-bold text-black">
                🏆 {a.name} <span className="float-right">+{a.reward} ◆</span>
              </div>
            ))}
          </div>
        )}
        {s.daily.length > 0 && (
          <div className="space-y-1">
            {s.daily.map((d) => (
              <div key={d.id} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white">
                ✔ Daily complete: {d.text} <span className="float-right">+{d.reward} ◆</span>
              </div>
            ))}
          </div>
        )}
        {Ads.rewardedAvailable() && (
          <button
            onClick={watchRevive}
            disabled={reviving}
            className="w-full rounded-xl bg-violet-600 py-3 text-base font-black uppercase tracking-wider text-white disabled:opacity-70"
          >
            {reviving ? 'Loading advertisement…' : '▶ Watch ad → Revive (60 HP)'}
          </button>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button onClick={() => game.start()} className="rounded-xl bg-gradient-to-r from-red-600 to-orange-500 py-3 text-lg font-black uppercase tracking-wider text-white">
            Run again
          </button>
          <button onClick={() => game.quit()} className="rounded-xl bg-[#2a2a3c] py-3 text-lg font-black uppercase tracking-wider text-white">
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}
