"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { dierbergsLayout } from "@/data/dierbergs-layout";
import { staplesProducts, type DemoProduct } from "@/data/dierbergs-demo-products";
import { shelfById, type ShelfId } from "@/data/dierbergs-catalogue";
import { asset } from "@/lib/asset-base";
import { forgetConversation, productById, understand } from "@/lib/dierbergs-understand";
import {
  connectShopper,
  realtimeSupported,
  type ShopperSession
} from "@/lib/dierbergs-realtime";
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

const WELCOME = "Welcome to Dierbergs.";
const SUBLINE = "How can I help you with your shopping today?";
// Rotated so a run of additions does not sound like a recording.
const FOLLOW_UPS = [
  "What else can I get you?",
  "Anything else today?",
  "What else is on the list?"
];

const SPOKEN_WELCOME =
  "Welcome to Dierbergs. How can I help you with your shopping today?";
// Says which of the two it is, because "add a key" and "add credit" send a
// person to completely different pages and only one of them is ever the fix.
const CREDIT_HINT =
  "Browser voice \u2014 Axon cannot open. The OpenAI account has no credit. Add credit at platform.openai.com.";
const LIVE_FAILED_HINT = "Browser voice \u2014 Axon did not connect.";
const NO_KEY_HINT =
  "Browser voice \u2014 the server has no OpenAI key. Set OPENAI_API_KEY on it.";

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
  const landed = useRef<(() => void) | null>(null);
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

  // Set while a live voice line is open. The model is doing the talking then,
  // so anything we would have said is put on the strip and left unspoken.
  const live = useRef<ShopperSession | null>(null);
  /** Set once the API says the balance is spent, so the strip keeps saying so. */
  const outOfCredit = useRef(false);
  /** Live connect failed; we are on browser STT + TTS, not Realtime GPT. */
  const fallback = useRef(false);
  /** The server answered with no key of its own, which is a fixable thing. */
  const noKey = useRef(false);
  const [liveOn, setLiveOn] = useState(false);
  const [engine, setEngine] = useState<"off" | "realtime" | "browser">("off");

  const browserHint = () =>
    outOfCredit.current
      ? CREDIT_HINT
      : noKey.current
        ? NO_KEY_HINT
        : fallback.current
          ? LIVE_FAILED_HINT
          : null;

  const say = useCallback(
    async (line: string, sub?: string, spoken?: string) => {
      // Do not paper over an out-of-credit / failed-live notice with the
      // greeting subline. That is how the strip hid that this is browser voice.
      const notice = browserHint();
      if (sub !== undefined) setHint(notice && sub === SUBLINE ? notice : sub);
      // On a live line the model is mid-sentence about this already. Writing
      // our version of it too puts two confirmations on screen a beat apart.
      if (live.current) return;

      setPrompt(line);

      const words = spoken ?? line;
      enterBusy();
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
      // Resolves when the package lands, so a caller can wait for the cart to
      // be true before saying anything about it.
      await new Promise<void>((resolve) => {
        landed.current = resolve;
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
    landed.current?.();
    landed.current = null;
  }, [cart, say]);

  const handleUtterance = useCallback(
    async (text: string) => {
      // With the line open, typing goes to the same mind that is listening,
      // so switching between talking and typing does not lose the thread.
      if (live.current) {
        setLastHeard(text);
        live.current.send(text);
        setQuery("");
        return;
      }

      setQuery(text);
      enterBusy();
      setMood("thinking");

      const turn = await understand(text, {
        showing: merchProducts,
        cart,
        onList: onTheList,
        current: view === "staples" ? null : view
      });
      log("heard", JSON.stringify(text), "->", turn.action, turn.aisle ?? "", `(${turn.source})`);
      setLastHeard(`${text} (${turn.action}${turn.aisle ? " " + turn.aisle : ""} \u00b7 ${turn.model ?? turn.source})`);

      // Put the shelf up before speaking, so what the shopper is being told
      // about is already in front of them.
      if (turn.aisle === "staples") {
        setRequested(staplesProducts);
        setView("staples");
        setMerchHeading("Here are a few good matches.");
      } else if (turn.aisle && turn.products.length) {
        setView(turn.aisle);
        setShelfItems(turn.products);
        setMerchHeading(
          turn.products.length === 1
            ? `${turn.products[0].name}.`
            : shelfById(turn.aisle)?.heading ?? "Here you are."
        );
      }

      if (turn.action === "add" && turn.products.length === 1) {
        // addProduct speaks its own confirmation, because the cart total is
        // only true once the package has landed in it.
        await addProduct(turn.products[0]);
      } else {
        await say(turn.say, turn.hint);
      }

      // Clear only once the answer is out, so the shopper sees what was heard
      // while it is being handled, and a second request starts from empty.
      setQuery("");
      exitBusy();
      log("done", turn.action);
    },
    [addProduct, cart, enterBusy, exitBusy, merchProducts, onTheList, say, view]
  );

  /*
   * The store, handed to the live voice model as two things it can do. These
   * are the same shelf and the same cart the typed path drives, so a shopper
   * can start talking and finish typing without anything resetting.
   */
  const showProducts = useCallback((aisle: string, ids: string[]): string => {
    const picked = ids.map((id) => productById(id)).filter((p): p is DemoProduct => Boolean(p));
    if (!picked.length) return "no such products; check the ids against the shelves";

    setView((aisle as ShelfId) || picked[0].category);
    setShelfItems(picked);
    setRequested((was) => dedupe([...was, ...picked]));
    setMerchHeading(
      picked.length === 1 ? `${picked[0].name}.` : shelfById(aisle as ShelfId)?.heading ?? "Here you are."
    );
    return `showing ${picked.map((p) => p.name).join(", ")}`;
  }, []);

  const addToCart = useCallback(
    async (id: string): Promise<string> => {
      const product = productById(id);
      if (!product) return "no such product";
      if (cartIds.includes(product.id)) return `${product.name} is already in the cart`;
      // Make sure it is on screen: the package has to fly out of a card.
      if (!imgRefs.current[product.id]) {
        setView(product.category as ShelfId);
        setShelfItems([product]);
        setMerchHeading(`${product.name}.`);
        await new Promise((r) => setTimeout(r, 420));
      }
      await addProduct(product);
      const next = [...cart, product];
      const total = next.reduce((sum, p) => sum + p.priceCents, 0);
      return `${product.name} is in the cart. ${next.length} ${
        next.length === 1 ? "item" : "items"
      }, $${(total / 100).toFixed(2)}.`;
    },
    [addProduct, cart, cartIds]
  );

  const tools = useRef({ showProducts, addToCart });
  useEffect(() => {
    tools.current = { showProducts, addToCart };
  }, [showProducts, addToCart]);

  const goLive = useCallback(async () => {
    if (live.current) {
      live.current.close();
      live.current = null;
      setLiveOn(false);
      setMood("resting");
      return;
    }
    setLastError("");
    setMood("thinking");
    setPrompt("Connecting\u2026");
    setHint("One moment.");
    try {
      const session = await connectShopper(
        {
          showProducts: (aisle, ids) => tools.current.showProducts(aisle, ids),
          addToCart: (id) => tools.current.addToCart(id)
        },
        {
          onState: (state) => {
            setMood(
              state === "listening" ? "listening" : state === "speaking" ? "speaking" : state === "thinking" ? "thinking" : "resting"
            );
            setListening(state === "listening");
          },
          onHeard: (text) => {
            log("heard (live)", text);
            setLastHeard(text);
          },
          onSaid: (text) => {
            setPrompt(text);
            setHint("Just talk \u2014 I'm listening.");
          },
          onError: (message) => {
            log("live error", message);
            setLastError(message);
          }
        }
      );
      live.current = session;
      setLiveOn(true);
      setEngine("realtime");
      setVoiceMode(false);
      fallback.current = false;
      outOfCredit.current = false;
    } catch (error) {
      const message = String((error as Error)?.message || error);
      log("live failed", message);
      setLastError(message);
      setMood("resting");
      fallback.current = true;
      setEngine("browser");
      /*
       * Name the actual reason. An exhausted OpenAI balance and a dead
       * microphone both end up here, and telling someone to check their
       * headset when the account is out of credit sends them looking in
       * completely the wrong place.
       */
      outOfCredit.current = /insufficient_quota|credit_balance|billing|quota/i.test(message);
      // "No key configured" is the server saying it has no OPENAI_API_KEY, and
      // it is the one cause a person can actually do something about.
      noKey.current = /no key configured|invalid_api_key|incorrect api key|401/i.test(message);
      setPrompt(
        outOfCredit.current
          ? "Axon cannot open \u2014 the OpenAI account is out of credit."
          : noKey.current
            ? "The server has no OpenAI key, so the live voice line is off."
            : "I couldn't open the live voice line."
      );
      setHint(browserHint() ?? LIVE_FAILED_HINT);
      inputRef.current?.focus();
    }
  }, []);

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
        /*
         * An exhausted balance already put the real reason on the strip, and
         * the browser recogniser is only failing underneath it. Do not paper
         * over the cause with a note about the microphone.
         */
        if (!outOfCredit.current) {
          setPrompt(line);
          setHint(help);
        }
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
    setEngine("browser");

    // A live voice line is the real thing: the model hears the shopper and
    // answers in its own voice, so it can be interrupted and it does not wait
    // on transcription. It greets them itself, so nothing is said here.
    if (realtimeSupported()) {
      setPrompt(WELCOME);
      setHint(SUBLINE);
      await goLive();
      if (live.current) return;
      // The microphone was refused or the line would not open. Carry on with
      // the typed path rather than leaving them looking at a dead strip.
    }

    // One utterance, not two: cancelling a queued second line is unreliable, and
    // a shopper who interrupts the greeting must be listened to immediately.
    await say(WELCOME, browserHint() ?? SUBLINE, SPOKEN_WELCOME);
    // Start listening without being asked. Waiting on a microphone press reads
    // as the shopper greeting you and then ignoring you.
    if (voiceAvailable) {
      log("auto-listening after greeting");
      if (browserName() !== "Chrome") {
        setHint(
          browserHint() ??
            `Listening. Voice is unreliable in ${browserName()} — if nothing happens, type below or use Chrome.`
        );
      } else if (browserHint()) {
        setHint(browserHint() as string);
      }
      setVoiceMode(true);
    } else {
      setHint(browserHint() ?? "This browser has no speech recognition. Type what you need below.");
    }
  }

  function toggleListen() {
    if (live.current) {
      live.current.close();
      live.current = null;
      setLiveOn(false);
      return;
    }
    // Already on the browser path. Pressing the mic must toggle listening,
    // not retry Realtime — that puts "Connecting…" over the conversation.
    if (fallback.current || outOfCredit.current || !realtimeSupported()) {
      if (!voiceAvailable) return;
      cancelSpeech();
      setVoiceMode((on) => !on);
      return;
    }
    cancelSpeech();
    void goLive();
  }

  // Typing takes over from the microphone, so an open mic cannot inject room
  // noise into what is being written. A live line stays open: it is one
  // conversation whether the words are spoken or typed.
  function onQueryTyped(value: string) {
    if (voiceMode && !live.current) {
      cancelSpeech();
      setVoiceMode(false);
    }
    setQuery(value);
  }

  function reset() {
    cancelSpeech();
    forgetConversation();
    live.current?.close();
    live.current = null;
    setLiveOn(false);
    fallback.current = false;
    outOfCredit.current = false;
    setEngine("off");
    landed.current = null;
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
                  listening={listening || liveOn}
                  voiceAvailable={voiceAvailable || realtimeSupported()}
                  inputRef={inputRef}
                  onQueryChange={onQueryTyped}
                  onSubmit={handleUtterance}
                  onToggleListen={toggleListen}
                  disabled={phase === "adding"}
                  live={liveOn}
                  engine={engine}
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
        engine={engine}
        state={listening ? "listening" : busy ? "thinking or speaking" : phase}
        lastHeard={lastHeard}
        lastError={lastError}
      />
    </div>
  );
}
