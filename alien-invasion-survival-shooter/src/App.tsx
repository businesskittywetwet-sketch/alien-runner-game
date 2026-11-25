import { useEffect, useRef, useState } from 'react';
import { Game, type Banner, type GameState, type HudState, type RunSummary, type Toast } from './game/game';
import Hud, { BannerView, ToastStack } from './ui/Hud';
import AirHud from './ui/AirHud';
import TrainingOverlay from './ui/TrainingOverlay';
import Menu from './ui/Menu';
import { GameOver, PauseOverlay } from './ui/Overlays';
import { store } from './game/progress';
import { Ads } from './game/economy';
import { settle, type Announcement } from './game/leaderboard';

export default function App() {
  const mount = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [state, setState] = useState<GameState>('menu');
  const [hud, setHud] = useState<HudState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [inter, setInter] = useState(false);
  const [announce, setAnnounce] = useState<Announcement | null>(null);
  const stateRef = useRef<GameState>('menu');
  const showInterstitial = () => {
    // never interrupt active gameplay — only at menu / results breaks
    if (stateRef.current === 'playing' || stateRef.current === 'paused') return;
    if (Ads.showInterstitial()) {
      setInter(true);
      window.setTimeout(() => setInter(false), 2600);
    }
  };

  useEffect(() => {
    if (!mount.current) return;
    let g: Game;
    try {
      g = new Game(mount.current);
    } catch (e) {
      setErr(String(e));
      return;
    }
    const settleNow = () => {
      const r = settle();
      if (r.announcement) setAnnounce(r.announcement);
    };
    settleNow();
    const vis = () => {
      if (document.visibilityState === 'visible') settleNow();
    };
    document.addEventListener('visibilitychange', vis);
    g.onState = (s, sum) => {
      stateRef.current = s;
      if (s === 'playing') setInter(false); // an ad can never stay on screen once a run starts
      setState(s);
      if (s === 'dead') {
        setSummary(sum ?? null);
        window.setTimeout(showInterstitial, 1600); // break after the results screen (re-checked: skipped if a new run began)
      }
      if (s === 'menu') showInterstitial();
      if (s === 'menu' || s === 'playing') {
        setToasts([]);
        if (s === 'menu') setHud(null);
      }
    };
    g.onHud = (h) => setHud(h);
    g.onToast = (t) => {
      setToasts((prev) => [...prev.slice(-3), t]);
      window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 2800);
    };
    g.onBanner = (b) => {
      setBanner(b);
      window.setTimeout(() => setBanner((cur) => (cur && cur.id === b.id ? null : cur)), b.dur * 1000);
    };
    setGame(g);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      g.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 touch-none select-none overflow-hidden bg-black" onContextMenu={(e) => e.preventDefault()}>
      <div ref={mount} className="absolute inset-0" />
      {err && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black p-6 text-center text-white">
          <div>
            <h2 className="mb-2 text-2xl font-black">WebGL unavailable</h2>
            <p className="text-sm text-white/70">This game needs WebGL. Please try a different browser or enable hardware acceleration.</p>
          </div>
        </div>
      )}
      {game && (state === 'playing' || state === 'paused' || state === 'dead') && hud && (hud.mode === 'air' ? <AirHud g={game} h={hud} /> : <Hud g={game} h={hud} />)}
      {game && hud?.train && (state === 'playing' || state === 'paused') && <TrainingOverlay g={game} t={hud.train} />}
      {game && (state === 'playing' || state === 'paused') && (
        <>
          <ToastStack toasts={toasts} low={!!hud?.train} air={hud?.mode === 'air'} />
          <BannerView banner={banner} />
        </>
      )}
      {game && state === 'menu' && <Menu game={game} />}
      {game && state === 'paused' && <PauseOverlay game={game} muted={hud?.muted ?? false} training={!!hud?.train} />}
      {game && state === 'dead' && summary && <GameOver game={game} s={summary} />}
      {inter && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black p-6 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-slate-500">Advertisement</div>
            <div className="mt-2 text-3xl font-black uppercase text-white">{store.save.econ.testAds ? 'Test interstitial' : 'Advertisement'}</div>
            <div className="mt-1 text-sm text-slate-400">Full-screen ad · shown between runs only</div>
            <div className="mx-auto mt-5 h-1.5 w-56 overflow-hidden rounded-full bg-[#222]">
              <div className="h-full w-full animate-pulse bg-cyan-400" />
            </div>
            <div className="mt-2 text-[11px] text-slate-500">Closing automatically…</div>
            <button onClick={() => setInter(false)} className="mt-4 rounded-lg bg-[#1a1a24] px-4 py-2 text-xs font-bold uppercase text-white">
              Close
            </button>
          </div>
        </div>
      )}
      {announce && (
        <div className="fixed inset-0 z-[75] grid place-items-center overflow-y-auto bg-[#05050a] p-4">
          <div className="w-full max-w-md space-y-3 rounded-2xl border-2 border-amber-400 bg-[#1a1a24] p-5 text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-amber-300">Competition #{announce.week} complete</div>
            <h2 className="text-4xl font-black uppercase tracking-wide text-white">{announce.rank === 1 ? '🏆 Weekly Champion' : 'Weekly Results'}</h2>
            <div className="text-sm font-bold text-slate-300">PLAYER: {store.save.username}</div>
            <div className="text-lg font-black text-cyan-300">RANK: #{announce.rank}</div>
            <div className="space-y-1 rounded-xl bg-[#0d0d14] p-3 text-left text-sm">
              <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Rewards</div>
              <div className="font-black text-amber-300">◆ {announce.bucks.toLocaleString()} Alien Bucks</div>
              {announce.gems > 0 && <div className="font-black text-violet-300">💎 {announce.gems} Alien Gems</div>}
              {announce.champion && (
                <>
                  <div className="font-black text-amber-200">🏆 Exclusive Champion Character — {announce.champion.name}</div>
                  <div className="font-black text-amber-200">🏆 Exclusive Champion Skin (permanent)</div>
                </>
              )}
            </div>
            <button onClick={() => setAnnounce(null)} className="w-full rounded-xl bg-amber-400 py-3 font-black uppercase text-black">
              Claim & continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
