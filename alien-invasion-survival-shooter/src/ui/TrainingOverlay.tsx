import type { Game } from '../game/game';
import type { TrainHud } from '../game/tutorialctl';
import { SwipeHand, TapIcon } from './icons';
import { cn } from '../utils/cn';

const SPOT: Record<string, { cls: string; label: string }> = {
  ammo: { cls: 'bottom-[196px] right-3', label: 'AMMO ▼' },
  health: { cls: 'top-[66px] left-3', label: '▲ HEALTH' },
  bucks: { cls: 'top-[52px] right-[96px]', label: 'ALIEN BUCKS ▲' },
  weapons: { cls: 'bottom-[250px] right-3', label: 'WEAPON CHIPS ▼' },
  abilities: { cls: 'bottom-[130px] left-14', label: '◀ ABILITIES' },
};
const ANIM: Record<string, string> = { right: 'nudgeR', left: 'nudgeL', up: 'nudgeU', down: 'nudgeD' };

function Gesture({ t }: { t: TrainHud }) {
  const gst = t.gesture;
  if (gst === 'none') return null;
  if (gst === 'tap')
    return (
      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg" style={{ animation: 'tapPulse 0.9s infinite' }}>
        <TapIcon />
      </div>
    );
  if (gst === 'collect') return <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#0f2f3a] text-2xl">✨</div>;
  return (
    <div className="h-12 w-12 shrink-0" style={{ animation: `${ANIM[gst]} 0.9s ease-in-out infinite` }}>
      <SwipeHand dir={gst} />
    </div>
  );
}

