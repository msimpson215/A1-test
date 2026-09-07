"use client";

import type { DemoProduct } from "@/data/dierbergs-demo-products";

type Props = {
  product: DemoProduct;
};

export default function RequestedItemMiniCard({ product }: Props) {
  return (
    <article className="db-mini">
      <img src={product.image} alt="" />
      <div>
        <div className="db-mini-name">{product.name}</div>
        <div className="db-mini-price">{product.price}</div>
      </div>
    </article>
  );
}
