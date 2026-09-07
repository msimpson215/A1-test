"use client";

import { AnimatePresence, motion } from "framer-motion";
import { dierbergsLayout } from "@/data/dierbergs-layout";
import AxonOrb from "./AxonOrb";

type Props = {
  active: boolean;
  onActivate: () => void;
};

export default function AxonNavControl({ active, onActivate }: Props) {
  const { axonNav } = dierbergsLayout;
  return (
    <div
      className="axon-nav"
      style={{
        left: axonNav.left,
        top: axonNav.top,
        width: axonNav.width,
        height: axonNav.height
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {active ? (
          <motion.div
            key="orb"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: [0.7, 1.12, 1] }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.38 }}
            className="axon-nav-orb-wrap"
          >
            <AxonOrb size={36} mood="resting" />
          </motion.div>
        ) : (
          <motion.button
            key="label"
            type="button"
            className="axon-nav-label"
            onClick={onActivate}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.32 }}
          >
            AXON AI
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
