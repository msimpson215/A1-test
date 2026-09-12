"use client";

import { specialPriceFor } from "@/data/dierbergs-catalogue";
import type { DemoProduct } from "@/data/dierbergs-demo-products";

type Props = {
  product: DemoProduct;
  selected?: boolean;
  inCart?: boolean;
  /** How many of this are in the cart, so a second one can be added. */
  cartCount?: number;
  imageRef?: (node: HTMLImageElement | null) => void;
  onAdd?: (product: DemoProduct) => void;
};

export default function DierbergsProductCard({
  product,
  selected,
  inCart,
  cartCount = 0,
  imageRef,
  onAdd
}: Props) {
  const deal = specialPriceFor(product.id);
  return (
    <article className={`db-card${selected ? " is-selected" : ""}${inCart ? " is-in-cart" : ""}`}>
      <div className="db-card-media">
        <img ref={imageRef} src={product.image} alt={product.name} />
        {inCart ? (
          <span className="db-in-cart-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 12.5l4.5 4.5L19 7"
              />
            </svg>
          </span>
        ) : null}
      </div>

      {deal ? (
        <div className="db-price">
          <span className="db-deal">{deal}</span>
          <span className="db-was">{product.price}</span>
          <span className="db-deal-flag">Special</span>
        </div>
      ) : (
        <div className="db-price">{product.price}</div>
      )}
      <div className="db-name">{product.name}</div>
      <div className="db-size">{product.size}</div>

      <div className="db-card-foot">
        <span className="db-aisle">
          <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1114.5 9 2.5 2.5 0 0112 11.5z"
            />
          </svg>
          {product.aisle}
        </span>
        {/* Never disabled. Wanting a second one of something is normal, and a
            dead button is what made two of anything impossible to ask for. */}
        <button
          type="button"
          className={`db-add${inCart ? " is-added" : ""}`}
          onClick={() => onAdd?.(product)}
          aria-label={cartCount ? `Add another ${product.name}` : `Add ${product.name}`}
        >
          {cartCount > 1 ? `${cartCount} in cart` : cartCount === 1 ? "In cart" : "+"}
        </button>
      </div>
    </article>
  );
}
