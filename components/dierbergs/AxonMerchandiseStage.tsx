"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { DemoProduct } from "@/data/dierbergs-demo-products";
import DierbergsProductCard from "./DierbergsProductCard";
import DierbergsCheckout from "./DierbergsCheckout";
import RequestedItemMiniCard from "./RequestedItemMiniCard";
import type { MerchView } from "./DierbergsDemo";

type Props = {
  visible: boolean;
  mode: MerchView;
  heading: string;
  products: DemoProduct[];
  alsoRequested: DemoProduct[];
  selectedId: string | null;
  cartIds: string[];
  /** The cart itself, for the checkout view, where the cart is the subject. */
  cart: DemoProduct[];
  orderNumber: string | null;
  onProductImage: (id: string, node: HTMLImageElement | null) => void;
  onAdd: (product: DemoProduct) => void;
  onPlaceOrder: () => void;
};

export default function AxonMerchandiseStage({
  visible,
  mode,
  heading,
  products,
  alsoRequested,
  selectedId,
  cartIds,
  cart,
  orderNumber,
  onProductImage,
  onAdd,
  onPlaceOrder
}: Props) {
  const showAside = alsoRequested.length > 0;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="axon-merch"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.38 }}
        >
          <div className="merch-main">
            {mode === "checkout" ? (
              <DierbergsCheckout cart={cart} orderNumber={orderNumber} onPlace={onPlaceOrder} />
            ) : (
              <>
            {heading ? <h2 className="merch-heading">{heading}</h2> : null}
            {/* A whole aisle is a different shape of thing from a chosen few.
                Twenty-two cartons in the four-wide grid is six rows of scrolling
                to find the one they meant, which is worse than the shelf that
                only ever showed two. */}
            <div
              className={`merch-grid merch-grid-${
                products.length >= 13
                  ? "wall"
                  : products.length >= 5
                    ? "spread"
                    : products.length >= 4
                      ? "cheddars"
                      : "staples"
              }`}
            >
              {products.map((p, i) => (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  // A full aisle staggered at a twentieth of a second each takes
                  // over a second to finish arriving. Faster, and capped, so the
                  // last carton is not still landing when they start talking.
                  transition={{ duration: 0.3, delay: Math.min(i, 12) * (products.length >= 13 ? 0.02 : 0.05) }}
                >
                  <DierbergsProductCard
                    product={p}
                    selected={selectedId === p.id}
                    inCart={cartIds.includes(p.id)}
                    cartCount={cartIds.filter((id) => id === p.id).length}
                    imageRef={(node) => onProductImage(p.id, node)}
                    onAdd={onAdd}
                  />
                </motion.div>
              ))}
            </div>
              </>
            )}
          </div>

          <AnimatePresence>
            {showAside && mode !== "checkout" ? (
              <motion.aside
                className="also-requested"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.44 }}
              >
                <div className="also-kicker">Also Requested</div>
                {alsoRequested.map((p) => (
                  <RequestedItemMiniCard
                    key={p.id}
                    product={p}
                    shortName={p.shortName}
                    inCart={cartIds.includes(p.id)}
                    imageRef={(node) => onProductImage(p.id, node)}
                    onAdd={onAdd}
                  />
                ))}
              </motion.aside>
            ) : null}
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
