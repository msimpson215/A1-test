"use client";

import { forwardRef } from "react";

type Props = {
  count: number;
  totalCents: number;
  pulse: boolean;
};

const DierbergsCartOverlay = forwardRef<HTMLDivElement, Props>(function DierbergsCartOverlay(
  { count, totalCents, pulse },
  ref
) {
  const dollars = `$${(totalCents / 100).toFixed(2)}`;
  const label = `${count} ${count === 1 ? "item" : "items"}`;
  return (
    <div className={`db-cart${pulse ? " is-pulse" : ""}`} ref={ref}>
      <svg className="db-cart-ico" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M7 6h14l-1.4 8.2a2 2 0 01-2 1.7H9.2a2 2 0 01-2-1.6L5.2 3H3v2h1.3L7 18.1A3 3 0 0010 20.5h8v-2h-8l-.3-1.5h8.6a3 3 0 002.9-2.5L24 4H7.4zM9 22.2a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8zm9 0a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8z"
        />
      </svg>
      <span className="db-cart-copy">
        <span className="db-cart-count">{label}</span>
        <span className="db-cart-total">{dollars}</span>
      </span>
    </div>
  );
});

export default DierbergsCartOverlay;
