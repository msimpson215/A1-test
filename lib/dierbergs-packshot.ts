import { asset } from "./asset-base";

/**
 * Where a product's picture comes from.
 *
 * The store has forty thousand items and nobody is going to hand-name forty
 * thousand image files, so a packshot is not a field a person fills in: it is
 * the item number with a picture on the end of it. Add a row with a real SKU
 * and the tile has a photograph, with no design work and no code.
 *
 * Point PACKSHOT_BASE at the retailer's own image host and this demo is
 * reading their catalogue instead of ours, without a data change. Empty means
 * the mock packshots that ship with the demo.
 */
const base = process.env.NEXT_PUBLIC_PACKSHOT_BASE ?? "";

export function packshot(sku: string): string {
  return base ? `${base.replace(/\/$/, "")}/${sku}.png` : asset(`/dierbergs/products/${sku}.png`);
}

/** Said in the readout, because "where do the pictures come from" is the question. */
export function packshotSource(): string {
  return base ? `by item number from ${base}` : "by item number, from this demo's own";
}
