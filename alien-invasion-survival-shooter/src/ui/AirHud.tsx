import { useEffect, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { Game, HudState } from '../game/game';
import { cn } from '../utils/cn';

const stop = (e: RPointerEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

function Press({ onPress, children, className, label }: { onPress: () => void; children: ReactNode; className?: string; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        stop(e);
        onPress();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={cn('pointer-events-auto touch-none select-none outline-none transition-transform active:scale-95', className)}
    >
      {children}
    </button>
  );
}

function Bar({ value, max, color, h = 'h-2' }: { value: number; max: number; color: string; h?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-[#0b0b12] ring-1 ring-[#33334a]', h)}>
      <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

const SEC_LABEL: Record<string, string> = { engineL: 'ENG L', engineR: 'ENG R', turretL: 'GUN L', turretR: 'GUN R', core: 'CORE' };
const STAGE_NAME = ['NOMINAL', 'MINOR DAMAGE', 'DAMAGED', 'CRITICAL', 'EJECT!'];
const HULL_COLOR = ['linear-gradient(90deg,#22c55e,#86efac)', 'linear-gradient(90deg,#84cc16,#d9f99d)', 'linear-gradient(90deg,#f59e0b,#fde68a)', 'linear-gradient(90deg,#ef4444,#fca5a5)', 'linear-gradient(90deg,#dc2626,#ef4444)'];

/** Dedicated spacecraft HUD: hull integrity, weapons, missiles, EJECT, mothership health. */
export default function AirHud({ g, h }: { g: Game; h: HudState }) {
  const a = h.air!;
  useEffect(() => {
    const up = () => g.shoot(false);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [g]);

  const critical = a.stage >= 3;
  const launching = a.phase === 'launch';
  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden text-white">
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse at center, transparent 48%, rgba(255,0,0,${Math.min(0.75, h.dmg * 0.65 + (critical ? 0.22 : 0))}) 100%)` }}
      />
      {critical && <div className="absolute inset-0 animate-pulse shadow-[inset_0_0_90px_rgba(255,0,0,0.5)]" />}
      {h.hit && <div className="absolute left-1/2 top-[46%] -translate-x-1/2 text-2xl font-black text-white drop-shadow-[0_0_6px_#0ff]">✛</div>}

      {/* top-left: spacecraft systems */}
      <div className="absolute left-2 top-0 w-[40%] max-w-[210px] space-y-1 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Hull</span>
          <span className={cn('text-xl font-black leading-none tabular-nums', critical ? 'text-red-400' : 'text-white')}>{a.hull}</span>
          <span className="text-[10px] font-bold text-slate-400">/100</span>
          <span className={cn('ml-auto rounded px-1 text-[9px] font-black', critical ? 'bg-red-600 text-white' : 'bg-[#1c1c28] text-slate-300')}>{STAGE_NAME[a.stage]}</span>
        </div>
        <Bar value={a.hull} max={100} color={HULL_COLOR[a.stage]} h="h-3" />
        {a.shield > 0 && <Bar value={a.shield} max={40} color="#67e8f9" h="h-1.5" />}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-violet-300">Energy</span>
          <div className="flex-1">
            <Bar value={a.energy} max={100} color="linear-gradient(90deg,#a855f7,#22d3ee)" h="h-1.5" />
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-black text-orange-300">
          🚀
          {Array.from({ length: a.missileCap }, (_, i) => (
            <span key={i} className={cn('h-2.5 w-1.5 rounded-sm', i < a.missiles ? 'bg-orange-400' : 'bg-[#2a2a38]')} />
          ))}
        </div>
      </div>

      {/* top-centre: distance */}
      <div className="absolute inset-x-0 top-0 flex justify-center pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-200">Altitude {a.altitude} m</div>
          <div className="text-xl font-black leading-none tabular-nums">
            {h.dist.toLocaleString()}
            <span className="ml-0.5 text-xs text-sky-200">m</span>
          </div>
          <div className="text-sm font-bold tabular-nums text-amber-300">{h.score.toLocaleString()}</div>
        </div>
      </div>

      {/* top-right */}
      <div className="absolute right-2 top-0 flex items-center gap-1.5 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <span className="rounded-full bg-[#14141c] px-2 py-1 text-xs font-black tabular-nums text-amber-300 ring-1 ring-amber-500">◆ {h.bucks.toLocaleString()}</span>
        <Press onPress={() => g.pause()} label="Pause" className="grid h-9 w-9 place-items-center rounded-full bg-[#14141c] text-sm font-black ring-1 ring-[#3a3a4c]">
          ❚❚
        </Press>
      </div>

      {/* mothership health */}
      {a.boss && (
        <div className="absolute left-1/2 top-[78px] w-[62%] max-w-md -translate-x-1/2">
          <div className="mb-0.5 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.25em] text-rose-300">
            <span>{a.boss.name}</span>
            <span className="tabular-nums">{Math.ceil(a.boss.hp * 100)}%</span>
          </div>
          <Bar value={a.boss.hp * 100} max={100} color="linear-gradient(90deg,#f43f5e,#fb923c)" h="h-3" />
          <div className="mt-1 flex justify-center gap-1">
            {a.boss.sections.map((s) => (
              <span key={s.name} className={cn('rounded px-1 py-0.5 text-[8px] font-black', s.alive ? 'bg-[#3b1220] text-rose-200' : 'bg-[#1a1a24] text-slate-600 line-through')}>
                {SEC_LABEL[s.name] ?? s.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* warnings */}
      {(a.warn || a.barrage) && (
        <div className="absolute inset-x-0 top-[30%] flex flex-col items-center gap-1.5 px-3">
          {a.warn && (
            <div
              className={cn(
                'rounded-xl border-2 px-4 py-2 text-center text-lg font-black uppercase tracking-wider shadow-[0_0_30px_#ef4444]',
                a.meltdown > 0 || a.stage >= 4 ? 'animate-pulse border-yellow-300 bg-red-700 text-white' : 'border-red-400 bg-[#3b0d12] text-red-200',
              )}
            >
              {a.warn}
            </div>
          )}
          {a.barrage && <div className="animate-pulse rounded-lg bg-orange-600 px-3 py-1 text-xs font-black uppercase tracking-widest text-white">Incoming barrage — dodge!</div>}
        </div>
      )}
      {launching && (
        <div className="absolute inset-x-0 top-[34%] flex justify-center">
          <div className="rounded-lg bg-[#0f2f3a] px-4 py-2 text-sm font-black uppercase tracking-[0.3em] text-cyan-200">Launching…</div>
        </div>
      )}
      {a.controllable && !a.boss && a.enemies === 0 && !a.training && <div className="absolute inset-x-0 bottom-[190px] text-center text-[11px] font-bold uppercase tracking-widest text-cyan-200">Drag to fly</div>}

      {/* bottom-left: EJECT */}
      <div className="absolute bottom-6 left-3 pb-[env(safe-area-inset-bottom)]">
        <Press
          onPress={() => g.flight.pressEject()}
          label="Eject"
          className={cn(
            'grid h-[72px] w-[72px] place-items-center rounded-2xl border-2 text-center text-[11px] font-black uppercase leading-tight',
            a.ejectPrompt ? 'border-yellow-300 bg-red-700 text-white' : 'border-red-500 bg-[#2a1216] text-red-300',
          )}
        >
          <span style={a.ejectPrompt ? { animation: 'ejectBlink 0.5s infinite' } : undefined} className="rounded px-1">
            {a.ejectArmed ? 'TAP AGAIN' : a.ejectPrompt ? 'EJECT NOW' : '⏏ EJECT'}
          </span>
        </Press>
      </div>

      {/* bottom-right: weapons */}
      <div className="absolute bottom-6 right-3 flex flex-col items-end gap-2 pb-[env(safe-area-inset-bottom)]">
        <Press onPress={() => g.flight.cycleWeapon()} label="Switch weapon" className="rounded-lg bg-[#14141c] px-2.5 py-1.5 text-right ring-1 ring-[#3a3a4c]">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Weapon{a.weapons.length > 1 ? ' ⟳' : ''}</div>
          <div className={cn('text-xs font-black uppercase', a.weapon.temp ? 'text-fuchsia-300' : 'text-cyan-300')}>
            {a.weapon.name}
            {a.weapon.temp ? ` · ${a.weapon.tempLeft}s` : ''}
          </div>
        </Press>
        {a.weapon.id === 'charge' && <div className="w-24"><Bar value={a.charge * 100} max={100} color="#c084fc" h="h-2" /></div>}
        <div className="flex items-end gap-2">
          <Press onPress={() => g.flight.fireMissile()} label="Missile" className="relative grid h-[64px] w-[64px] place-items-center rounded-full border-2 border-orange-400 bg-[#2a1a0e] text-[10px] font-black text-orange-200">
            <span className="text-lg leading-none">🚀</span>
            <span>MISSILE</span>
            <span className="absolute -right-1 -top-1 rounded-full bg-black px-1.5 text-[10px] font-black tabular-nums text-orange-300 ring-1 ring-orange-500">{a.missiles}</span>
          </Press>
          <button
            type="button"
            aria-label="Fire"
            onPointerDown={(e) => {
              stop(e);
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              g.shoot(true);
            }}
            onPointerUp={(e) => {
              stop(e);
              g.shoot(false);
            }}
            onPointerCancel={() => g.shoot(false)}
            onContextMenu={(e) => e.preventDefault()}
            className="pointer-events-auto grid h-24 w-24 touch-none select-none place-items-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-lg font-black tracking-wider shadow-[0_0_26px_rgba(34,211,238,0.55)] ring-4 ring-[#8a8a9e] active:scale-95"
          >
            FIRE
          </button>
        </div>
      </div>
    </div>
  );
}
