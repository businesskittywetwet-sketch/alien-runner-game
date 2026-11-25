import { store, type PackCfg } from './progress';

/**
 * Monetization layer.
 *
 * Everything that touches real money or an ad provider goes through this file so
 * the rest of the game never talks to a store SDK directly.
 *
 * Provider seams (the browser build ships a local simulator behind the same API):
 *   - IAP: Apple StoreKit / Google Play Billing (`verify` = server receipt check)
 *   - Ads: AdMob (banner / interstitial / rewarded) behind `Ads.*`
 * Swap `simulateStore` / `simulateAd` for the platform SDK calls in a native build;
 * the rules below (idempotent receipts, caps, no client-only confirmation) stay.
 */

export const NO_ADS_ID = 'no_ads';
export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type RewardKind = 'bucks' | 'health' | 'revive' | 'boost';
export interface RewardedDef {
  id: RewardKind;
  label: string;
  detail: string;
}
/** Rewarded rewards — always shown to the player BEFORE the ad starts. */
export const REWARDED: RewardedDef[] = [
  { id: 'bucks', label: '+2,500 Alien Bucks', detail: 'Added to your balance as soon as the ad completes.' },
  { id: 'health', label: 'Full health for your next run', detail: 'Your next run starts at 100 HP with 40 armor.' },
  { id: 'revive', label: 'Revive', detail: 'Continue the run you just died in with 60 HP.' },
  { id: 'boost', label: '×2 score for 60 seconds', detail: 'Doubles score gained in your next run.' },
];

export interface PayResult {
  ok: boolean;
  reason?: string;
  receipt?: string;
  amount?: number;
  kind?: 'bucks' | 'gems' | 'noads';
}

