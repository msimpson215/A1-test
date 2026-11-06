"use client";

import { payCents, specialPriceFor } from "@/data/dierbergs-catalogue";
import type { DemoProduct } from "@/data/dierbergs-demo-products";

/**
 * The end of the shop.
 *
 * Until now the cart was a number in the corner and there was nowhere for a
 * conversation to finish. Somebody who has spent five minutes choosing milk
 * wants to see what they have chosen, what it costs, and then to say yes — and
 * the yes is the whole point of the demo, because a store is not buying a nicer
 * search box, it is buying completed baskets.
 *
 * The savings line matters more than it looks. The week's ad prices are already
 * being applied silently, so the total was simply lower than the shelf prices
 * added up and nothing said why. A shopper who cannot see the discount has not
 * been given it.
 */

type Line = {
  product: DemoProduct;
  count: number;
  /** Pence off, across the whole line, from the week's ad. */
  savedCents: number;
  paidCents: number;
};

export function linesFor(cart: DemoProduct[]): Line[] {
  const byId = new Map<string, Line>();
  for (const product of cart) {
    const held = byId.get(product.id);
    const saved = Math.max(0, product.priceCents - payCents(product));
    if (held) {
      held.count += 1;
      held.savedCents += saved;
      held.paidCents += payCents(product);
    } else {
      byId.set(product.id, {
        product,
        count: 1,
        savedCents: saved,
        paidCents: payCents(product)
      });
    }
  }
  return [...byId.values()];
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type Props = {
  cart: DemoProduct[];
  /** Set once they have said yes, which turns the receipt into an order. */
  orderNumber: string | null;
  onPlace: () => void;
};

export default function DierbergsCheckout({ cart, orderNumber, onPlace }: Props) {
  const lines = linesFor(cart);
  const paid = lines.reduce((sum, line) => sum + line.paidCents, 0);
  const saved = lines.reduce((sum, line) => sum + line.savedCents, 0);

  if (!lines.length) {
    return (
      <div className="db-checkout db-checkout-empty">
        <h2 className="db-checkout-title">Nothing to check out yet</h2>
        <p className="db-checkout-note">Ask me for a grocery and I&rsquo;ll put it on the shelf.</p>
      </div>
    );
  }

  return (
    <div className="db-checkout">
      <h2 className="db-checkout-title">
        {orderNumber ? "Order placed" : "Your order"}
      </h2>

      <ul className="db-checkout-lines">
        {lines.map((line) => (
          <li className="db-checkout-line" key={line.product.id}>
            <span className="db-checkout-qty">{line.count}</span>
            <span className="db-checkout-name">
              {line.product.name.replace(/\s+-\s+/g, ", ")}
              {specialPriceFor(line.product.id) ? (
                <em className="db-checkout-deal">on special</em>
              ) : null}
            </span>
            <span className="db-checkout-line-price">{money(line.paidCents)}</span>
          </li>
        ))}
      </ul>

      <div className="db-checkout-sums">
        {saved > 0 ? (
          <div className="db-checkout-sum db-checkout-saved">
            <span>Saved on this week&rsquo;s ad</span>
            <span>&minus;{money(saved)}</span>
          </div>
        ) : null}
        <div className="db-checkout-sum db-checkout-grand">
          <span>Total</span>
          <span>{money(paid)}</span>
        </div>
      </div>

      {orderNumber ? (
        <p className="db-checkout-note db-checkout-placed">
          Order {orderNumber} &middot; ready for pickup at 4000 Green Mount Crossing Drive
        </p>
      ) : (
        <>
          {/* Sayable and clickable both. Somebody being shown this for the first
              time reaches for the mouse, and a demo where the last step is only
              available by voice is a demo where the last step gets skipped. */}
          <button type="button" className="db-checkout-place" onClick={onPlace}>
            Okay, we&rsquo;ll take it &middot; {money(paid)}
          </button>
          <p className="db-checkout-note">Or just say &ldquo;okay, we&rsquo;ll take it&rdquo;.</p>
        </>
      )}
    </div>
  );
}
