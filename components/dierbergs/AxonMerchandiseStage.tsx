"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { DemoProduct } from "@/data/dierbergs-demo-products";
import DierbergsProductCard from "./DierbergsProductCard";
import RequestedItemMiniCard from "./RequestedItemMiniCard";

type Props = {
  visible: boolean;
  mode: "staples" | "cheddars" | null;
  products: DemoProduct[];
  alsoRequested: DemoProduct[];
  selectedId: string | null;
  onBordenImage: (node: HTMLImageElement | null) => void;
};

export default function AxonMerchandiseStage({
  visible,
  mode,
  products,
  alsoRequested,
  selectedId,
  onBordenImage
}: Props) {
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
          {mode === "cheddars" ? (
            <motion.aside
              className="also-requested"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.42 }}
            >
              <div className="also-kicker">Also requested</div>
              {alsoRequested.map((p) => (
                <RequestedItemMiniCard key={p.id} product={p} />
              ))}
            </motion.aside>
          ) : null}

          <div className={`merch-grid merch-grid-${mode || "staples"}`}>
            {products.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.36, delay: i * 0.04 }}
              >
                <DierbergsProductCard
                  product={p}
                  selected={selectedId === p.id}
                  imageRef={p.id === "borden-extra-sharp" ? onBordenImage : undefined}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
