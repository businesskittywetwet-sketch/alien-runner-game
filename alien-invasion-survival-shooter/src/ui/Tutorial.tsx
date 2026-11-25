import { useState, type ReactNode } from 'react';
import { cn } from '../utils/cn';
import { BarrierIcon, BillboardIcon, BulletsIcon, CarIcon, DroneIcon, GapIcon, LaneDiagram, Runner, ScaffoldIcon, SwipeHand, TapIcon } from './icons';

function Card({ icon, label, note, tone }: { icon: ReactNode; label: string; note?: string; tone: 'jump' | 'slide' }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#34344a] bg-[#1a1a24] p-2">
      <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold text-white">{label}</div>
        {note && <div className="text-[11px] leading-tight text-slate-400">{note}</div>}
      </div>
      <span className={cn('rounded-md px-2 py-1 text-[10px] font-black text-black', tone === 'jump' ? 'bg-emerald-400' : 'bg-orange-400')}>
        {tone === 'jump' ? 'JUMP' : 'SLIDE'}
      </span>
    </div>
  );
}

function Hero({ children }: { children: ReactNode }) {
  return <div className="mx-auto h-40 w-full max-w-[280px] overflow-hidden rounded-2xl border border-[#34344a] bg-[#10101a]">{children}</div>;
}

function Chip({ tone, children }: { tone: 'jump' | 'slide' | 'lane' | 'shoot'; children: ReactNode }) {
  const c = { jump: 'bg-emerald-400', slide: 'bg-orange-400', lane: 'bg-cyan-400', shoot: 'bg-red-400' }[tone];
  return <span className={cn('inline-block rounded-md px-2 py-0.5 text-xs font-black text-black', c)}>{children}</span>;
}