/** Instruction card, demonstration banner, progress tracker, success indicator, retry and lesson-complete screens. */
export default function TrainingOverlay({ g, t }: { g: Game; t: TrainHud }) {
  const demo = t.phase === 'demo';
  const done = t.phase === 'lessonDone' || t.phase === 'allDone';
  const top = t.air ? 'top-[118px]' : 'top-[86px]';

  if (done) {
    const all = t.phase === 'allDone';
    return (
      <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-[#05050a] p-4 text-white">
        <div className="w-full max-w-sm space-y-3 rounded-2xl border-2 border-emerald-400 bg-[#12251c] p-5 text-center">
          <div className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-300">{all ? 'Training complete' : `Lesson ${t.lesson + 1} complete`}</div>
          <div className="text-5xl">{all ? '🎖️' : '✅'}</div>
          <h2 className="text-2xl font-black uppercase">{all ? 'You are ready, pilot!' : t.title}</h2>
          <p className="text-sm text-slate-300">
            {all
              ? 'All 12 lessons are done and saved to your account. The full game is unlocked — you can replay any lesson from the Training menu.'
              : 'Well done. Your progress is saved — you can replay this lesson any time.'}
          </p>
          {t.reward > 0 && <div className="rounded-xl bg-[#1d1a10] p-2 text-sm font-black text-amber-300 ring-1 ring-amber-500">◆ +{t.reward} Alien Bucks graduation bonus!</div>}
          <div className="flex gap-1 pt-1">
            {t.done.map((d, i) => (
              <span key={i} className={cn('h-2 flex-1 rounded-full', d ? 'bg-emerald-400' : 'bg-[#2a2a38]')} />
            ))}
          </div>
          {all ? (
            <button
              onClick={() => {
                g.quit();
                g.start();
              }}
              className="w-full rounded-xl bg-gradient-to-r from-red-600 to-orange-500 py-3 text-lg font-black uppercase tracking-wider text-white"
            >
              ▶ Start your first run
            </button>
          ) : (
            t.hasNext && (
              <button onClick={() => g.tutorial.nextLesson()} className="w-full rounded-xl bg-cyan-400 py-3 text-lg font-black uppercase tracking-wider text-black">
                Next lesson →
              </button>
            )
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => g.tutorial.replayLesson()} className="rounded-xl bg-[#2a2a3c] py-2.5 text-sm font-black uppercase text-white">
              ↻ Replay
            </button>
            <button onClick={() => g.quit()} className="rounded-xl bg-[#2a2a3c] py-2.5 text-sm font-black uppercase text-white">
              Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  const spot = t.spot !== 'none' && t.phase === 'practice' ? SPOT[t.spot] : null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 text-white">
      <div className={cn('pointer-events-auto absolute inset-x-2 mx-auto max-w-lg rounded-2xl border-2 bg-[#12121a] p-2.5', top, demo ? 'border-orange-400' : 'border-cyan-400')}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
              Lesson {t.lesson + 1}/{t.lessonCount} · {t.title} <span className="text-slate-500">· step {t.step + 1}/{t.stepCount}</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {!t.info && t.phase !== 'success' && (
              <button onClick={() => g.tutorial.retry()} className="rounded-lg bg-[#2a2a3c] px-2.5 py-1 text-[11px] font-black uppercase text-white">
                ↻ Retry
              </button>
            )}
            <button onClick={() => g.quit()} className="rounded-lg bg-[#2a1216] px-2.5 py-1 text-[11px] font-black uppercase text-red-300">
              Exit
            </button>
          </div>
        </div>
        <div className="mt-1.5 flex gap-0.5">
          {t.done.map((d, i) => (
            <span key={i} className={cn('h-1.5 flex-1 rounded-full', i === t.lesson ? 'bg-cyan-400' : d ? 'bg-emerald-500' : 'bg-[#2a2a38]')} />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2.5">
          {demo ? <Gesture t={t} /> : t.phase === 'practice' && !t.info ? <Gesture t={t} /> : null}
          <div className="min-w-0 flex-1">
            {demo ? (
              <>
                <div className="text-[10px] font-black uppercase tracking-widest text-orange-300">▶ Watch the demonstration · {Math.ceil(t.demoLeft)}s</div>
                <div className="text-sm font-bold leading-tight text-white">{t.intro || t.text}</div>
              </>
            ) : (
              <div className="text-sm font-black leading-tight text-white">{t.text}</div>
            )}
            {t.need > 1 && t.phase !== 'demo' && (
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#0b0b12]">
                  <div className="h-full bg-emerald-400 transition-[width]" style={{ width: `${(Math.min(t.prog, t.need) / t.need) * 100}%` }} />
                </div>
                <span className="text-[11px] font-black tabular-nums text-emerald-300">
                  {Math.min(t.prog, t.need)}/{t.need}
                </span>
              </div>
            )}
            {t.msg && <div className={cn('mt-1 text-[11px] font-black', t.msgBad ? 'text-red-300' : 'text-emerald-300')}>{t.msg}</div>}
          </div>
          {demo && (
            <button onClick={() => g.tutorial.skipDemo()} className="shrink-0 rounded-lg bg-orange-500 px-2.5 py-1.5 text-[11px] font-black uppercase text-black">
              Skip
            </button>
          )}
          {t.info && t.phase === 'practice' && (
            <button onClick={() => g.tutorial.next()} className="shrink-0 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black uppercase text-black">
              Continue
            </button>
          )}
        </div>
      </div>

      {t.cue && t.phase === 'practice' && (
        <div className="absolute inset-x-0 top-[44%] flex justify-center">
          <div className="animate-pulse rounded-2xl bg-yellow-300 px-6 py-2 text-3xl font-black uppercase tracking-wider text-black shadow-[0_0_30px_#fde047]">{t.cue}</div>
        </div>
      )}
      {t.phase === 'success' && (
        <div className="absolute inset-x-0 top-[40%] flex justify-center">
          <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-600 px-8 py-3 text-center shadow-[0_0_34px_#10b981]">
            <div className="text-4xl font-black text-white">✓</div>
            <div className="text-lg font-black uppercase tracking-widest text-white">Great job!</div>
          </div>
        </div>
      )}
      {spot && (
        <div className={cn('absolute animate-pulse rounded-lg bg-cyan-400 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-black', spot.cls)}>{spot.label}</div>
      )}
    </div>
  );
}
