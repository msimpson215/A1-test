"use client";

import type { DemoProduct } from "@/data/dierbergs-demo-products";

type Props = {
  product: DemoProduct;
  selected?: boolean;
  inCart?: boolean;
  imageRef?: (node: HTMLImageElement | null) => void;
  onAdd?: (product: DemoProduct) => void;
};

export default function DierbergsProductCard({ product, selected, inCart, imageRef, onAdd }: Props) {
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

      <div className="db-price">{product.price}</div>
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
        <button
          type="button"
          className={`db-add${inCart ? " is-added" : ""}`}
          onClick={() => onAdd?.(product)}
          disabled={inCart}
          aria-label={inCart ? `${product.name} in cart` : `Add ${product.name}`}
        >
          {inCart ? "In cart" : "+"}
        </button>
      </div>
    </article>
  );
}