function Mini({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[#242434] p-1.5">
      <div className="h-9 w-14 shrink-0 overflow-hidden rounded-md">{icon}</div>
      <span className="text-[11px] font-bold leading-tight text-white">{label}</span>
    </div>
  );
}

const PAGES: { title: string; render: () => ReactNode }[] = [
  {
    title: 'Change lanes',
    render: () => (
      <div className="space-y-4">
        <Hero>
          <LaneDiagram />
        </Hero>
        <div className="flex items-center justify-center gap-4">
          <div className="h-16 w-16">
            <SwipeHand dir="left" />
          </div>
          <div className="h-16 w-16">
            <SwipeHand dir="right" />
          </div>
        </div>
        <div className="space-y-2 text-center">
          <div className="text-lg font-black text-white">
            Swipe <Chip tone="lane">LEFT</Chip> or <Chip tone="lane">RIGHT</Chip>
          </div>
          <p className="text-sm text-slate-300">
            <b className="text-amber-300">ONE swipe = ONE lane</b>, no matter how hard you swipe. Swipe again to move another lane.
          </p>
          <p className="text-xs text-slate-400">The road has 4 lanes. Dodge enemies, wrecks and bolts by switching lanes.</p>
        </div>
      </div>
    ),
  },
  {
    title: 'Swipe up: JUMP',
    render: () => (
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-4">
          <Hero>
            <Runner pose="jump" />
          </Hero>
          <div className="h-16 w-16 shrink-0">
            <SwipeHand dir="up" />
          </div>
        </div>
        <div className="text-center text-lg font-black text-white">
          Swipe <Chip tone="jump">UP</Chip> to jump over low obstacles
        </div>
        <div className="space-y-2">
          <Card tone="jump" icon={<CarIcon />} label="Wrecked cars" note="Clear them — or land on the roof." />
          <Card tone="jump" icon={<BarrierIcon />} label="Concrete & road barriers" note="Low walls and barriers: hop over." />
          <Card tone="jump" icon={<GapIcon />} label="Gaps in the road" note="Run up a ramp, jump at the very end. Jump again to grab ropes!" />
        </div>
      </div>
    ),
  },
  {
    title: 'Swipe down: SLIDE',
    render: () => (
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-4">
          <Hero>
            <Runner pose="slide" />
          </Hero>
          <div className="h-16 w-16 shrink-0">
            <SwipeHand dir="down" />
          </div>
        </div>
        <div className="text-center text-lg font-black text-white">
          Swipe <Chip tone="slide">DOWN</Chip> to slide / duck under high obstacles
        </div>
        <div className="space-y-2">
          <Card tone="slide" icon={<BillboardIcon />} label="Overhead billboards" note="Slide through underneath." />
          <Card tone="slide" icon={<ScaffoldIcon />} label="Blocked scaffolding" note="Duck under the frame." />
          <Card tone="slide" icon={<DroneIcon />} label="Low-flying alien drones" note="Slide under before they hit you." />
          <Card tone="slide" icon={<BulletsIcon />} label="Enemy bullets" note="Chest-high bolts pass over a slide." />
        </div>
      </div>
    ),
  },
  {
    title: 'Tap: SHOOT',
    render: () => (
      <div className="space-y-4">
        <Hero>
          <TapIcon />
        </Hero>
        <div className="space-y-2 text-center">
          <div className="text-lg font-black text-white">
            <Chip tone="shoot">TAP</Chip> the screen to shoot
          </div>
          <p className="text-sm text-slate-300">Each tap fires a burst. Hold the red SHOOT button for rapid fire, or switch AUTO on to fire for you.</p>
          <p className="text-xs text-slate-400">Aim-assist locks onto aliens, ships and barricades ahead of you. Grab ammo and weapons as you run.</p>
        </div>
      </div>
    ),
  },
  {
    title: 'Jump or slide?',
    render: () => (
      <div className="space-y-3">
        <p className="text-center text-sm text-slate-300">
          Rule of thumb: <b className="text-emerald-300">low = jump</b> &nbsp;·&nbsp; <b className="text-orange-300">high = slide</b>
        </p>
        <div className="rounded-2xl border border-emerald-500 bg-[#12201a] p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-7 w-7">
              <SwipeHand dir="up" />
            </div>
            <span className="text-base font-black text-emerald-300">JUMP OVER (low)</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <Mini icon={<CarIcon />} label="Wrecked car" />
            <Mini icon={<BarrierIcon />} label="Concrete barrier" />
            <Mini icon={<GapIcon />} label="Road gap" />
          </div>
        </div>
        <div className="rounded-2xl border border-orange-500 bg-[#241a12] p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-7 w-7">
              <SwipeHand dir="down" />
            </div>
            <span className="text-base font-black text-orange-300">SLIDE UNDER (high)</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Mini icon={<BillboardIcon />} label="Overhead billboard" />
            <Mini icon={<ScaffoldIcon />} label="Scaffolding" />
            <Mini icon={<DroneIcon />} label="Low alien drone" />
            <Mini icon={<BulletsIcon />} label="Bullets" />
          </div>
        </div>
        <p className="text-center text-xs text-slate-400">Burning cars, barricades and charging brutes can&apos;t be jumped — swipe to another lane.</p>
      </div>
    ),
  },
];

export default function Tutorial({ onDone, embedded = false }: { onDone?: () => void; embedded?: boolean }) {
  const [i, setI] = useState(0);
  const last = i === PAGES.length - 1;
  const page = PAGES[i];

  const body = (
    <>
      <div className="flex items-center justify-between border-b border-[#2a2a3c] bg-[#12121a] px-4 py-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-400">How to play · {i + 1}/{PAGES.length}</div>
          <h2 className="text-xl font-black uppercase tracking-wide text-white">{page.title}</h2>
        </div>
        {!embedded && onDone && (
          <button onClick={onDone} className="rounded-lg bg-[#242434] px-3 py-1.5 text-xs font-bold uppercase text-slate-300">
            Skip
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto bg-[#0d0d14] px-4 py-4">
        <div className="mx-auto max-w-md">{page.render()}</div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[#2a2a3c] bg-[#12121a] px-4 py-3">
        <button
          onClick={() => setI(Math.max(0, i - 1))}
          disabled={i === 0}
          className={cn('w-24 rounded-xl px-4 py-2.5 text-sm font-black uppercase', i === 0 ? 'bg-[#1a1a24] text-slate-600' : 'bg-[#242434] text-white')}
        >
          Back
        </button>
        <div className="flex gap-1.5">
          {PAGES.map((_, k) => (
            <button key={k} aria-label={`Page ${k + 1}`} onClick={() => setI(k)} className={cn('h-2.5 rounded-full', k === i ? 'w-6 bg-cyan-400' : 'w-2.5 bg-[#3a3a4c]')} />
          ))}
        </div>
        <button
          onClick={() => (last ? (onDone ? onDone() : setI(0)) : setI(i + 1))}
          className="w-24 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-black uppercase text-black"
        >
          {last ? (onDone ? 'Got it!' : 'Replay') : 'Next'}
        </button>
      </div>
    </>
  );

  if (embedded) return <div className="flex h-full min-h-[480px] flex-col overflow-hidden rounded-2xl border border-[#2f2f42]">{body}</div>;
  return <div className="fixed inset-0 z-[60] flex flex-col bg-[#0d0d14]">{body}</div>;
}
