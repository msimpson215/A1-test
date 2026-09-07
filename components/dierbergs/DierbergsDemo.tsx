"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { dierbergsLayout } from "@/data/dierbergs-layout";
import {
  bread,
  borden,
  cheddarProducts,
  milk,
  staplesProducts,
  type DemoProduct
} from "@/data/dierbergs-demo-products";
import { asset } from "@/lib/asset-base";
import { parseIntent } from "@/lib/dierbergs-demo-intents";
import {
  cancelSpeech,
  describeSpeechError,
  primeVoices,
  speak,
  speechRecognitionAvailable,
  startListening,
  stopListening
} from "@/lib/dierbergs-speech";
import DierbergsStaticBackground from "./DierbergsStaticBackground";
import AxonNavControl from "./AxonNavControl";
import AxonInteractionStrip from "./AxonInteractionStrip";
import AxonMerchandiseStage from "./AxonMerchandiseStage";
import DierbergsCartOverlay from "./DierbergsCartOverlay";
import FlyingCartItem from "./FlyingCartItem";
import type { OrbMood } from "./AxonOrb";

export type DemoPhase = "idle" | "active" | "adding";
export type MerchView = null | "staples" | "cheddars";

// Left on deliberately: this demo is driven on machines we cannot attach a
// debugger to, so the console is the only trace of where a run stopped.
function log(...parts: unknown[]) {
  if (typeof console !== "undefined") console.info("[Your Shopper]", ...parts);
}

const WELCOME = "Welcome to Dierbergs. How can I help you today?";
const SUBLINE =
  "Conversational AI, not a chatbot — ask for anything in the store and the shelves come to you.";

