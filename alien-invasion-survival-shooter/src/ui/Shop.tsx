import { useState } from 'react';
import type { Game } from '../game/game';
import { CATALOG, WEAPONS, type UnlockKind } from '../game/config';
import { store } from '../game/progress';
import { Ads, buyPremium, NO_ADS_ID, Payments, REWARDED, grantRewarded } from '../game/economy';
import { cn } from '../utils/cn';

type Section = 'featured' | 'bucks' | 'gems' | 'weapons' | 'ship' | 'characters' | 'skins' | 'equipment' | 'noads';

const SECTIONS: [Section, string][] = [
  ['featured', '⭐ Featured'],
  ['bucks', '◆ Alien Bucks'],
  ['gems', '💎 Alien Gems'],
  ['weapons', 'Weapons'],
  ['ship', '🚀 Spacecraft'],
  ['characters', 'Characters'],
  ['skins', 'Skins'],
  ['equipment', 'Equipment'],
  ['noads', 'No Ads'],
];

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function Balances() {
  const s = store.save;
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-[#6b5512] bg-[#1d1a10] px-3 py-2">
        <span className="text-amber-300">◆</span>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Alien Bucks</div>
          <div className="text-lg font-black tabular-nums text-amber-300">{s.credits.toLocaleString()}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-[#6b3de0] bg-[#1a1330] px-3 py-2">
        <span className="text-violet-300">💎</span>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Alien Gems</div>
          <div className="text-lg font-black tabular-nums text-violet-300">{s.gems.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

/** Confirmation that always shows the exact price before charging. */
function Confirm({ state, onCancel, onOk }: { state: { title: string; body: string; price: string; productId: string } | null; onCancel: () => void; onOk: () => void }) {
  if (!state) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#05050a] p-4">
      <div className="w-full max-w-sm space-y-3 rounded-2xl border border-[#34344a] bg-[#1a1a24] p-5">
        <div className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">Confirm purchase</div>
        <div className="text-xl font-black text-white">{state.title}</div>
        <p className="text-sm text-slate-300">{state.body}</p>
        <div className="rounded-xl border border-[#6b3de0] bg-[#1a1330] p-3 text-center">
          <div className="text-[10px] uppercase tracking-widest text-slate-400">You will be charged</div>
          <div className="text-2xl font-black text-violet-200">{state.price}</div>
        </div>
        <p className="text-[10px] leading-tight text-slate-500">
          Paid via your app store account. Alien Gems and currency packs are consumable; No Ads is a one-time non-consumable purchase. No card data is stored by this game.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="rounded-xl bg-[#2a2a38] py-3 font-bold uppercase text-white">
            Cancel
          </button>
          <button onClick={onOk} className="rounded-xl bg-violet-500 py-3 font-black uppercase text-white">
            Buy now
          </button>
        </div>
      </div>
    </div>
  );
}

function PackGrid({ kind, onBuy }: { kind: 'bucks' | 'gems'; onBuy: (id: string) => void }) {
  const packs = store.save.econ.packs.filter((p) => p.kind === kind && p.enabled);
  const best = Math.max(...packs.map((p) => (p.amount + p.bonus) / p.price));
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {packs.map((p) => {
        const total = p.amount + p.bonus;
        const per = total / p.price;
        const isBest = per >= best - 0.001;
        return (
          <button
            key={p.id}
            onClick={() => onBuy(p.id)}
            className={cn(
              'relative flex flex-col items-center gap-1 rounded-xl border p-3 text-center active:scale-[0.98]',
              kind === 'bucks' ? 'border-[#6b5512] bg-[#1d1a10]' : 'border-[#6b3de0] bg-[#1a1330]',
            )}
          >
            {isBest && <span className="absolute -top-2 right-2 rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-black text-black">BEST VALUE</span>}
            <div className={cn('text-2xl font-black tabular-nums', kind === 'bucks' ? 'text-amber-300' : 'text-violet-300')}>
              {kind === 'bucks' ? '◆' : '💎'} {total.toLocaleString()}
            </div>
            {p.bonus > 0 && <div className="text-[10px] font-bold text-emerald-300">+{p.bonus.toLocaleString()} bonus</div>}
            <div className="text-[10px] text-slate-400">{p.label}</div>
            <div className="mt-1 rounded-lg bg-white text-sm font-black text-black">{money(p.price)}</div>
            <div className="text-[9px] text-slate-500">{Math.round(per).toLocaleString()} per $1</div>
          </button>
        );
      })}
    </div>
  );
}

function ItemRow({ item, onRefresh, onConfirm }: { item: (typeof CATALOG)[number]; onRefresh: () => void; onConfirm: (t: { title: string; body: string; price: string; productId: string }) => void }) {
  const s = store.save;
  const owned = store.owns(item.id);
  const bucksPrice = item.cost;
  const gemPrice = item.gems;
  const rewardOnly = bucksPrice < 0 && gemPrice <= 0;
  const wdef = item.kind === 'weapon' ? WEAPONS[item.id as keyof typeof WEAPONS] : null;
  const affordB = bucksPrice > 0 && s.credits >= bucksPrice;
  const affordG = gemPrice > 0 && s.gems >= gemPrice;
  const equipped = (['character', 'outfit', 'skin', 'drone', 'env', 'weapon'] as UnlockKind[]).includes(item.kind)
    ? (s.eq as Record<string, string>)[item.kind === 'weapon' ? 'weapon' : item.kind] === item.id
    : false;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#34344a] bg-[#1a1a24] p-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-extrabold text-white">{item.name}</span>
          {rewardOnly && <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[9px] font-black">REWARD</span>}
          {gemPrice > 0 && <span className="rounded bg-[#3a1f6e] px-1.5 py-0.5 text-[9px] font-black text-violet-200">PREMIUM</span>}
        </div>
        <div className="text-[11px] leading-tight text-slate-400">{item.desc}</div>
        {wdef && (
          <div className="text-[10px] font-bold text-amber-300">
            DMG {wdef.dmg}
            {wdef.pellets > 1 ? `×${wdef.pellets}` : ''} · {wdef.rate}/s · MAG {wdef.mag}
          </div>
        )}
      </div>
      {owned ? (
        <span className="rounded-lg bg-[#123524] px-3 py-1.5 text-xs font-black text-emerald-300">OWNED</span>
      ) : rewardOnly ? (
        <span className="rounded-lg bg-[#2a2a38] px-3 py-1.5 text-[10px] font-black text-slate-400">EARN IN EVENTS</span>
      ) : gemPrice > 0 ? (
        <button
          disabled={!affordG}
          onClick={() => {
            const r = buyPremium(item.id, gemPrice);
            if (r.ok) onRefresh();
            else alert(r.reason);
          }}
          className={cn('rounded-lg px-3 py-1.5 text-xs font-black', affordG ? 'bg-violet-500 text-white' : 'bg-[#2a2a38] text-slate-500')}
        >
          💎 {gemPrice}
        </button>
      ) : (
        <button
          disabled={!affordB}
          onClick={() =>
            onConfirm({
              title: item.name,
              body: `Unlock permanently with Alien Bucks.`,
              price: `◆ ${bucksPrice.toLocaleString()} Alien Bucks`,
              productId: `item:${item.id}`,
            })
          }
          className={cn('rounded-lg px-3 py-1.5 text-xs font-black', affordB ? 'bg-amber-400 text-black' : 'bg-[#2a2a38] text-slate-500')}
        >
          ◆ {bucksPrice.toLocaleString()}
        </button>
      )}
      {!owned && !rewardOnly && item.kind !== 'weapon' && equipped && null}
    </div>
  );
}

export default function Shop({ game, refresh }: { game: Game; refresh: () => void }) {
  const [sec, setSec] = useState<Section>('featured');
  const [confirm, setConfirm] = useState<{ title: string; body: string; price: string; productId: string } | null>(null);
  const [, setTick] = useState(0);
  const redraw = () => {
    setTick((x) => x + 1);
    refresh();
  };

  const buy = async (productId: string) => {
    const pack = store.save.econ.packs.find((p) => p.id === productId);
    const price = pack ? `$${pack.price.toFixed(2)} USD` : `$${store.save.econ.noAdsPrice.toFixed(2)} USD`;
    setConfirm({
      title: pack ? `${pack.label} — ${pack.kind === 'bucks' ? '◆' : '💎'} ${(pack.amount + pack.bonus).toLocaleString()}` : 'No Ads (permanent)',
      body: pack
        ? `Adds ${(pack.amount + pack.bonus).toLocaleString()} ${pack.kind === 'bucks' ? 'Alien Bucks' : 'Alien Gems'} to your account${pack.bonus ? ` (includes +${pack.bonus.toLocaleString()} bonus)` : ''}.`
        : 'Removes banner and interstitial ads forever. One-time purchase, never a subscription.',
      price,
      productId,
    });
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const id = confirm.productId;
    setConfirm(null);
    if (id.startsWith('item:')) {
      const itemId = id.slice(5);
      const item = CATALOG.find((c) => c.id === itemId)!;
      if (!store.spendBucks(item.cost)) return alert('Not enough Alien Bucks.');
      store.save.owned.push(itemId);
      store.persist();
      game.audio.buy();
      redraw();
      return;
    }
    const r = await Payments.buy(id);
    if (!r.ok) {
      game.audio.hurt();
      alert(r.reason ?? 'Purchase failed.');
      return;
    }
    game.audio.buy();
    game.toast(r.kind === 'noads' ? 'No Ads unlocked — permanently!' : `Purchased +${r.amount?.toLocaleString()} ${r.kind === 'gems' ? 'Alien Gems' : 'Alien Bucks'}!`, 'good');
    redraw();
  };

  const restore = async () => {
    const r = await Payments.restore();
    game.audio.ui();
    alert(r.note);
    redraw();
  };

  const featured = CATALOG.filter((c) => c.gems > 0 || c.id === 'eq_medkit' || c.id === 'eq_armor' || c.id === 'vega').slice(0, 6);
  const listFor = (k: UnlockKind) => CATALOG.filter((c) => c.kind === k && (c.cost >= 0 || c.gems > 0));

  return (
    <div className="space-y-3">
      <Balances />
      <div className="flex flex-wrap gap-1.5">
        {SECTIONS.map(([id, label]) => (
          <button key={id} onClick={() => setSec(id)} className={cn('rounded-full px-3 py-1.5 text-xs font-bold', sec === id ? 'bg-cyan-400 text-black' : 'bg-[#242434] text-slate-300')}>
            {label}
          </button>
        ))}
      </div>

      {(sec === 'bucks' || sec === 'gems') && (
        <div className="space-y-2">
          <div className={cn('rounded-xl border p-3 text-sm', sec === 'bucks' ? 'border-[#6b5512] bg-[#1d1a10] text-amber-100' : 'border-[#6b3de0] bg-[#1a1330] text-violet-100')}>
            {sec === 'bucks'
              ? '◆ Alien Bucks are the standard currency — earned in runs and challenges, and purchasable here.'
              : '💎 Alien Gems are premium currency bought with real money. They unlock exclusive weapons, characters, skins and equipment.'}
          </div>
          <PackGrid kind={sec} onBuy={buy} />
        </div>
      )}

      {sec === 'featured' && (
        <div className="space-y-3">
          <button onClick={() => setSec('noads')} className="flex w-full items-center justify-between rounded-xl border border-emerald-500 bg-[#12251c] p-3 text-left">
            <div>
              <div className="text-sm font-black text-white">No Ads — permanent</div>
              <div className="text-[11px] text-slate-400">Remove every banner and interstitial, forever. Not a subscription.</div>
            </div>
            <span className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-black text-black">${store.save.econ.noAdsPrice.toFixed(2)}</span>
          </button>
          <div className="grid gap-2 sm:grid-cols-2">
            {featured.map((it) => (
              <ItemRow key={it.id} item={it} onRefresh={redraw} onConfirm={setConfirm} />
            ))}
          </div>
          <div className="rounded-xl border border-[#34344a] bg-[#1a1a24] p-3">
            <div className="mb-2 text-sm font-black uppercase tracking-wider text-cyan-300">Watch & earn (optional ads)</div>
            <p className="mb-2 text-[11px] text-slate-400">
              Voluntary rewarded ads. {Ads.rewardedLeft()} left today. Watching never affects gameplay mid-run.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {REWARDED.filter((r) => r.id === 'bucks').map((r) => (
                <button
                  key={r.id}
                  disabled={!Ads.rewardedAvailable()}
                  onClick={() => {
                    if (!Ads.rewardedAvailable()) return;
                    const g = grantRewarded(r.id);
                    if (g.ok) game.toast(`Ad complete — ${g.text}`, 'good');
                    else game.toast(g.reason ?? 'Unavailable', 'bad');
                    redraw();
                  }}
                  className="rounded-xl border border-[#34344a] bg-[#242434] p-2.5 text-left text-sm font-bold text-white disabled:text-slate-500"
                >
                  ▶ {r.label}
                  <div className="text-[10px] font-normal text-slate-400">{r.detail}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {sec === 'weapons' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {listFor('weapon').map((it) => (
            <ItemRow key={it.id} item={it} onRefresh={redraw} onConfirm={setConfirm} />
          ))}
        </div>
      )}
      {sec === 'ship' && (
        <div className="space-y-2">
          <div className="rounded-xl border border-cyan-600 bg-[#0f2733] p-3 text-sm text-cyan-100">
            🚀 Upgrades for the aerial fighter: extra laser modes, plasma and charged cannons, a bigger missile rack and a tougher hull. They apply automatically the next time you board a spacecraft.
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {listFor('ship').map((it) => (
              <ItemRow key={it.id} item={it} onRefresh={redraw} onConfirm={setConfirm} />
            ))}
          </div>
        </div>
      )}
      {sec === 'characters' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {listFor('character').map((it) => (
            <ItemRow key={it.id} item={it} onRefresh={redraw} onConfirm={setConfirm} />
          ))}
        </div>
      )}
      {sec === 'skins' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {[...listFor('skin'), ...listFor('outfit'), ...listFor('drone'), ...listFor('env')].map((it) => (
            <ItemRow key={it.kind + it.id} item={it} onRefresh={redraw} onConfirm={setConfirm} />
          ))}
        </div>
      )}
      {sec === 'equipment' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {[...listFor('equipment'), ...listFor('ability')].map((it) => (
            <ItemRow key={it.kind + it.id} item={it} onRefresh={redraw} onConfirm={setConfirm} />
          ))}
        </div>
      )}

      {sec === 'noads' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-500 bg-[#12251c] p-4">
            <div className="text-lg font-black text-white">No Ads — {money(store.save.econ.noAdsPrice)}</div>
            <p className="mt-1 text-sm text-slate-300">
              Permanently removes banner and interstitial advertisements on every device using this account. One-time purchase, never a subscription. Rewarded ads stay
              optional if you want the bonus.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                disabled={store.save.noAds}
                onClick={() => buy(NO_ADS_ID)}
                className={cn('flex-1 rounded-xl py-3 font-black uppercase', store.save.noAds ? 'bg-[#2a2a38] text-emerald-400' : 'bg-emerald-500 text-black')}
              >
                {store.save.noAds ? '✓ Owned' : `Buy — ${money(store.save.econ.noAdsPrice)}`}
              </button>
              <button onClick={restore} className="rounded-xl bg-[#2a2a3c] px-4 py-3 font-bold uppercase text-white">
                Restore
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-[#34344a] bg-[#1a1a24] p-3 text-[11px] text-slate-400">
            Purchases are validated with the app store before currency is credited, receipts are stored once-only to prevent duplicate credit, and balances are saved to
            your account between sessions. This build uses a simulated store sandbox for development.
          </div>
        </div>
      )}

      <Confirm state={confirm} onCancel={() => setConfirm(null)} onOk={runConfirm} />
      <p className="text-[10px] text-slate-500">Prices in USD. Currency packs are consumable; No Ads is a permanent non-consumable. Purchases never affect leaderboard scores.</p>
      {Ads.bannerAllowed() && <div className="mt-2 rounded-lg border border-[#34344a] bg-[#14141c] p-2 text-center text-[10px] uppercase tracking-widest text-slate-500">Ad · banner 320×50</div>}
    </div>
  );
}
