"use client";

import { motion } from "framer-motion";
import { dierbergsLayout } from "@/data/dierbergs-layout";

type Props = {
  active: boolean;
  onActivate: () => void;
};

export default function AxonNavControl({ active, onActivate }: Props) {
  const { shopperNav } = dierbergsLayout;
  return (
    <div
      className="shopper-nav"
      style={{
        left: shopperNav.left,
        top: shopperNav.top,
        width: shopperNav.width,
        height: shopperNav.height
      }}
    >
      <motion.button
        type="button"
        className={`shopper-nav-pill${active ? " is-active" : ""}`}
        onClick={onActivate}
        animate={active ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={{ duration: 0.36 }}
      >
        <svg className="shopper-nav-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7 18a2 2 0 102 2 2 2 0 00-2-2zm10 0a2 2 0 102 2 2 2 0 00-2-2zM6.2 6l1.6 7.2a1 1 0 001 .8h8.6a1 1 0 001-.76L20 7.5H7.4l-.3-1.3A1 1 0 006.1 5.4H3.5v1.4z"
          />
        </svg>
        Your Shopper
      </motion.button>
    </div>
  );
}
