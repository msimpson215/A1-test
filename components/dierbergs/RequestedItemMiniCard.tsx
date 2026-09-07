"use client";

import type { DemoProduct } from "@/data/dierbergs-demo-products";

type Props = {
  product: DemoProduct;
  shortName: string;
  inCart?: boolean;
  imageRef?: (node: HTMLImageElement | null) => void;
  onAdd?: (product: DemoProduct) => void;
};

export default function RequestedItemMiniCard({ product, shortName, inCart, imageRef, onAdd }: Props) {
  return (
    <article className={`db-mini${inCart ? " is-in-cart" : ""}`}>
      <img ref={imageRef} src={product.image} alt="" />
      <div className="db-mini-copy">
        <div className="db-mini-name">{shortName}</div>
        <div className="db-mini-price">{product.price}</div>
      </div>
      <button
        type="button"
        className={`db-mini-add${inCart ? " is-added" : ""}`}
        onClick={() => onAdd?.(product)}
        disabled={inCart}
        aria-label={inCart ? `${product.name} in cart` : `Add ${product.name}`}
      >
        {inCart ? (
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 12.5l4.5 4.5L19 7"
            />
          </svg>
        ) : (
          "+"
        )}
      </button>
    </article>
  );
}
