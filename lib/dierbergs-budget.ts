import { spendReport } from "./dierbergs-spend";

/**
 * How much talking a basket has earned.
 *
 * Spoken minutes cost real money, and an open microphone is an open tab: a
 * shopper filling a three hundred dollar order is worth talking to for twenty
 * minutes, and someone with nothing in their cart at minute ten is not. So the
 * allowance starts small and grows with the basket, which is what makes the
 * running cost a line item a store can be quoted rather than an unbounded risk
 * they have to trust us about.
 *
 * It is a quote, and nothing here enforces it.
 *
 * It used to. The demo closed the live line when the basket had not earned
 * enough talking, and an empty cart earns about ninety seconds — so anybody
 * genuinely testing the thing, asking what the milk is like and changing their
 * mind twice, got hung up on mid-thought and moved to typing. From the outside
 * that is indistinguishable from the live model failing, which meant the meter
 * was making the demo lie about the product it exists to show. Metering is an
 * argument to have with a buyer, on paper, once they want it.
 */

/** Dollars of voice granted before anything is in the cart. */
export const BASE_ALLOWANCE = 0.35;
/*
 * Dollars of voice earned per dollar of groceries in the cart.
 *
 * This is the dial, and it is a commercial decision rather than a technical
 * one. Two per cent of a hundred dollar basket is about two dollars, which is
 * roughly the entire net margin on that basket — so this does not pay for
 * itself out of margin, and was never going to. What it is cheap against is
 * what the store already spends on the same order: the pickup fee they already
 * charge, and the picker's time it saves. Turn this down and the conversation
 * moves to typing sooner; turn it up and the store carries more of the cost.
 */
export const SHARE_OF_BASKET = 0.02;
/** No basket buys more than this, so one session cannot run away. */
export const CEILING = 6;
/** Fraction of the allowance at which the shopper would be given a heads-up. */
export const WARN_AT = 0.75;

export function allowanceFor(cartCents: number): number {
  const earned = BASE_ALLOWANCE + (Math.max(0, cartCents) / 100) * SHARE_OF_BASKET;
  return Math.min(CEILING, earned);
}

export type BudgetVerdict = "fine" | "warn" | "spent";

export function verdictFor(spentDollars: number, cartCents: number): BudgetVerdict {
  const allowance = allowanceFor(cartCents);
  if (spentDollars >= allowance) return "spent";
  if (spentDollars >= allowance * WARN_AT) return "warn";
  return "fine";
}

/** Dollars of talking left, never below zero. */
export function leftFor(spentDollars: number, cartCents: number): number {
  return Math.max(0, allowanceFor(cartCents) - spentDollars);
}

/** The live reading: what this session has spent against what it has earned. */
export function budgetNow(cartCents: number): {
  spent: number;
  allowance: number;
  left: number;
  verdict: BudgetVerdict;
} {
  const spent = spendReport().dollars;
  return {
    spent,
    allowance: allowanceFor(cartCents),
    left: leftFor(spent, cartCents),
    verdict: verdictFor(spent, cartCents)
  };
}
