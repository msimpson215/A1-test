/**
 * What the conversation added that a search box would not have.
 *
 * The cost of spoken minutes is easy to measure and easy for a retailer to
 * object to. The answer to the objection is not a cheaper model, it is the
 * other side of the ledger: the items that went into the basket because Axon
 * offered them — the special it mentioned, the cheese it noticed was missing
 * from the taco night — rather than because the shopper came in asking.
 *
 * Axon says which is which as it adds things, so this is attribution rather
 * than inference. It is the number a store will actually want to see, and the
 * one that decides whether voice is a cost centre or a merchandising channel.
 */

/*
 * Gross margin on grocery, roughly, for turning suggested revenue into
 * suggested profit. Real figures vary by department — produce and prepared
 * foods run well above this, centre-store staples below — so a live deployment
 * would take it per item from the store's own data instead.
 */
export const GROSS_MARGIN = 0.25;

export type Lift = {
  /** Items Axon offered that the shopper took. */
  items: number;
  /** What those items are worth at the price being charged. */
  cents: number;
  /** Gross profit on them, at the assumed margin. */
  profit: number;
  /** Voice cost so far, for the comparison that matters. */
  spent: number;
  /** Gross profit on suggestions, less what the conversation cost. */
  net: number;
  /** How many times over the suggestions covered the conversation. */
  ratio: number;
};

export function liftFrom(suggestedCents: number, items: number, spentDollars: number): Lift {
  const profit = (suggestedCents / 100) * GROSS_MARGIN;
  return {
    items,
    cents: suggestedCents,
    profit,
    spent: spentDollars,
    net: profit - spentDollars,
    ratio: spentDollars > 0 ? profit / spentDollars : 0
  };
}