export default function DierbergsDemo() {
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const [view, setView] = useState<MerchView>(null);
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState(WELCOME);
  const [hint, setHint] = useState(SUBLINE);
  const [merchHeading, setMerchHeading] = useState("");
  const [mood, setMood] = useState<OrbMood>("resting");
  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cart, setCart] = useState<DemoProduct[]>([]);
  const [pulse, setPulse] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flight, setFlight] = useState<{ src: string; from: DOMRect; to: DOMRect } | null>(null);

  const cartRef = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<Record<string, HTMLImageElement | null>>({});
  const recRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingAdd = useRef<DemoProduct | null>(null);
  const voiceAvailable = speechRecognitionAvailable();

  const axonOn = phase !== "idle";
  const cartIds = cart.map((p) => p.id);
  const cartTotalCents = cart.reduce((sum, p) => sum + p.priceCents, 0);
  const merchProducts = view === "cheddars" ? cheddarProducts : staplesProducts;
  // Milk and bread stay reachable as reminders once the grid pivots to cheddar.
  const alsoRequested = view === "cheddars" ? [milk, bread] : [];

  useEffect(() => {
    primeVoices();
    log("ready", { voiceRecognition: speechRecognitionAvailable(), userAgent: navigator.userAgent });
  }, []);

  const say = useCallback(async (line: string, sub?: string, spoken?: string) => {
    setPrompt(line);
    if (sub !== undefined) setHint(sub);
    setMood("speaking");
    await speak(spoken ?? line);
    setMood("resting");
  }, []);

  const setProductImage = useCallback((id: string, node: HTMLImageElement | null) => {
    imgRefs.current[id] = node;
  }, []);

  const addProduct = useCallback(
    async (product: DemoProduct) => {
      if (cartIds.includes(product.id)) {
        await say(`${product.shortName} is already in your cart.`, SUBLINE);
        return;
      }
      const img = imgRefs.current[product.id];
      const cartEl = cartRef.current;
      if (!img || !cartEl) return;

      setSelectedId(product.id);
      setPhase("adding");
      setPrompt(`Adding ${product.shortName}.`);
      setHint("Watch the cart.");
      pendingAdd.current = product;
      setFlight({
        src: product.image,
        from: img.getBoundingClientRect(),
        to: cartEl.getBoundingClientRect()
      });
    },
    [cartIds, say]
  );

  const onFlightDone = useCallback(async () => {
    const product = pendingAdd.current;
    pendingAdd.current = null;
    setFlight(null);
    if (!product) return;

    const next = [...cart, product];
    setCart(next);
    setPulse(true);
    setPhase("active");
    window.setTimeout(() => setPulse(false), 240);

    const total = next.reduce((sum, p) => sum + p.priceCents, 0);
    const count = `${next.length} ${next.length === 1 ? "item" : "items"}`;
    await say(
      `${product.shortName} is in your cart.`,
      `Cart: ${count}, $${(total / 100).toFixed(2)}. Anything else?`
    );
    setSelectedId(null);
  }, [cart, say]);

  const handleUtterance = useCallback(
    async (text: string) => {
      const intent = parseIntent(text);
      log("heard", JSON.stringify(text), "->", intent);
      setQuery(text);
      setBusy(true);
      setMood("thinking");
      await new Promise((r) => setTimeout(r, 260));

      switch (intent) {
        case "REQUEST_STAPLES":
          setView("staples");
          setMerchHeading("Here are a few good matches.");
          await say("Sure. Here are a few good matches.", "Ask me to narrow it down, or say what to add.");
          break;

        case "REQUEST_CHEDDARS":
          setView("cheddars");
          setMerchHeading("Here are four cheddar options.");
          await say("Here are four cheddar options.", "Milk and bread are still on your list.");
          break;

        case "ADD_CHEESE":
          if (!view) setView("staples");
          await addProduct(borden);
          break;

        case "ADD_MILK":
          if (!view) setView("staples");
          await addProduct(milk);
          break;

        case "ADD_BREAD":
          if (!view) setView("staples");
          await addProduct(bread);
          break;

        case "CAPABILITIES":
          await say(
            "I'm a conversational shopper built into Dierbergs.",
            "Ask for groceries the way you'd ask a person — the aisles rearrange around you."
          );
          break;

        default:
          await say(
            "I didn't catch a grocery in that.",
            "Try: I need milk, bread and cheese."
          );
      }

      setBusy(false);
      log("done", intent);
    },
    [addProduct, say, view]
  );

  // Held in a ref so a state change mid-sentence cannot tear down and restart
  // the recogniser, which would swallow whatever the shopper was saying.
  const utteranceHandler = useRef(handleUtterance);
  useEffect(() => {
    utteranceHandler.current = handleUtterance;
  }, [handleUtterance]);

  // One microphone press opens a running conversation: listen, answer, listen
  // again, without making the shopper click between every request.
  useEffect(() => {
    if (!voiceMode || busy || phase === "adding") {
      stopListening(recRef.current);
      recRef.current = null;
      setListening(false);
      return;
    }

    log("listening");
    setListening(true);
    recRef.current = startListening({
      onInterim: (text) => setQuery(text),
      onFinal: (text) => {
        recRef.current = null;
        setListening(false);
        void utteranceHandler.current(text);
      },
      onError: (kind) => {
        recRef.current = null;
        setListening(false);
        setVoiceMode(false);
        // Voice failing must never look like the shopper stopped working.
        const { line, hint: help } = describeSpeechError(kind);
        log("recognition error", kind);
        setPrompt(line);
        setHint(help);
        inputRef.current?.focus();
      },
      onEnd: () => {
        recRef.current = null;
        setListening(false);
      }
    });

    return () => {
      stopListening(recRef.current);
      recRef.current = null;
    };
  }, [voiceMode, busy, phase]);

  useEffect(() => {
    if (listening) setMood("listening");
    else if (mood === "listening") setMood("resting");
  }, [listening, mood]);

  async function activate() {
    if (phase !== "idle") return;
    setPhase("active");
    setBusy(true);
    // One utterance, not two: cancelling a queued second line is unreliable, and
    // a shopper who interrupts the greeting must be listened to immediately.
    await say(
      WELCOME,
      SUBLINE,
      `${WELCOME} I'm a conversational shopper, so just tell me what you need.`
    );
    setBusy(false);
    // Start listening without being asked. Waiting on a microphone press reads
    // as the shopper greeting you and then ignoring you.
    if (voiceAvailable) {
      log("auto-listening after greeting");
      setVoiceMode(true);
    }
  }

  function toggleListen() {
    if (!voiceAvailable) return;
    cancelSpeech();
    setVoiceMode((on) => !on);
  }

  // Typing takes over from the microphone, so an open mic cannot inject room
  // noise into what is being written.
  function onQueryTyped(value: string) {
    if (voiceMode) {
      cancelSpeech();
      setVoiceMode(false);
    }
    setQuery(value);
  }

  function reset() {
    cancelSpeech();
    stopListening(recRef.current);
    recRef.current = null;
    pendingAdd.current = null;
    setPhase("idle");
    setView(null);
    setQuery("");
    setPrompt(WELCOME);
    setHint(SUBLINE);
    setMerchHeading("");
    setMood("resting");
    setVoiceMode(false);
    setListening(false);
    setBusy(false);
    setCart([]);
    setPulse(false);
    setSelectedId(null);
    setFlight(null);
  }

  const { axonStrip, stripFiller, merchandiseStage, cartPatch } = dierbergsLayout;

  return (
    <div className="demo-page">
      <DierbergsStaticBackground src={asset("/dierbergs/dierbergs-storefront-full.png")} />

      <div className="axon-overlay">
        <AxonNavControl active={axonOn} onActivate={activate} />

        <div className="db-cart-patch" style={{ left: cartPatch.left, top: cartPatch.top, width: cartPatch.width, height: cartPatch.height }} />
        <div className="db-cart-slot" style={{ left: cartPatch.left, top: cartPatch.top, width: cartPatch.width, height: cartPatch.height }}>
          <DierbergsCartOverlay ref={cartRef} count={cart.length} totalCents={cartTotalCents} pulse={pulse} />
        </div>

        <AnimatePresence>
          {axonOn ? (
            <>
              <motion.div
                key="strip"
                className="axon-strip-slot"
                style={{ left: axonStrip.left, top: axonStrip.top, width: axonStrip.width, height: axonStrip.height }}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.32 }}
              >
                <AxonInteractionStrip
                  prompt={prompt}
                  hint={hint}
                  mood={mood}
                  query={query}
                  listening={listening}
                  voiceAvailable={voiceAvailable}
                  inputRef={inputRef}
                  onQueryChange={onQueryTyped}
                  onSubmit={handleUtterance}
                  onToggleListen={toggleListen}
                  disabled={phase === "adding"}
                />
              </motion.div>
              <motion.div
                key="filler"
                className="axon-strip-filler"
                style={{ left: stripFiller.left, top: stripFiller.top, width: stripFiller.width, height: stripFiller.height }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.32 }}
              />
            </>
          ) : null}
        </AnimatePresence>

        <div
          className="axon-merch-slot"
          style={{
            left: merchandiseStage.left,
            top: merchandiseStage.top,
            width: merchandiseStage.width,
            height: merchandiseStage.height,
            pointerEvents: view ? "auto" : "none"
          }}
        >
          <AxonMerchandiseStage
            visible={view !== null}
            mode={view}
            heading={merchHeading}
            products={merchProducts}
            alsoRequested={alsoRequested}
            selectedId={selectedId}
            cartIds={cartIds}
            onProductImage={setProductImage}
            onAdd={(p) => void addProduct(p)}
          />
        </div>
      </div>

      {flight ? (
        <FlyingCartItem src={flight.src} from={flight.from} to={flight.to} onComplete={() => void onFlightDone()} />
      ) : null}

      <button type="button" className="reset-demo" onClick={reset}>
        Reset Demo
      </button>
    </div>
  );
}
