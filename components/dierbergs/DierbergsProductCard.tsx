"use client";

import type { DemoProduct } from "@/data/dierbergs-demo-products";

type Props = {
  product: DemoProduct;
  selected?: boolean;
  imageRef?: (node: HTMLImageElement | null) => void;
};

export default function DierbergsProductCard({ product, selected, imageRef }: Props) {
  return (
    <article className={`db-card${selected ? " is-selected" : ""}`}>
      <div className="db-card-media">
        <button type="button" className="db-add" tabIndex={-1} aria-hidden="true">
          <span>+</span> Add
        </button>
        <img ref={imageRef} src={product.image} alt={product.name} />
      </div>
      <div className="db-price">{product.price}</div>
      <div className="db-name">{product.name}</div>
      <div className="db-size">{product.size}</div>
      <div className="db-aisle">
        <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1114.5 9 2.5 2.5 0 0112 11.5z"
          />
        </svg>
        {product.aisle}
      </div>
    </article>
  );
}
