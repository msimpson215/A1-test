"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { dierbergsLayout } from "@/data/dierbergs-layout";
import {
  bread,
  borden,
  cheddarProducts,
  milk,
  milkGallons,
  milkHalfGallons,
  staplesProducts,
  type DemoProduct
} from "@/data/dierbergs-demo-products";
import { asset } from "@/lib/asset-base";
import { parseRequest, type MilkVariety, type MilkVolume } from "@/lib/dierbergs-demo-intents";
import {
  browserName,
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
import DemoDiagnostics from "./DemoDiagnostics";
import FlyingCartItem from "./FlyingCartItem";
import type { OrbMood } from "./AxonOrb";

export type DemoPhase = "idle" | "active" | "adding";
export type MerchView = null | "milk" | "bread" | "staples" | "cheddars";

// Left on deliberately: this demo is driven on machines we cannot attach a
// debugger to, so the console is the only trace of where a run stopped.
// A microphone that reopens a beat early can catch the tail of the shopper's
// own confirmation. Anything that is mostly words we just said is not a request.
function echoesSelf(heard: string, spoken: string[]): boolean {
  const words = heard.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return spoken.some((line) => {
    const said = line.toLowerCase();
    const overlap = words.filter((w) => said.includes(w)).length;
    return overlap / words.length >= 0.8;
  });
}

function log(...parts: unknown[]) {
  if (typeof console !== "undefined") console.info("[Your Shopper]", ...parts);
}

const BUILD = process.env.NEXT_PUBLIC_BUILD_STAMP || "dev";

const WELCOME = "Welcome to Dierbergs. What would you like to shop for today?";
const SUBLINE =
  "I'm a conversational AI personal assistant, not a chatbot. Try \u201CI need milk,\u201D or ask how this works.";
// Rotated so a run of additions does not sound like a recording.
const FOLLOW_UPS = [
  "What else can I get you?",
  "Anything else today?",
  "What else is on the list?"
];

const SPOKEN_WELCOME =
  "Welcome to Dierbergs. I'm your conversational AI personal assistant, not a chatbot. What would you like to shop for today?";

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
  const [milkVolume, setMilkVolume] = useState<MilkVolume>("gallon");
  const [milkVariety, setMilkVariety] = useState<MilkVariety | null>(null);
  const [flight, setFlight] = useState<{ src: string; from: DOMRect; to: DOMRect } | null>(null);
  const [lastHeard, setLastHeard] = useState("");
  const [lastError, setLastError] = useState("");

  const cartRef = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<Record<string, HTMLImageElement | null>>({});
  const recRef = useRef<SpeechRecognition | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingAdd = useRef<DemoProduct | null>(null);
  const voiceAvailable = speechRecognitionAvailable();

  const axonOn = phase !== "idle";
  const cartIds = cart.map((p) => p.id);
  const cartTotalCents = cart.reduce((sum, p) => sum + p.priceCents, 0);
  const milkPool = milkVolume === "half gallon" ? milkHalfGallons : milkGallons;
  const milkShelf = milkVariety ? milkPool.filter((p) => p.variety === milkVariety) : milkPool;
  const merchProducts =
    view === "milk" ? milkShelf
    : view === "bread" ? [bread]
    : view === "cheddars" ? cheddarProducts
    : staplesProducts;
  // Milk and bread stay reachable as reminders once the grid pivots to cheddar.
  const alsoRequested = view === "cheddars" ? [milk, bread] : [];

  useEffect(() => {
    primeVoices();
    log("ready", { voiceRecognition: speechRecognitionAvailable(), userAgent: navigator.userAgent });
  }, []);

  // Depth-counted so a nested say() cannot drop the guard early. Whenever this
  // is above zero the microphone stays shut, which is what stops the shopper
  // hearing its own confirmation and treating it as a new request.
  const busyDepth = useRef(0);
  const enterBusy = useCallback(() => {
    busyDepth.current += 1;
    setBusy(true);
  }, []);
  const exitBusy = useCallback(() => {
    busyDepth.current = Math.max(0, busyDepth.current - 1);
    if (busyDepth.current === 0) setBusy(false);
  }, []);

  const spokenRecently = useRef<string[]>([]);

  const say = useCallback(
    async (line: string, sub?: string, spoken?: string) => {
      const words = spoken ?? line;
      enterBusy();
      setPrompt(line);
      if (sub !== undefined) setHint(sub);
      setMood("speaking");
      spokenRecently.current = [words, ...spokenRecently.current].slice(0, 4);
      try {
        await speak(words);
      } finally {
        setMood("resting");
        exitBusy();
      }
    },
    [enterBusy, exitBusy]
  );

  const setProductImage = useCallback((id: string, node: HTMLImageElement | null) => {
    imgRefs.current[id] = node;
  }, []);

  const addProduct = useCallback(
    async (product: DemoProduct) => {
      if (cartIds.includes(product.id)) {
        await say(
          `You've already got the ${product.shortName}.`,
          "Ask me for something else whenever you're ready."
        );
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
    const followUp = FOLLOW_UPS[next.length % FOLLOW_UPS.length];
    await say(
      `Got it \u2014 ${product.shortName} is in your cart.`,
      `${count}, $${(total / 100).toFixed(2)}. ${followUp}`,
      `Got it. ${product.shortName} is in your cart. ${followUp}`
    );
    setSelectedId(null);
  }, [cart, say]);

  const shelfFor = useCallback((variety: MilkVariety | null, volume: MilkVolume) => {
    const pool = volume === "half gallon" ? milkHalfGallons : milkGallons;
    return variety ? pool.filter((p) => p.variety === variety) : pool;
  }, []);

  const handleUtterance = useCallback(
    async (text: string) => {
      const req = parseRequest(text);
      const intent = req.intent;
      log("heard", JSON.stringify(text), "->", intent, req.variety ?? "", req.volume ?? "");
      setLastHeard(`${text} (${intent})`);
      setQuery(text);
      enterBusy();
      setMood("thinking");
      await new Promise((r) => setTimeout(r, 260));

      switch (intent) {
        case "SHOW_MILK": {
          const volume = req.volume ?? milkVolume;
          const variety = req.variety ?? null;
          const shelf = shelfFor(variety, volume);
          setMilkVolume(volume);
          setMilkVariety(variety);
          setView("milk");
          if (shelf.length === 1) {
            const only = shelf[0];
            setMerchHeading(`${only.name}.`);
            await say(
              `${only.shortName}, ${only.price}.`,
              "Say \u201Cadd it to my cart\u201D when you want it."
            );
          } else {
            setMerchHeading(volume === "gallon" ? "Our milk, by the gallon." : "Our milk, by the half gallon.");
            await say(
              "We carry four. Whole, two percent, one percent and skim. Which would you like?",
              volume === "gallon"
                ? "Name a kind \u2014 or ask for a half gallon."
                : "Name a kind \u2014 or ask for a gallon."
            );
          }
          break;
        }

        case "SHOW_BREAD":
          setView("bread");
          setMerchHeading("Here's the bread.");
          await say("Here's our bread.", "Say \u201Cadd it to my cart\u201D when you want it.");
          break;

        case "SHOW_STAPLES":
          setView("staples");
          setMerchHeading("Here are a few good matches.");
          await say("Sure. Here are a few good matches.", "Tell me which one to add.");
          break;

        case "SHOW_CHEDDARS":
          setView("cheddars");
          setMerchHeading("Here are four cheddar options.");
          await say("Here are four cheddar options.", "Milk and bread are still on your list.");
          break;

        case "ADD_CHEESE":
          if (!view) setView("cheddars");
          await addProduct(borden);
          break;

        case "ADD_MILK": {
          const volume = req.volume ?? milkVolume;
          const variety = req.variety ?? milkVariety;
          // A milk already on screen on its own is the one they mean, whether it
          // is on the shelf or sitting in the Also Requested column.
          const onShelf = [...merchProducts, ...alsoRequested].filter((p) => p.category === "milk");
          if (!variety && !req.volume && onShelf.length === 1) {
            await addProduct(onShelf[0]);
            break;
          }
          const shelf = shelfFor(variety, volume);
          setMilkVolume(volume);
          setView("milk");
          if (shelf.length === 1) {
            setMilkVariety(shelf[0].variety ?? null);
            await addProduct(shelf[0]);
          } else {
            // They asked for milk without saying which. Put the wall up and ask
            // rather than guessing on their behalf.
            setMilkVariety(null);
            setMerchHeading(volume === "gallon" ? "Our milk, by the gallon." : "Our milk, by the half gallon.");
            await say(
              "Happy to. Which one \u2014 whole, two percent, one percent or skim?",
              "Name a kind and I'll drop it in."
            );
          }
          break;
        }

        case "ADD_BREAD":
          if (!view) setView("bread");
          await addProduct(bread);
          break;

        // "add it to my cart" with nothing named: only actionable when one
        // product is on the shelf, otherwise it is a guess.
        case "ADD_CURRENT":
          if (merchProducts.length === 1 && view) {
            await addProduct(merchProducts[0]);
          } else if (view) {
            await say("Which one would you like?", "Name it and I'll add it.");
          } else {
            await say("Tell me what you're after first.", "Try: I need milk.");
          }
          break;

        case "HOW_IT_WORKS":
          await say(
            "Talk to the store the way you'd talk to a person.",
            "Ask for a grocery and the shelves change. Narrow it down, then say \u201Cadd it to my cart.\u201D",
            "Talk to the store the way you'd talk to a person. Ask for a grocery and the shelves change. Try: I need milk. Then narrow it down, like two percent, or a half gallon. When you're ready, say add it to my cart."
          );
          break;

        default:
          await say(
            "Let me point you somewhere useful.",
            "I can bring up milk, bread or cheddar right now \u2014 just say the word."
          );
      }

      // Clear only once the answer is out, so the shopper sees what was heard
      // while it is being handled, and a second request starts from empty.
      setQuery("");
      exitBusy();
      log("done", intent);
    },
    [addProduct, alsoRequested, enterBusy, exitBusy, merchProducts, milkVariety, milkVolume, say, shelfFor, view]
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
        if (echoesSelf(text, spokenRecently.current)) {
          log("ignored own voice", JSON.stringify(text));
          return;
        }
        void utteranceHandler.current(text);
      },
      onError: (kind) => {
        recRef.current = null;
        setListening(false);
        setVoiceMode(false);
        // Voice failing must never look like the shopper stopped working.
        const { line, hint: help } = describeSpeechError(kind);
        log("recognition error", kind);
        setLastError(kind);
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
    // One utterance, not two: cancelling a queued second line is unreliable, and
    // a shopper who interrupts the greeting must be listened to immediately.
    await say(WELCOME, SUBLINE, SPOKEN_WELCOME);
    // Start listening without being asked. Waiting on a microphone press reads
    // as the shopper greeting you and then ignoring you.
    if (voiceAvailable) {
      log("auto-listening after greeting");
      if (browserName() !== "Chrome") {
        setHint(`Listening. Voice is unreliable in ${browserName()} — if nothing happens, type below or use Chrome.`);
      }
      setVoiceMode(true);
    } else {
      setHint("This browser has no speech recognition. Type what you need below.");
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
    busyDepth.current = 0;
    setBusy(false);
    spokenRecently.current = [];
    setCart([]);
    setPulse(false);
    setSelectedId(null);
    setFlight(null);
    setMilkVolume("gallon");
    setMilkVariety(null);
    setLastHeard("");
    setLastError("");
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

      <DemoDiagnostics
        build={BUILD}
        state={listening ? "listening" : busy ? "thinking or speaking" : phase}
        lastHeard={lastHeard}
        lastError={lastError}
      />
    </div>
  );
}
