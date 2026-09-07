"use client";

import { motion } from "framer-motion";

export type OrbMood = "resting" | "listening" | "thinking" | "speaking";

type Props = {
  size?: number;
  mood?: OrbMood;
};

export default function AxonOrb({ size = 38, mood = "resting" }: Props) {
  return (
    <span className={`axon-orb mood-${mood}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="axon-orb-core" />
      {mood === "listening" ? (
        <motion.span
          className="axon-orb-ring"
          initial={{ opacity: 0.55, scale: 0.92 }}
          animate={{ opacity: [0.5, 0], scale: [0.92, 1.28] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
        />
      ) : null}
    </span>
  );
}
