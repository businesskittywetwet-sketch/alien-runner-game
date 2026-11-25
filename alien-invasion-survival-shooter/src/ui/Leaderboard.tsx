import { useEffect, useState } from 'react';
import { store } from '../game/progress';
import {
  championArchive, championSetFor, countdownText, qualifies, resetLocal, standings, tierLabel, weekIndex, type Row,
} from '../game/leaderboard';
import { cn } from '../utils/cn';

const CHAR_TINT: Record<string, string> = {
  rook: '#3b5b8a', vega: '#8a3b6b', titan: '#4a5a3a', nyx: '#111318', champ: '#6b4c00', champ2: '#14141c',
};
function Avatar({ char, name, big = false }: { char: string; name: string; big?: boolean }) {
  const tint = CHAR_TINT[char] ?? '#3b5b8a';
  return (
    <div
      className={cn('grid shrink-0 place-items-center rounded-full border border-white/20 font-black text-white', big ? 'h-14 w-14 text-lg' : 'h-9 w-9 text-sm')}
      style={{ background: `linear-gradient(135deg, ${tint}, #0b0b12)` }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function Podium({ rows }: { rows: Row[] }) {
  const styles = [
    { ring: 'border-amber-400', medal: '🥇', bg: 'bg-[#2a2210]', label: 'GOLD', rank: 1 },
    { ring: 'border-slate-300', medal: '🥈', bg: 'bg-[#23242c]', label: 'SILVER', rank: 2 },
    { ring: 'border-amber-600', medal: '🥉', bg: 'bg-[#241a12]', label: 'BRONZE', rank: 3 },
  ];
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {rows.map((r, i) => {
        const st = styles[i];
        return (
          <div key={r.rank} className={cn('relative rounded-2xl border-2 p-3 text-center', st.ring, st.bg, i === 0 && 'sm:-mt-1 sm:pb-5')}>
            {i === 0 && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-3 py-0.5 text-[10px] font-black tracking-widest text-black">
                ★ WEEKLY CHAMPION ★
              </div>
            )}
            <div className="mt-2 text-2xl">{st.medal}</div>
            <div className="flex items-center justify-center gap-2">
              <Avatar char={r.char} name={r.name} big={i === 0} />
            </div>
            <div className={cn('truncate font-black text-white', i === 0 ? 'text-lg' : 'text-sm')}>{r.name}</div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              #{r.rank} · {st.label}
            </div>
            <div className="text-xl font-black tabular-nums text-amber-300">{r.score.toLocaleString()}</div>
            <div className="text-[11px] text-slate-400">
              {r.dist.toLocaleString()} m · {r.kills} kills
            </div>
            <div className="mt-1 text-[11px] font-bold text-emerald-300">
              ◆ {r.bucks.toLocaleString()}
              {r.gems > 0 && <span className="ml-1 text-violet-300">💎 {r.gems}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Leaderboard() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const st = standings();
  const s = store.save;
  const week = weekIndex(now);
  const archive = championArchive();
  const champ = championSetFor(week);

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="rounded-2xl border border-[#34344a] bg-[#1a1a24] p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-black uppercase tracking-[0.12em] text-white">Global Leaderboard</div>
            <div className="text-[11px] text-slate-400">Week #{week} · Top 250 · resets {resetLocal(now)} (your time)</div>
          </div>
          <div className="rounded-lg border border-cyan-500 bg-[#0f2733] px-2 py-1 text-right">
            <div className="text-[9px] font-bold uppercase tracking-widest text-cyan-300">Ends in</div>
            <div className="text-sm font-black tabular-nums text-white">{countdownText(now)}</div>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#0d0d14]">
          <div className="h-full bg-cyan-400" style={{ width: `${100 - (new Date(now).getHours() / 168) * 0}` }} />
        </div>
      </div>

      {/* current champion content */}
      <div className="rounded-2xl border border-amber-500 bg-[#241c0c] p-3">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">This week&apos;s champion reward</div>
        <div className="text-sm font-bold text-white">
          {champ.name} character + matching skin — permanently unlocked by finishing #1, plus ◆ 50,000 and 💎 500.
        </div>
      </div>

      {/* top three */}
      <Podium rows={st.rows.slice(0, 3)} />

      {/* my ranking */}
      <div className={cn('rounded-2xl border p-3', st.qualifies ? 'border-cyan-500 bg-[#0f2030]' : 'border-[#34344a] bg-[#1a1a24]')}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Avatar char={s.eq.character} name={s.username} />
            <div>
              <div className="text-sm font-black text-white">{s.username}</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-400">My ranking</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-cyan-300">{st.myRank !== null ? `#${st.myRank}` : '—'}</div>
            <div className="text-[10px] text-slate-400">{st.myRank !== null ? `of ${st.total}+` : 'Not yet ranked'}</div>
          </div>
        </div>
        {st.qualifies ? (
          <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[11px] sm:grid-cols-4">
            <div className="rounded-lg bg-[#0d0d14] p-1.5">
              <div className="text-sm font-black tabular-nums text-amber-300">{st.myScore.toLocaleString()}</div>
              <div className="text-slate-400">Weekly score</div>
            </div>
            <div className="rounded-lg bg-[#0d0d14] p-1.5">
              <div className="text-sm font-black text-white">{st.myDist.toLocaleString()} m</div>
              <div className="text-slate-400">Distance</div>
            </div>
            <div className="rounded-lg bg-[#0d0d14] p-1.5">
              <div className="text-sm font-black text-white">{st.myKills}</div>
              <div className="text-slate-400">Kills</div>
            </div>
            <div className="rounded-lg bg-[#0d0d14] p-1.5">
              <div className="text-sm font-black text-emerald-300">{st.gapToNext > 0 ? st.gapToNext.toLocaleString() : '—'}</div>
              <div className="text-slate-400">Points to next rank</div>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-slate-400">
            Complete at least one qualifying run this week to be ranked. Minimum requirement: one finished run with a verified score.
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#0d0d14] px-2 py-1.5 text-[11px]">
          <span className="font-bold text-white">Estimated reward: {tierLabel(st.myRank)}</span>
          <span className="text-amber-300">
            ◆ {st.reward.bucks.toLocaleString()} {st.reward.gems > 0 && <span className="text-violet-300">· 💎 {st.reward.gems}</span>}
          </span>
        </div>
        {s.week.flagged && <div className="mt-2 rounded-lg bg-red-900 px-2 py-1.5 text-[11px] font-bold text-red-100">Score submissions under review — contact support to dispute.</div>}
      </div>

      {/* rankings */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-cyan-300">Rankings #1 – #250</h3>
          <span className="text-[10px] text-slate-400">score · distance · kills · reward</span>
        </div>
        <div className="max-h-[46vh] overflow-y-auto rounded-2xl border border-[#34344a] bg-[#1a1a24]">
          {st.rows.map((r) => (
            <div
              key={r.rank}
              className={cn(
                'flex items-center gap-2 border-b border-[#2a2a3c] px-2 py-1.5 last:border-b-0',
                r.you && 'bg-[#0f2f3a]',
                r.rank === 1 && 'bg-[#2a2210]',
                r.rank === 2 && 'bg-[#23242c]',
                r.rank === 3 && 'bg-[#241a12]',
              )}
            >
              <span
                className={cn(
                  'w-9 shrink-0 text-center text-sm font-black tabular-nums',
                  r.rank === 1 ? 'text-amber-300' : r.rank === 2 ? 'text-slate-200' : r.rank === 3 ? 'text-amber-600' : 'text-slate-400',
                )}
              >
                {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`}
              </span>
              <Avatar char={r.char} name={r.name} />
              <div className="min-w-0 flex-1">
                <div className={cn('truncate text-sm font-bold', r.you ? 'text-cyan-300' : 'text-white')}>
                  {r.name}
                  {r.you && <span className="ml-1 rounded bg-cyan-500 px-1 text-[9px] font-black text-black">YOU</span>}
                </div>
                <div className="text-[10px] text-slate-500">
                  {r.dist.toLocaleString()} m · {r.kills} kills
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black tabular-nums text-amber-300">{r.score.toLocaleString()}</div>
                <div className="text-[10px] font-bold text-emerald-300">◆ {r.bucks.toLocaleString()}</div>
              </div>
            </div>
          ))}
          {st.myRank !== null && st.myRank > 250 && (
            <div className="flex items-center gap-2 border-t-2 border-cyan-500 bg-[#0f2f3a] px-2 py-2">
              <span className="w-9 shrink-0 text-center text-sm font-black text-cyan-300">#{st.myRank}</span>
              <Avatar char={s.eq.character} name={s.username} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-cyan-300">{s.username} (you)</div>
                <div className="text-[10px] text-slate-500">
                  {st.myDist.toLocaleString()} m · {st.myKills} kills
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black tabular-nums text-amber-300">{st.myScore.toLocaleString()}</div>
                <div className="text-[10px] font-bold text-emerald-300">◆ {store.save.lboard.participation.toLocaleString()}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* rewards */}
      <div className="rounded-2xl border border-[#34344a] bg-[#1a1a24] p-3">
        <h3 className="mb-2 text-sm font-black uppercase tracking-widest text-amber-300">Weekly rewards</h3>
        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between rounded-lg bg-[#241c0c] px-2 py-1.5">
            <span className="font-black text-amber-200">#1 Grand Champion</span>
            <span className="font-bold text-amber-300">◆ 50,000 · 💎 500 · Champion character + skin</span>
          </div>
          {store.save.lboard.rewards.slice(1).map((b) => (
            <div key={b.min} className="flex justify-between rounded-lg bg-[#0d0d14] px-2 py-1.5">
              <span className="text-slate-300">
                {b.min === b.max ? `#${b.min}` : `#${b.min}–#${b.max}`}
              </span>
              <span className="font-bold text-amber-300">
                ◆ {b.bucks.toLocaleString()}
                {b.gems > 0 && <span className="ml-1 text-violet-300">· 💎 {b.gems}</span>}
              </span>
            </div>
          ))}
          <div className="flex justify-between rounded-lg bg-[#0d0d14] px-2 py-1.5">
            <span className="text-slate-300">Participation (outside top 250)</span>
            <span className="font-bold text-amber-300">◆ {store.save.lboard.participation.toLocaleString()}</span>
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-tight text-slate-500">
          Requires at least one completed qualifying run. Each player receives one placement reward and one participation reward per competition. Purchases never
          change your score — only distance, kills, bosses, ships, challenges and survival time do.
        </p>
      </div>

      {/* champion archive */}
      <div className="rounded-2xl border border-[#34344a] bg-[#1a1a24] p-3">
        <h3 className="mb-2 text-sm font-black uppercase tracking-widest text-violet-300">Champions archive</h3>
        {archive.length === 0 ? (
          <div className="text-[11px] text-slate-500">No completed competitions yet — the archive fills as weeks close.</div>
        ) : (
          <div className="space-y-1">
            {archive.map((a) => (
              <div key={a.week} className="flex items-center justify-between rounded-lg bg-[#0d0d14] px-2 py-1.5 text-[11px]">
                <span className={cn('font-bold', a.you ? 'text-amber-300' : 'text-slate-300')}>
                  {a.you ? '🏆 ' : ''}Week #{a.week} — {a.name}
                  {a.you && ' (you)'}
                </span>
                <span className="tabular-nums text-slate-400">{a.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[10px] leading-tight text-slate-500">
        Scores are validated and de-duplicated on submission, with impossible-stat detection and an audit trail for review. Offline build: rival competitors are
        simulated locally and scores are verified client-side; a production deployment posts each run to a server that re-derives the score before it counts.
      </p>
      {!qualifies() && <div className="text-[11px] text-slate-500">You are not ranked yet — finish a run to enter this week&apos;s competition.</div>}
    </div>
  );
}