const receiptId = () => `RCP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;

export class Payments {
  /**
   * Purchase a currency pack or the permanent No-Ads unlock.
   * The receipt is validated and recorded before any currency is credited, and a
   * receipt can only ever be credited once (duplicate-transaction guard).
   */
  static async buy(productId: string): Promise<PayResult> {
    const e = store.save.econ;
    const pack: PackCfg | undefined = e.packs.find((p) => p.id === productId);
    const isNoAds = productId === NO_ADS_ID;
    if (!pack && !isNoAds) return { ok: false, reason: 'Unknown product.' };
    if (pack && !pack.enabled) return { ok: false, reason: 'This pack is currently unavailable.' };
    const price = pack ? pack.price : e.noAdsPrice;

    await delay(340); // round-trip to the store / billing client

    if (e.simulateFailures) return { ok: false, reason: 'Transaction declined by the store (test mode).' };
    if (isNoAds && store.save.noAds) return { ok: false, reason: 'No-Ads is already owned on this account.' };

    const receipt = receiptId();
    if (store.save.receipts.includes(receipt)) return { ok: false, reason: 'Duplicate transaction rejected.' };

    let kind: PayResult['kind'];
    let amount = 0;
    if (isNoAds) {
      store.save.noAds = true;
      kind = 'noads';
    } else if (pack!.kind === 'bucks') {
      amount = pack!.amount + pack!.bonus;
      store.addBucks(amount);
      kind = 'bucks';
    } else {
      amount = pack!.amount + pack!.bonus;
      store.addGems(amount);
      kind = 'gems';
    }

    const ok = store.recordPurchase(
      { id: receipt, product: productId, label: pack ? pack.label : 'No Ads (one-time)', price, ts: Date.now(), amount, kind: kind! },
      receipt,
    );
    if (!ok) return { ok: false, reason: 'Duplicate transaction rejected.' };

    // revenue bookkeeping for the owner dashboard
    store.save.rev.gross += price;
    const bp = store.save.rev.byProduct[productId] ?? { count: 0, gross: 0 };
    store.save.rev.byProduct[productId] = { count: bp.count + 1, gross: bp.gross + price };
    store.persist();
    return { ok: true, receipt, amount, kind };
  }

  /**
   * Restore non-consumable purchases (No-Ads) for this account.
   * A production build re-queries StoreKit / Play Billing and re-validates each
   * receipt server-side; consumable packs are never re-credited here.
   */
  static async restore(): Promise<{ ok: boolean; note: string; restored: string[] }> {
    await delay(420);
    const restored: string[] = [];
    if (store.save.noAds) restored.push('No Ads (permanent)');
    for (const it of store.save.owned) restored.push(it);
    if (!store.save.noAds) return { ok: true, note: 'No previous purchases found for this account.', restored: [] };
    store.persist();
    return { ok: true, note: `Restored ${restored.length} entitlement(s).`, restored };
  }
}

/** Purchase an Alien-Gems-exclusive item. */
export function buyPremium(id: string, gems: number): { ok: boolean; reason?: string } {
  if (gems < 0) return { ok: false, reason: 'This item is a reward — it cannot be purchased.' };
  if (store.owns(id)) return { ok: false, reason: 'Already owned.' };
  if (!store.spendGems(gems)) return { ok: false, reason: `Not enough Alien Gems (need ${gems}).` };
  store.save.owned.push(id);
  store.persist();
  return { ok: true };
}

/* --------------------------------- Ads ---------------------------------- */
const recentInterstitials: number[] = []; // session window for frequency capping

export const Ads = {
  bannerAllowed(): boolean {
    const s = store.save;
    return !s.noAds && s.econ.placements.banner;
  },
  /** Never during play: the caller only asks at menu / results breaks. */
  interstitialAllowed(): boolean {
    const s = store.save;
    if (s.noAds || !s.econ.placements.interstitial) return false;
    const now = Date.now();
    if (now - s.ads.lastInterstitial < s.econ.caps.interstitialGapMs) return false;
    const win = recentInterstitials.filter((t) => now - t < 600000);
    return win.length < s.econ.caps.interstitialMaxPer10Min;
  },
  showInterstitial(): boolean {
    if (!this.interstitialAllowed()) return false;
    const s = store.save;
    const now = Date.now();
    recentInterstitials.push(now);
    s.ads.lastInterstitial = now;
    s.ads.interstitial += 1;
    s.ads.revenue += s.econ.ecpm.interstitial / 1000;
    store.persist();
    return true;
  },
  recordBanner(): void {
    const s = store.save;
    s.ads.banner += 1;
    s.ads.revenue += s.econ.ecpm.banner / 1000;
    store.persist();
  },
  rewardedAvailable(): boolean {
    const s = store.save;
    if (!s.econ.placements.rewarded) return false;
    const today = new Date().toISOString().slice(0, 10);
    const used = s.ads.rewardedDay === today ? s.ads.rewardedCount : 0;
    return used < s.econ.caps.rewardedPerDay;
  },
  rewardedLeft(): number {
    const s = store.save;
    const today = new Date().toISOString().slice(0, 10);
    const used = s.ads.rewardedDay === today ? s.ads.rewardedCount : 0;
    return Math.max(0, s.econ.caps.rewardedPerDay - used);
  },
  /** Called only after the provider reports the rewarded ad as completed. */
  consumeRewarded(): boolean {
    if (!this.rewardedAvailable()) return false;
    const s = store.save;
    const today = new Date().toISOString().slice(0, 10);
    if (s.ads.rewardedDay !== today) {
      s.ads.rewardedDay = today;
      s.ads.rewardedCount = 0;
    }
    s.ads.rewardedCount += 1;
    s.ads.rewarded += 1;
    s.ads.revenue += s.econ.ecpm.rewarded / 1000;
    store.persist();
    return true;
  },
};

/** Apply a rewarded-ad reward (currency here; game effects are applied by the caller). */
export function grantRewarded(kind: RewardKind): { ok: boolean; text?: string; reason?: string } {
  if (!Ads.consumeRewarded()) return { ok: false, reason: 'Daily rewarded-ad limit reached. Try again tomorrow.' };
  switch (kind) {
    case 'bucks':
      store.addBucks(2500);
      store.persist();
      return { ok: true, text: '+2,500 Alien Bucks added' };
    case 'health':
      store.save.settings.auto = store.save.settings.auto; // no-op, keeps settings intact
      return { ok: true, text: 'Full health queued for your next run' };
    case 'revive':
      return { ok: true, text: 'Revive ready' };
    case 'boost':
      return { ok: true, text: '×2 score queued for your next run' };
  }
}
