"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { DemoProduct } from "@/data/dierbergs-demo-products";
import DierbergsProductCard from "./DierbergsProductCard";
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
  onProductImage: (id: string, node: HTMLImageElement | null) => void;
  onAdd: (product: DemoProduct) => void;
};

export default function AxonMerchandiseStage({
  visible,
  mode,
  heading,
  products,
  alsoRequested,
  selectedId,
  cartIds,
  onProductImage,
  onAdd
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
            {heading ? <h2 className="merch-heading">{heading}</h2> : null}
            <div className={`merch-grid merch-grid-${products.length >= 4 ? "cheddars" : "staples"}`}>
              {products.map((p, i) => (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.36, delay: i * 0.05 }}
                >
                  <DierbergsProductCard
                    product={p}
                    selected={selectedId === p.id}
                    inCart={cartIds.includes(p.id)}
                    imageRef={(node) => onProductImage(p.id, node)}
                    onAdd={onAdd}
                  />
                </motion.div>
              ))}
            </div>
          </div>

          <AnimatePresence>
            {showAside ? (
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
