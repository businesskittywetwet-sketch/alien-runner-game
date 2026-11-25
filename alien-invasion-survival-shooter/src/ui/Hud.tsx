import { useEffect, useRef, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { Game, HudState, Toast, Banner } from '../game/game';
import { cn } from '../utils/cn';

const stop = (e: RPointerEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

function Btn({ onPress, children, className, disabled, title }: { onPress: () => void; children: ReactNode; className?: string; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onPointerDown={(e) => {
        stop(e);
        if (!disabled) onPress();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={cn('pointer-events-auto touch-none select-none outline-none active:scale-95 transition-transform', className)}
    >
      {children}
    </button>
  );
}

function Bar({ value, max, color, h = 'h-2.5' }: { value: number; max: number; color: string; h?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn('relative w-full overflow-hidden rounded-full bg-[#14141c] ring-1 ring-[#33334a]', h)}>
      <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function Pill({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none text-black" style={{ background: color }}>
      {children}
    </span>
  );
}

const ICON: Record<string, string> = { dash: '⚡', bullet: '⏱', drone: '🤖', invuln: '🛡', blast: '💥' };

export function ToastStack({ toasts, low = false, air = false }: { toasts: Toast[]; low?: boolean; air?: boolean }) {
  return (
    <div className={cn('pointer-events-none absolute left-1/2 z-20 flex w-[92%] max-w-md -translate-x-1/2 flex-col items-center gap-1', low ? 'top-[262px]' : air ? 'top-[158px]' : 'top-[92px]')}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'animate-[toastIn_.25s_ease-out] rounded-lg px-3 py-1 text-center text-xs font-bold tracking-wide shadow-lg sm:text-sm',
            t.kind === 'bad' && 'bg-red-600 text-white',
            t.kind === 'good' && 'bg-emerald-600 text-white',
            t.kind === 'info' && 'bg-[#1e293b] text-sky-100',
            t.kind === 'achv' && 'bg-amber-400 text-black',
            t.kind === 'pickup' && 'bg-[#14141c] text-white ring-1',
          )}
          style={t.kind === 'pickup' && t.color !== undefined ? { boxShadow: `0 0 0 1px #${t.color.toString(16).padStart(6, '0')}` } : undefined}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function BannerView({ banner }: { banner: Banner | null }) {
  if (!banner) return null;
  return (
    <div key={banner.id} className="pointer-events-none absolute inset-x-0 top-[24%] z-20 flex justify-center">
      <div
        className="animate-[bannerIn_.5s_ease-out] px-4 text-center text-3xl font-black uppercase tracking-[0.18em] sm:text-5xl"
        style={{ color: banner.color, textShadow: `0 0 24px ${banner.color}, 0 0 4px #000` }}
      >
        {banner.text}
      </div>
    </div>
  );
}

export default function Hud({ g, h }: { g: Game; h: HudState }) {
  const shootRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const up = () => g.shoot(false);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [g]);

  const w = h.weapon;
  const critical = h.health <= 30;
  const eqPills: ReactNode[] = [];
  if (h.eq.pshield > 0) eqPills.push(<Pill key="ps" color="#7df9ff">🛡 {h.eq.pshield}s</Pill>);
  if (h.eq.phase > 0) eqPills.push(<Pill key="ph" color="#ffe066">✦ PHASE {h.eq.phase}s</Pill>);
  if (h.eq.speed > 0) eqPills.push(<Pill key="sp" color="#ff9a2e">» SPEED {h.eq.speed}s</Pill>);
  if (h.eq.boots > 0) eqPills.push(<Pill key="bo" color="#ff7043">⇧ BOOTS {h.eq.boots}s</Pill>);
  if (h.eq.gloves > 0) eqPills.push(<Pill key="gl" color="#b0bec5">🧲 GLOVES {h.eq.gloves}s</Pill>);
  if (h.eq.drone > 0) eqPills.push(<Pill key="dr" color="#40c4ff">🤖 {h.eq.drone}s</Pill>);
  if (h.bullet) eqPills.push(<Pill key="bt" color="#a5b4fc">⏱ BULLET TIME</Pill>);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden text-white">
      {/* feedback vignettes */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at center, transparent 46%, rgba(255,0,0,${Math.min(0.7, h.dmg * 0.65 + (critical ? 0.2 : 0))}) 100%)` }} />
      {h.bullet && <div className="absolute inset-0" style={{ background: 'rgba(99,102,241,0.10)' }} />}
      {h.event && <div className="absolute inset-0 animate-pulse shadow-[inset_0_0_80px_rgba(255,30,60,0.35)]" />}
      {h.hit && <div className="absolute left-1/2 top-[44%] -translate-x-1/2 text-2xl font-black text-white drop-shadow-[0_0_6px_#f00]">✕</div>}

      {/* ── top bar: health · distance · currency · pause ── */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="w-[34%] max-w-[186px] space-y-1">
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-black leading-none tabular-nums" style={{ color: critical ? '#ff5252' : '#ffffff', textShadow: critical ? '0 0 10px rgba(255,0,0,.8)' : 'none' }}>
              {h.health}
            </span>
            <span className="text-[10px] font-bold text-slate-400">/100 HP</span>
            {h.medkits > 0 && (
              <span className="ml-1 rounded bg-emerald-600 px-1 text-[9px] font-black leading-tight text-black">✚×{h.medkits}</span>
            )}
          </div>
          <Bar value={h.health} max={100} color={critical ? 'linear-gradient(90deg,#ef4444,#f87171)' : 'linear-gradient(90deg,#22c55e,#86efac)'} h="h-3" />
          <div className="flex gap-1">
            <div className="flex-1">
              <Bar value={h.armor} max={75} color="#60a5fa" h="h-1.5" />
            </div>
            <div className="flex-1">
              <Bar value={h.shield} max={100} color="#67e8f9" h="h-1.5" />
            </div>
          </div>
          <Bar value={h.energy} max={100} color="linear-gradient(90deg,#a855f7,#22d3ee)" h="h-1" />
          <div className="flex flex-wrap gap-1 pt-0.5">{eqPills}</div>
        </div>

        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-sky-200">{h.district}</div>
          <div className="text-2xl font-black leading-none tabular-nums drop-shadow sm:text-3xl">
            {h.dist.toLocaleString()}
            <span className="ml-0.5 text-xs font-bold text-sky-200">m</span>
          </div>
          <div className="text-sm font-bold tabular-nums text-amber-300 drop-shadow">{h.score.toLocaleString()}</div>
        </div>

        <div className="flex w-[34%] max-w-[186px] flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-[#14141c] px-2 py-1 text-xs font-black tabular-nums text-amber-300 ring-1 ring-amber-500" title="Alien Bucks">
              ◆ {h.bucks.toLocaleString()}
            </span>
            <Btn onPress={() => g.setMuted(!h.muted)} className="grid h-9 w-9 place-items-center rounded-full bg-[#14141c] text-sm ring-1 ring-[#3a3a4c]">
              {h.muted ? '🔇' : '🔊'}
            </Btn>
            <Btn onPress={() => g.pause()} className="grid h-9 w-9 place-items-center rounded-full bg-[#14141c] text-sm font-black ring-1 ring-[#3a3a4c]" title="Pause">
              ❚❚
            </Btn>
          </div>
        </div>
      </div>

      {/* boss bar */}
      {h.boss && (
        <div className="absolute left-1/2 top-[76px] w-[70%] max-w-md -translate-x-1/2">
          <div className="mb-0.5 text-center text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">{h.boss.name}</div>
          <Bar value={h.boss.hp * 100} max={100} color="linear-gradient(90deg,#f59e0b,#ef4444)" h="h-3" />
        </div>
      )}

      {/* traversal prompt */}
      {h.prompt && (
        <div className="absolute inset-x-0 bottom-[172px] flex justify-center sm:bottom-[150px]">
          <div className="animate-pulse rounded-full bg-cyan-400 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_18px_#22d3ee] sm:text-sm">{h.prompt}</div>
        </div>
      )}

      {/* abilities + traversal gear (left, compact) */}
      <div className="absolute bottom-[64px] left-2 flex flex-col gap-1.5">
        {h.abilities.map((a) => (
          <Btn
            key={a.id}
            onPress={() => g.useAbility(a.id)}
            title={a.name}
            className={cn('relative grid h-10 w-10 place-items-center rounded-lg text-base ring-1', a.ready ? 'bg-violet-600 ring-violet-300' : 'bg-[#14141c] brightness-75 ring-[#3a3a4c]')}
          >
            {ICON[a.id]}
            <span className="absolute -bottom-1 -right-1 rounded bg-[#0a0a10] px-1 text-[8px] font-bold text-cyan-300">{a.energy}</span>
          </Btn>
        ))}
        {h.canGrapple && (
          <Btn onPress={() => g.traversal.useGrapple()} className="grid h-11 w-11 animate-pulse place-items-center rounded-lg bg-cyan-500 text-lg ring-2 ring-white" title="Grappling hook">
            🪝
          </Btn>
        )}
        {h.canZip && (
          <Btn onPress={() => g.traversal.useZipLauncher()} className="grid h-11 w-11 animate-pulse place-items-center rounded-lg bg-yellow-400 text-lg text-black ring-2 ring-white" title="Zipline launcher">
            ➰
          </Btn>
        )}
        {!h.canGrapple && h.eq.grapple > 0 && <div className="rounded bg-[#14141c] px-1.5 py-0.5 text-center text-[10px] font-bold text-cyan-200">🪝×{h.eq.grapple}</div>}
        {!h.canZip && h.eq.zip > 0 && <div className="rounded bg-[#14141c] px-1.5 py-0.5 text-center text-[10px] font-bold text-yellow-200">➰×{h.eq.zip}</div>}
      </div>

      {/* weapon + shoot (right) */}
      <div className="absolute bottom-[64px] right-2 flex flex-col items-end gap-2">
        <div className="flex max-w-[200px] flex-wrap justify-end gap-1">
          {h.owned.map((o) => (
            <Btn
              key={o.id}
              onPress={() => g.weapons.switchTo(o.id)}
              className={cn('rounded-md px-1.5 py-1 text-[9px] font-black uppercase leading-none', o.active ? 'bg-amber-400 text-black' : 'bg-[#14141c] text-slate-300 ring-1 ring-[#3a3a4c]')}
            >
              {o.name.split(' ')[0]}
            </Btn>
          ))}
        </div>
        <div className="rounded-lg bg-[#14141c] px-2.5 py-1 text-right ring-1 ring-[#3a3a4c]">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">{w.name}</div>
          <div className="text-xl font-black leading-none tabular-nums">
            {w.reloading ? <span className="text-sm text-sky-300">RELOADING…</span> : w.mag}
            {!w.reloading && <span className="text-xs font-bold text-slate-400"> / {w.infinite ? '∞' : w.reserve}</span>}
          </div>
          {w.reloading && <Bar value={w.reloadPct * 100} max={100} color="#38bdf8" h="h-1" />}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Btn onPress={() => g.weapons.throwGrenade()} className="relative grid h-10 w-10 place-items-center rounded-full bg-lime-700 text-base ring-1 ring-lime-300" title="Grenade">
              💣
              <span className="absolute -right-1 -top-1 rounded-full bg-black px-1 text-[9px] font-bold">{h.grenades}</span>
            </Btn>
            <Btn onPress={() => g.weapons.reload()} className="grid h-10 w-10 place-items-center rounded-full bg-[#2a3344] text-base ring-1 ring-[#4a4a5e]" title="Reload">
              ⟳
            </Btn>
            <Btn onPress={() => g.toggleAuto()} className={cn('grid h-10 w-10 place-items-center rounded-full text-[10px] font-black ring-1', h.auto ? 'bg-emerald-500 ring-emerald-200' : 'bg-[#2a3344] ring-[#4a4a5e]')} title="Auto-fire">
              AUTO
            </Btn>
          </div>
          <button
            ref={shootRef}
            type="button"
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
            className="pointer-events-auto grid h-24 w-24 touch-none select-none place-items-center rounded-full bg-gradient-to-br from-red-500 to-orange-500 text-lg font-black tracking-wider shadow-[0_0_26px_rgba(255,90,40,0.6)] ring-4 ring-[#8a8a9e] active:scale-95"
          >
            SHOOT
          </button>
        </div>
      </div>

      {/* optional direct lane buttons (off by default — swipes are primary) */}
      {h.laneButtons && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="flex w-full max-w-[420px] gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <Btn
                key={i}
                onPress={() => g.setLane(i)}
                className={cn(
                  'relative h-11 flex-1 rounded-xl text-sm font-black ring-2 transition-colors',
                  h.lane === i ? 'bg-sky-400 text-black ring-white' : 'bg-[#14141c] text-slate-300 ring-[#4a4a5e]',
                  h.threat[i] && 'animate-pulse !bg-red-600 !text-white !ring-red-300',
                )}
              >
                {h.threat[i] ? '⚠' : ''} {i + 1}
              </Btn>
            ))}
          </div>
        </div>
      )}

      {/* lane threat strip (visual only, no buttons) */}
      {!h.laneButtons && (
        <div className="absolute inset-x-0 bottom-[54px] flex justify-center px-3">
          <div className="flex w-full max-w-[300px] gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full transition-all',
                  h.threat[i] ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-[#3a3a4c]',
                  h.lane === i && !h.threat[i] ? 'bg-cyan-300' : '',
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
