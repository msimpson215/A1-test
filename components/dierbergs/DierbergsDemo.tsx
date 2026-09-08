"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { dierbergsLayout } from "@/data/dierbergs-layout";
import { staplesProducts, type DemoProduct } from "@/data/dierbergs-demo-products";
import { narrowShelf, shelfById, shelves, type ShelfId } from "@/data/dierbergs-catalogue";
import { asset } from "@/lib/asset-base";
import { parseRequest } from "@/lib/dierbergs-demo-intents";
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
import { prefetchNeural } from "@/lib/dierbergs-neural-voice";
import DierbergsStaticBackground from "./DierbergsStaticBackground";
import AxonNavControl from "./AxonNavControl";
import AxonInteractionStrip from "./AxonInteractionStrip";
import AxonMerchandiseStage from "./AxonMerchandiseStage";
import DierbergsCartOverlay from "./DierbergsCartOverlay";
import DemoDiagnostics from "./DemoDiagnostics";
import FlyingCartItem from "./FlyingCartItem";
import type { OrbMood } from "./AxonOrb";

export type DemoPhase = "idle" | "active" | "adding";
export type MerchView = null | ShelfId | "staples";

// Left on deliberately: this demo is driven on machines we cannot attach a
// debugger to, so the console is the only trace of where a run stopped.
// A microphone that reopens a beat early can catch the tail of the shopper's
// own confirmation. Anything that is mostly words we just said is not a request.
function echoesSelf(heard: string, spoken: string[]): boolean {
  const split = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const words = split(heard);
  // Short replies like "whole milk" are what a shopper actually says, so only
  // a long utterance can be dismissed as the shopper hearing itself.
  if (words.length < 4) return false;
  return spoken.some((line) => {
    const said = new Set(split(line));
    const overlap = words.filter((w) => said.has(w)).length;
    return overlap / words.length >= 0.8;
  });
}

function dedupe(list: DemoProduct[]): DemoProduct[] {
  const seen = new Set<string>();
  return list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

function log(...parts: unknown[]) {
  if (typeof console !== "undefined") console.info("[Your Shopper]", ...parts);
}

const BUILD = process.env.NEXT_PUBLIC_BUILD_STAMP || "dev";

const WELCOME = "Welcome to Dierbergs. I'm your AI shopper.";
const SUBLINE =
  "I know the whole store and can get you anything you need. What can I help you with?";
// Rotated so a run of additions does not sound like a recording.
const FOLLOW_UPS = [
  "What else can I get you?",
  "Anything else today?",
  "What else is on the list?"
];

// Built from the catalogue, so standing up a new aisle offers it here too
// rather than leaving the fallback quietly out of date.
const AISLE_NAMES = shelves.map((s) => s.label);
const AISLE_LIST = `${AISLE_NAMES.slice(0, -1).join(", ")} or ${AISLE_NAMES.at(-1)}`;
const AISLE_HINT = `Try ${AISLE_LIST} \u2014 just say the word.`;

const SPOKEN_WELCOME =
  "Welcome to Dierbergs. I'm your AI shopper. I know the whole store, and I can get you anything you need. What can I help you with today?";

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
  // What is on the shelf right now. `shelfItems` is the narrowed-down set, so
  // a follow-up like "the jumbo ones" has something to refer back to.
  const [shelfItems, setShelfItems] = useState<DemoProduct[]>([]);
  // What the shopper has asked for so far. This is what lets "the cheese" mean
  // something when four cheddars are on screen: it is the one already on their
  // list, not a guess between the four.
  const [requested, setRequested] = useState<DemoProduct[]>([]);
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
  const merchProducts = view === "staples" ? staplesProducts : shelfItems;
  // Everything on the go from other aisles stays visible as a reminder while
  // the grid is showing one aisle.
  const onTheList = dedupe([...cart, ...requested]);
  const alsoRequested = view && view !== "staples" ? onTheList.filter((p) => p.category !== view) : [];

  useEffect(() => {
    primeVoices();
    // The greeting is the first thing anyone hears, so it must not wait on a
    // network round trip. The rest is fetched as the conversation reaches it.
    void prefetchNeural([SPOKEN_WELCOME]);
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

  const handleUtterance = useCallback(
    async (text: string) => {
      const current = view === "staples" ? null : view;
      const req = parseRequest(text, current);
      log("heard", JSON.stringify(text), "->", req.intent, req.shelf ?? "");
      setLastHeard(`${text} (${req.intent}${req.shelf ? " " + req.shelf : ""})`);
      setQuery(text);
      enterBusy();
      setMood("thinking");
      await new Promise((r) => setTimeout(r, 260));

      switch (req.intent) {
        // One path for every aisle. Which products come back is decided by the
        // catalogue, so a new aisle needs no case of its own here.
        case "SHOW":
        case "ADD": {
          const shelf = shelfById(req.shelf);
          if (!shelf) break;
          const picked = narrowShelf(shelf, req.text);
          setView(shelf.id);
          setShelfItems(picked);

          if (picked.length === 1) {
            const only = picked[0];
            setMerchHeading(`${only.name}.`);
            if (req.intent === "ADD") {
              await addProduct(only);
            } else {
              await say(
                `${only.shortName}, ${only.price}.`,
                "Say \u201Cadd it to my cart\u201D when you want it."
              );
            }
          } else {
            setMerchHeading(shelf.heading);
            const already = onTheList.filter((p) => p.category === shelf.id);
            if (req.intent === "ADD" && already.length === 1) {
              // "The cheese" when four are showing means the one they already
              // asked for. Only unambiguous because there is exactly one.
              await addProduct(already[0]);
            } else if (req.intent === "ADD") {
              // They asked to buy without saying which. Put the shelf up and
              // ask rather than guessing on their behalf.
              await say(`Happy to. ${shelf.ask}`, "Name one and I'll drop it in.");
            } else {
              await say(shelf.ask, shelf.askHint);
            }
          }
          break;
        }

        case "SHOW_STAPLES":
          setRequested(staplesProducts);
          setView("staples");
          setMerchHeading("Here are a few good matches.");
          await say("Sure. Here are a few good matches.", "Tell me which one to add.");
          break;

        case "ADD_CURRENT":
          if (merchProducts.length === 1 && view) {
            await addProduct(merchProducts[0]);
          } else if (view) {
            await say("Which one would you like?", "Name it and I'll add it.");
          } else {
            await say("Tell me what you're after first.", "Try: I need milk.");
          }
          break;

        case "SEVERAL_ITEMS":
          await say(
            "Happy to help. What would you like to get first?",
            "Name one thing at a time and I'll pull it up."
          );
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
            `I can bring up ${AISLE_LIST} right now.`,
            "Tell me which and I'll put it on the shelf.",
            `I can bring up ${AISLE_LIST} right now. Which would you like?`
          );
      }

      // Clear only once the answer is out, so the shopper sees what was heard
      // while it is being handled, and a second request starts from empty.
      setQuery("");
      exitBusy();
      log("done", req.intent);
    },
    [addProduct, enterBusy, exitBusy, merchProducts, onTheList, say, view]
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
          setLastHeard(`${text} (ignored: own voice)`);
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
    setShelfItems([]);
    setRequested([]);
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
