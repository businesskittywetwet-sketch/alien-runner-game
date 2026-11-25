import { useState } from 'react';
import { store } from '../game/progress';
import { championArchive, rewardFor, standings, weekIndex } from '../game/leaderboard';
import { cn } from '../utils/cn';

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
const usd = (n: number) => `$${n.toFixed(2)}`;

function Kpi({ label, value, tone = 'plain' }: { label: string; value: string; tone?: 'plain' | 'good' | 'gem' }) {
  return (
    <div className="rounded-xl border border-[#34344a] bg-[#1a1a24] p-2.5">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
      <div className={cn('text-lg font-black tabular-nums', tone === 'good' ? 'text-emerald-300' : tone === 'gem' ? 'text-violet-300' : 'text-white')}>{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'number', step = '1' }: { label: string; value: string | number; onChange: (v: string) => void; type?: string; step?: string }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-[11px] text-slate-300">
      <span className="flex-1">{label}</span>
      <input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-28 rounded-md border border-[#3a3a4c] bg-[#0d0d14] px-2 py-1 text-right text-xs font-bold text-white"
      />
    </label>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className={cn('flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[11px] font-bold', on ? 'bg-[#123524] text-emerald-300' : 'bg-[#2a2a38] text-slate-400')}>
      {label}
      <span>{on ? 'ON' : 'OFF'}</span>
    </button>
  );
}

/** Owner-only administration console: monetization, economy, leaderboard ops. */
export default function Admin({ onExit }: { onExit: () => void }) {
  const [pass, setPass] = useState('');
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const save = () => {
    store.persist();
    setTick((x) => x + 1);
  };
  const s = store.save;

  if (!open) {
    return (
      <div className="mx-auto max-w-sm rounded-2xl border border-[#34344a] bg-[#1a1a24] p-5 text-center">
        <div className="text-lg font-black uppercase tracking-widest text-white">Administration</div>
        <p className="mt-1 text-[11px] text-slate-400">Authorized owner only. Enter the admin passcode.</p>
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="Passcode"
          className="mt-3 w-full rounded-lg border border-[#3a3a4c] bg-[#0d0d14] px-3 py-2 text-center font-bold text-white"
        />
        <button
          onClick={() => {
            if (pass === s.econ.adminPass) setOpen(true);
          }}
          className="mt-3 w-full rounded-xl bg-cyan-400 py-2.5 font-black uppercase text-black"
        >
          Unlock
        </button>
        <button onClick={onExit} className="mt-2 w-full rounded-xl bg-[#2a2a3c] py-2 font-bold uppercase text-white">
          Back
        </button>
      </div>
    );
  }

  const e = s.econ;
  const fee = (e.storeFeePct / 100) * s.rev.gross;
  const net = s.rev.gross - fee - s.rev.refunds;
  const adRev = s.ads.revenue;
  const st = standings();
  const byProduct = Object.entries(s.rev.byProduct).sort((a, b) => b[1].gross - a[1].gross);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-black uppercase tracking-widest text-cyan-300">Owner dashboard</div>
        <button onClick={onExit} className="rounded-lg bg-[#2a2a3c] px-3 py-1.5 text-xs font-bold uppercase text-white">
          Exit
        </button>
      </div>

      {/* advertising */}
      <section className="rounded-2xl border border-[#34344a] bg-[#1a1a24] p-3">
        <h3 className="mb-2 text-sm font-black uppercase tracking-widest text-amber-300">Advertising</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Banner impressions" value={fmt(s.ads.banner)} />
          <Kpi label="Interstitials" value={fmt(s.ads.interstitial)} />
          <Kpi label="Rewarded completed" value={fmt(s.ads.rewarded)} />
          <Kpi label="Est. ad revenue" value={usd(adRev)} tone="good" />
        </div>
        <div className="mt-2 text-[10px] text-slate-500">
          Revenue = impressions × configured eCPM (banner {e.ecpm.banner} / interstitial {e.ecpm.interstitial} / rewarded {e.ecpm.rewarded} per 1,000). Production builds
          pull real eCPM from the ad network / mediation dashboard.
        </div>
        <div className="mt-2 space-y-1">
          <Toggle label="Test advertisements (development)" on={e.testAds} onChange={(v) => { e.testAds = v; save(); }} />
          <Toggle label="Banner placement (menus)" on={e.placements.banner} onChange={(v) => { e.placements.banner = v; save(); }} />
          <Toggle label="Interstitial placement (results / menu)" on={e.placements.interstitial} onChange={(v) => { e.placements.interstitial = v; save(); }} />
          <Toggle label="Rewarded placement (opt-in)" on={e.placements.rewarded} onChange={(v) => { e.placements.rewarded = v; save(); }} />
          <Toggle label="Simulate declined transactions (test)" on={e.simulateFailures} onChange={(v) => { e.simulateFailures = v; save(); }} />
          <Field label="Interstitial gap (ms)" value={e.caps.interstitialGapMs} onChange={(v) => { e.caps.interstitialGapMs = +v; save(); }} />
          <Field label="Interstitials / 10 min" value={e.caps.interstitialMaxPer10Min} onChange={(v) => { e.caps.interstitialMaxPer10Min = +v; save(); }} />
          <Field label="Rewarded ads / day" value={e.caps.rewardedPerDay} onChange={(v) => { e.caps.rewardedPerDay = +v; save(); }} />
          <Field label="Store fee %" value={e.storeFeePct} onChange={(v) => { e.storeFeePct = +v; save(); }} />
          <Field label="Admin passcode" type="text" value={e.adminPass} onChange={(v) => { e.adminPass = v; save(); }} />
          <div className="rounded-lg bg-[#0d0d14] p-2 text-[10px] text-slate-400">
            Ad unit / publisher IDs: <span className="font-mono text-slate-300">{e.testAds ? 'ca-app-pub-3940256099942544 (TEST)' : 'ca-app-pub-XXXXXXXXXXXXXXXX'}</span> · mediation
            waterfall configured in the provider dashboard.
          </div>
        </div>
      </section>

      {/* purchases */}
      <section className="rounded-2xl border border-[#34344a] bg-[#1a1a24] p-3">
        <h3 className="mb-2 text-sm font-black uppercase tracking-widest text-emerald-300">Purchases & revenue</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Gross revenue" value={usd(s.rev.gross)} />
          <Kpi label={`Store fees (${e.storeFeePct}%)`} value={usd(fee)} />
          <Kpi label="Refunds" value={usd(s.rev.refunds)} />
          <Kpi label="Estimated net" value={usd(net)} tone="good" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Transactions" value={fmt(s.purchases.length)} />
          <Kpi label="Bucks purchased" value={fmt(s.purchases.filter((p) => p.kind === 'bucks').reduce((a, b) => a + b.amount, 0))} />
          <Kpi label="Gems purchased" value={fmt(s.purchases.filter((p) => p.kind === 'gems').reduce((a, b) => a + b.amount, 0))} tone="gem" />
          <Kpi label="No-Ads owned" value={s.noAds ? '1' : '0'} />
        </div>
        <div className="mt-2 space-y-1">
          {byProduct.map(([id, v]) => (
            <div key={id} className="flex justify-between rounded-lg bg-[#0d0d14] px-2 py-1 text-[11px]">
              <span className="text-slate-300">{id}</span>
              <span className="tabular-nums text-slate-400">
                {v.count} × {usd(v.gross / Math.max(1, v.count))} = <b className="text-emerald-300">{usd(v.gross)}</b>
              </span>
            </div>
          ))}
          {byProduct.length === 0 && <div className="text-[11px] text-slate-500">No transactions yet.</div>}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Outstanding Bucks" value={fmt(s.credits)} />
          <Kpi label="Outstanding Gems" value={fmt(s.gems)} tone="gem" />
          <Kpi label="Bucks spent in shop" value={fmt(s.spent.bucks)} />
          <Kpi label="Gems spent in shop" value={fmt(s.spent.gems)} tone="gem" />
        </div>
      </section>

      {/* currency packages */}
      <section className="rounded-2xl border border-[#34344a] bg-[#1a1a24] p-3">
        <h3 className="mb-2 text-sm font-black uppercase tracking-widest text-violet-300">Currency packages</h3>
        <div className="space-y-2">
          {e.packs.map((p) => (
            <div key={p.id} className="rounded-lg border border-[#2f2f42] bg-[#0d0d14] p-2">
              <div className="mb-1 flex items-center justify-between text-[11px] font-black text-white">
                <span>
                  {p.kind === 'bucks' ? '◆' : '💎'} {p.label} <span className="text-slate-500">({p.id})</span>
                </span>
                <span className={p.enabled ? 'text-emerald-300' : 'text-slate-500'}>{p.enabled ? 'ENABLED' : 'DISABLED'}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3">
                <Field label="Price USD" value={p.price} step="0.01" onChange={(v) => { p.price = +v; save(); }} />
                <Field label="Amount" value={p.amount} onChange={(v) => { p.amount = +v; save(); }} />
                <Field label="Bonus" value={p.bonus} onChange={(v) => { p.bonus = +v; save(); }} />
                <div className="flex items-center justify-end py-1">
                  <button onClick={() => { p.enabled = !p.enabled; save(); }} className={cn('rounded-md px-2 py-1 text-[10px] font-black', p.enabled ? 'bg-[#2a2a38] text-slate-300' : 'bg-emerald-600 text-white')}>
                    {p.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            </div>
          ))}
          <Field label="No-Ads price USD" value={e.noAdsPrice} step="0.01" onChange={(v) => { e.noAdsPrice = +v; save(); }} />
        </div>
      </section>

      {/* leaderboard ops */}
      <section className="rounded-2xl border border-[#34344a] bg-[#1a1a24] p-3">
        <h3 className="mb-2 text-sm font-black uppercase tracking-widest text-cyan-300">Leaderboard operations</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Current week" value={`#${weekIndex()}`} />
          <Kpi label="Participants" value={fmt(store.save.week.runs)} />
          <Kpi label="My rank" value={st.myRank ? `#${st.myRank}` : '—'} />
          <Kpi label="Submissions audited" value={fmt(s.audit.length)} />
        </div>
        <div className="mt-2 space-y-1">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Scoring weights</div>
          <Field label="Distance (per m)" value={s.lboard.weights.dist} step="0.1" onChange={(v) => { s.lboard.weights.dist = +v; save(); }} />
          <Field label="Kill" value={s.lboard.weights.kill} onChange={(v) => { s.lboard.weights.kill = +v; save(); }} />
          <Field label="Boss" value={s.lboard.weights.boss} onChange={(v) => { s.lboard.weights.boss = +v; save(); }} />
          <Field label="Ship" value={s.lboard.weights.ship} onChange={(v) => { s.lboard.weights.ship = +v; save(); }} />
          <Field label="Challenge" value={s.lboard.weights.challenge} onChange={(v) => { s.lboard.weights.challenge = +v; save(); }} />
          <Field label="Survival (per s)" value={s.lboard.weights.survival} onChange={(v) => { s.lboard.weights.survival = +v; save(); }} />
          <Field label="Participation reward" value={s.lboard.participation} onChange={(v) => { s.lboard.participation = +v; save(); }} />
        </div>
        <div className="mt-2 space-y-1">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reward bands</div>
          {s.lboard.rewards.map((b) => (
            <div key={b.min} className="grid grid-cols-4 gap-2">
              <Field label={`#${b.min}`} value={b.min} onChange={(v) => { b.min = +v; save(); }} />
              <Field label={`to #${b.max}`} value={b.max} onChange={(v) => { b.max = +v; save(); }} />
              <Field label="Bucks" value={b.bucks} onChange={(v) => { b.bucks = +v; save(); }} />
              <Field label="Gems" value={b.gems} onChange={(v) => { b.gems = +v; save(); }} />
              <div className="col-span-4 text-[10px] text-slate-500">Example: rank {b.min} pays ◆ {rewardFor(b.min).bucks.toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => {
              if (confirm('Mark this week\'s score submissions as flagged (disqualify)?')) {
                s.week.flagged = true;
                save();
              }
            }}
            className="rounded-lg bg-red-800 px-3 py-2 text-[11px] font-black uppercase text-white"
          >
            Disqualify my week
          </button>
          <button
            onClick={() => {
              if (confirm('Clear audit log?')) {
                s.audit = [];
                save();
              }
            }}
            className="rounded-lg bg-[#2a2a3c] px-3 py-2 text-[11px] font-black uppercase text-white"
          >
            Clear audit
          </button>
        </div>
        <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
          {s.audit.slice(0, 20).map((a) => (
            <div key={a.runId + a.ts} className="flex items-center justify-between rounded bg-[#0d0d14] px-2 py-1 text-[10px]">
              <span className={a.verdict === 'accepted' ? 'text-emerald-300' : 'text-red-300'}>
                {a.verdict.toUpperCase()} · {new Date(a.ts).toLocaleTimeString()}
              </span>
              <span className="truncate px-2 text-slate-400">{a.detail}</span>
              <span className="tabular-nums text-slate-300">{a.score.toLocaleString()}</span>
            </div>
          ))}
          {s.audit.length === 0 && <div className="text-[11px] text-slate-500">No submissions yet.</div>}
        </div>
      </section>

      {/* history */}
      <section className="rounded-2xl border border-[#34344a] bg-[#1a1a24] p-3">
        <h3 className="mb-2 text-sm font-black uppercase tracking-widest text-amber-300">Results & champions</h3>
        <div className="space-y-1 text-[11px]">
          {s.weekHistory.slice(0, 12).map((h) => (
            <div key={h.week} className="flex justify-between rounded-lg bg-[#0d0d14] px-2 py-1.5">
              <span className="text-slate-300">
                Week #{h.week} — rank #{h.rank > 900 ? 'outside 250' : h.rank}
              </span>
              <span className="tabular-nums text-slate-400">
                {h.score.toLocaleString()} · <b className="text-amber-300">◆ {h.bucks.toLocaleString()}</b> {h.gems > 0 && <b className="text-violet-300">💎 {h.gems}</b>}
              </span>
            </div>
          ))}
          {s.weekHistory.length === 0 && <div className="text-slate-500">No settled competitions yet.</div>}
        </div>
        <div className="mt-2 space-y-1 text-[11px]">
          {championArchive().map((c) => (
            <div key={c.week} className="flex justify-between rounded-lg bg-[#241c0c] px-2 py-1.5">
              <span className="font-bold text-amber-200">🏆 Week #{c.week}: {c.name}</span>
              <span className="tabular-nums text-slate-400">{c.score.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>

      <button
        onClick={() => {
          if (confirm('Factory reset ALL local progress, currency and purchases?')) {
            localStorage.clear();
            location.reload();
          }
        }}
        className="w-full rounded-xl border border-red-800 bg-[#2a1216] py-2.5 text-xs font-black uppercase text-red-300"
      >
        Factory reset account data
      </button>
    </div>
  );
}
