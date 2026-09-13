import { GROSS_MARGIN } from "./dierbergs-lift";

/**
 * Who pays for the talking.
 *
 * Brands already pay grocers for placement — the endcap, the feature in the
 * weekly ad, the shelf tag. A voice assistant that mentions a brand at the
 * moment someone is deciding is that same placement, except it can be settled
 * per unit actually sold instead of per week of shelf space, because the
 * conversation knows which items it suggested and which of those were taken.
 *
 * So the bill goes to the brand, not the shopper and not the store: a small
 * referral on each suggested unit that the shopper took. The store's own cost of
 * running the conversation is covered out of that, and what is left over is
 * theirs. The aim is a store that pays nothing and comes out ahead.
 *
 * Store brands have no third party to bill, but they do not need one: private
 * label carries a fatter margin, so a suggested store brand pays for itself out
 * of the extra margin the store keeps. Either way nobody is out of pocket.
 */

/** Share of the shelf price a brand pays for a unit it was referred. */
export const REFERRAL_RATE = 0.08;
/** Floor, so a cheap item is still worth settling. */
export const REFERRAL_MIN = 0.15;
/** Margin on private label, which runs well above the national-brand average. */
export const PRIVATE_LABEL_MARGIN = 0.35;

/*
 * Brands the store owns, and so cannot invoice. Dierbergs' own labels, plus
 * Essential Everyday, which is private label rather than a national brand.
 * A live deployment would take this from the store's own item file, where
 * private label is already flagged.
 */
const STORE_BRANDS = ["dierbergs", "dierbergs bakehouse", "essential everyday"];

export function isStoreBrand(brand: string | undefined): boolean {
  return STORE_BRANDS.includes((brand ?? "").trim().toLowerCase());
}

/** What a brand owes for one referred unit at this shelf price. */
export function referralFor(cents: number): number {
  return Math.max(REFERRAL_MIN, (cents / 100) * REFERRAL_RATE);
}

export type SuggestedUnit = { brand?: string; cents: number };

export type Ledger = {
  /** Units suggested and taken. */
  units: number;
  /** Of those, the ones with a brand behind them to invoice. */
  billable: number;
  /** What those brands owe, all in. */
  brandOwes: number;
  /** Gross margin the store keeps on everything suggested. */
  storeMargin: number;
  /** What the conversation cost to run. */
  voiceCost: number;
  /** Margin plus referrals, less the conversation. */
  storeNet: number;
  /** Did third parties cover the whole cost of running the voice line? */
  coversIt: boolean;
};

export function ledgerFrom(units: SuggestedUnit[], voiceCost: number): Ledger {
  let brandOwes = 0;
  let storeMargin = 0;
  let billable = 0;
  for (const unit of units) {
    const store = isStoreBrand(unit.brand);
    storeMargin += (unit.cents / 100) * (store ? PRIVATE_LABEL_MARGIN : GROSS_MARGIN);
    if (!store) {
      billable += 1;
      brandOwes += referralFor(unit.cents);
    }
  }
  return {
    units: units.length,
    billable,
    brandOwes,
    storeMargin,
    voiceCost,
    storeNet: storeMargin + brandOwes - voiceCost,
    coversIt: brandOwes >= voiceCost
  };
}

/**
 * How many referred units it takes before the brands have paid for the
 * conversation outright — the number that decides whether a store can be told
 * this costs them nothing.
 */
export function unitsToCover(voiceCost: number, typicalCents = 429): number {
  const per = referralFor(typicalCents);
  return per > 0 ? Math.ceil(voiceCost / per) : Infinity;
}
