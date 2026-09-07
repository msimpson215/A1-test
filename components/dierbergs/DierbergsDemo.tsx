"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { dierbergsLayout } from "@/data/dierbergs-layout";
import {
  alsoRequestedProducts,
  borden,
  cheddarProducts,
  staplesProducts,
  type DemoProduct
} from "@/data/dierbergs-demo-products";
import { asset } from "@/lib/asset-base";
import { parseIntent } from "@/lib/dierbergs-demo-intents";
import { speak } from "@/lib/dierbergs-speech";
import DierbergsStaticBackground from "./DierbergsStaticBackground";
import AxonNavControl from "./AxonNavControl";
import AxonInteractionStrip from "./AxonInteractionStrip";
import AxonMerchandiseStage from "./AxonMerchandiseStage";
import AxonOrb from "./AxonOrb";
import DierbergsCartOverlay from "./DierbergsCartOverlay";
import FlyingCartItem from "./FlyingCartItem";
import type { OrbMood } from "./AxonOrb";

export type DemoState =
  | "idle"
  | "axonActive"
  | "staples"
  | "cheddars"
  | "adding"
  | "cartUpdated";

export default function DierbergsDemo() {
  const [state, setState] = useState<DemoState>("idle");
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState("Welcome to Dierbergs. How can I help you today?");
  const [mood, setMood] = useState<OrbMood>("resting");
  const [listening, setListening] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [cartTotalCents, setCartTotalCents] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flight, setFlight] = useState<{ src: string; from: DOMRect; to: DOMRect } | null>(null);

  const cartRef = useRef<HTMLDivElement>(null);
  const bordenImgRef = useRef<HTMLImageElement | null>(null);

  const axonOn = state !== "idle";
  const merchOn = state === "staples" || state === "cheddars" || state === "adding" || state === "cartUpdated";
  const merchMode = state === "cheddars" || state === "adding" || state === "cartUpdated" ? "cheddars" : merchOn ? "staples" : null;
  const merchProducts: DemoProduct[] = merchMode === "cheddars" ? cheddarProducts : staplesProducts;

  useEffect(() => {
    if (listening) setMood("listening");
    else if (mood === "listening") setMood("resting");
  }, [listening]);

  async function activate() {
    if (state !== "idle") return;
    setState("axonActive");
    setPrompt("Welcome to Dierbergs. How can I help you today?");
    setMood("speaking");
    await speak("Welcome to Dierbergs. How can I help you today? What can I find for you?");
    setMood("resting");
  }

  async function handleUtterance(text: string) {
    const intent = parseIntent(text);
    setQuery(text);
    setMood("thinking");
    await new Promise((r) => setTimeout(r, 280));

    if (intent === "REQUEST_STAPLES" && (state === "axonActive" || state === "staples" || state === "idle" || state === "cartUpdated")) {
      if (state === "idle") setState("axonActive");
      setPrompt("Sure. Here are a few good matches.");
      setState("staples");
      setMood("speaking");
      await speak("Sure. Here are a few good matches.");
      setMood("resting");
      return;
    }

    if (intent === "REQUEST_CHEDDARS" && (state === "staples" || state === "cheddars" || state === "axonActive")) {
      setPrompt("Here are four cheddar options.");
      setState("cheddars");
      setMood("speaking");
      await speak("Here are four cheddar options.");
      setMood("resting");
      return;
    }

    if (intent === "SELECT_BORDEN" && (state === "cheddars" || state === "staples" || state === "cartUpdated")) {
      addBorden();
      return;
    }

    setPrompt("For this demo, try asking me for milk, bread and cheese.");
    setMood("speaking");
    await speak("For this demo, try asking me for milk, bread and cheese.");
    setMood("resting");
  }

  function addBorden() {
    const img = bordenImgRef.current;
    const cart = cartRef.current;
    if (!img || !cart) return;
    setSelectedId(borden.id);
    setState("adding");
    setPrompt("Adding Borden Extra Sharp Cheddar.");
    setFlight({
      src: borden.image,
      from: img.getBoundingClientRect(),
      to: cart.getBoundingClientRect()
    });
  }

  function onFlightDone() {
    setFlight(null);
    setCartCount(1);
    setCartTotalCents(391);
    setPulse(true);
    setState("cartUpdated");
    setMood("resting");
    window.setTimeout(() => setPulse(false), 220);
  }

  function reset() {
    setState("idle");
    setQuery("");
    setPrompt("Welcome to Dierbergs. How can I help you today?");
    setMood("resting");
    setListening(false);
    setCartCount(0);
    setCartTotalCents(0);
    setPulse(false);
    setSelectedId(null);
    setFlight(null);
  }

  const { axonStrip, merchandiseStage, cartPatch } = dierbergsLayout;

  return (
    <div className="demo-page">
      <DierbergsStaticBackground src={asset("/dierbergs/dierbergs-storefront-full.png")} />

      <div className="axon-overlay">
        <AxonNavControl active={axonOn} onActivate={activate} />

        <div className="db-cart-patch" style={{ left: cartPatch.left, top: cartPatch.top, width: cartPatch.width, height: cartPatch.height }} />
        <div className="db-cart-slot" style={{ left: cartPatch.left, top: cartPatch.top, width: cartPatch.width, height: cartPatch.height }}>
          <DierbergsCartOverlay ref={cartRef} count={cartCount} totalCents={cartTotalCents} pulse={pulse} />
        </div>

        <AnimatePresence>
          {axonOn ? (
            <motion.div
              className="axon-strip-slot"
              style={{ left: axonStrip.left, top: axonStrip.top, width: axonStrip.width, height: axonStrip.height }}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32 }}
            >
              <div className="axon-strip-orb">
                <AxonOrb size={34} mood={mood} />
              </div>
              <AxonInteractionStrip
                prompt={prompt}
                hint={state === "axonActive" ? "What can I find for you?" : undefined}
                query={query}
                onQueryChange={setQuery}
                onSubmit={handleUtterance}
                onListeningChange={setListening}
                disabled={state === "adding"}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div
          className="axon-merch-slot"
          style={{
            left: merchandiseStage.left,
            top: merchandiseStage.top,
            width: merchandiseStage.width,
            height: merchandiseStage.height,
            pointerEvents: merchOn ? "auto" : "none"
          }}
        >
          <AxonMerchandiseStage
            visible={merchOn}
            mode={merchMode}
            heading={merchOn ? prompt : ""}
            products={merchProducts}
            alsoRequested={alsoRequestedProducts}
            selectedId={selectedId}
            onBordenImage={(node) => {
              bordenImgRef.current = node;
            }}
          />
        </div>
      </div>

      {flight ? (
        <FlyingCartItem src={flight.src} from={flight.from} to={flight.to} onComplete={onFlightDone} />
      ) : null}

      <button type="button" className="reset-demo" onClick={reset}>
        Reset Demo
      </button>
    </div>
  );
}
