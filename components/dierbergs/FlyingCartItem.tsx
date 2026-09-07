"use client";

import { motion } from "framer-motion";

type Props = {
  src: string;
  from: DOMRect;
  to: DOMRect;
  onComplete: () => void;
};

export default function FlyingCartItem({ src, from, to, onComplete }: Props) {
  const startX = from.left;
  const startY = from.top;
  const endX = to.left + to.width / 2 - from.width * 0.18 / 2;
  const endY = to.top + to.height / 2 - from.height * 0.18 / 2;

  return (
    <motion.img
      className="flying-item"
      src={src}
      alt=""
      style={{ width: from.width, height: from.height }}
      initial={{ x: startX, y: startY, scale: 1, opacity: 1 }}
      animate={{ x: endX, y: endY, scale: 0.18, opacity: 0.2 }}
      transition={{ duration: 0.76, ease: [0.45, 0.05, 0.3, 1] }}
      onAnimationComplete={onComplete}
    />
  );
}
