"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { dierbergsLayout } from "@/data/dierbergs-layout";
import { staplesProducts, type DemoProduct } from "@/data/dierbergs-demo-products";
import { dietaryAdvice, findProducts, payCents, shelfById, type ShelfId } from "@/data/dierbergs-catalogue";
import { notesFor } from "@/data/dierbergs-aisle-notes";
import { asset } from "@/lib/asset-base";
import { forgetConversation, productById, understand } from "@/lib/dierbergs-understand";
import { countSaid } from "@/lib/dierbergs-demo-intents";
import {
  connectShopper,
  productsForModel,
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
import { budgetNow } from "@/lib/dierbergs-budget";
import { money } from "@/lib/dierbergs-spend";
import type { SuggestedUnit } from "@/lib/dierbergs-trade";
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
/** Where the cart waits out a reload. Per tab, on purpose. */
const CART_KEY = "dierbergs-cart";

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
  /** The aisle on screen this instant, for checks that run off a timer. */
  const viewNow = useRef<MerchView>(null);
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState(WELCOME);
  const [hint, setHint] = useState(SUBLINE);
  const [merchHeading, setMerchHeading] = useState("");
  const [mood, setMood] = useState<OrbMood>("resting");
  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cart, setCart] = useState<DemoProduct[]>([]);
  /** The cart as it stands this instant, for adds that land back to back. */
  const cartNow = useRef<DemoProduct[]>([]);
  const [pulse, setPulse] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // What is on the shelf right now. `shelfItems` is the narrowed-down set, so
  // a follow-up like "the jumbo ones" has something to refer back to.
  const [shelfItems, setShelfItems] = useState<DemoProduct[]>([]);
  /** What is on the shelf this instant, for checks that run off a timer. */
  const shelfNow = useRef<DemoProduct[]>([]);
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
  const voiceAvailable = speechRecognitionAvailable();

  const axonOn = phase !== "idle";
  const cartIds = cart.map((p) => p.id);
  const cartTotalCents = cart.reduce((sum, p) => sum + payCents(p), 0);
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

    /*
     * The cart outlives a reload.
     *
     * Reloading the page used to empty it, so anyone who hit a snag paid for it
     * twice: once in the snag and again in re-shopping. Per tab, so a fresh tab
     * still starts empty.
     */
    try {
      const saved = window.sessionStorage.getItem(CART_KEY);
      if (!saved) return;
      const back = (JSON.parse(saved) as string[])
        .map((id) => productById(id))
        .filter((p): p is DemoProduct => Boolean(p));
      if (!back.length) return;
      cartNow.current = back;
      setCart(back);
    } catch { /* a cart that will not come back is not worth an error */ }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(CART_KEY, JSON.stringify(cart.map((p) => p.id)));
    } catch { /* private browsing, or a full quota: the cart still works */ }
  }, [cart]);

  useEffect(() => {
    viewNow.current = view;
  }, [view]);

  useEffect(() => {
    shelfNow.current = shelfItems;
  }, [shelfItems]);

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
  /*
   * What went in because Axon offered it, with the brand kept, because the brand
   * is who gets invoiced for the referral. A ref alongside the state because two
   * adds can land faster than a render, same as the cart.
   */
  const suggestedRef = useRef<SuggestedUnit[]>([]);
  const [suggested, setSuggested] = useState<SuggestedUnit[]>([]);
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

  /*
   * The cart, once something is actually in it.
   *
   * Kept apart from the animation because the cart being right does not depend
   * on a package having flown anywhere.
   */
  const dropIn = useCallback((product: DemoProduct): DemoProduct[] => {
    /*
     * Off the ref, not off the state. Two of the same thing land one after
     * the other faster than a render, and reading the old state here is how
     * the second one overwrites the first instead of adding to it.
     */
    const next = [...cartNow.current, product];
    cartNow.current = next;
    setCart(next);
    setPulse(true);
    setPhase("active");
    window.setTimeout(() => setPulse(false), 240);
    return next;
  }, []);

  const confirmAdd = useCallback(
    async (product: DemoProduct, next: DemoProduct[]) => {
      const total = next.reduce((sum, p) => sum + payCents(p), 0);
      const count = `${next.length} ${next.length === 1 ? "item" : "items"}`;
      const followUp = FOLLOW_UPS[next.length % FOLLOW_UPS.length];
      await say(
        `Got it \u2014 ${product.shortName} is in your cart.`,
        `${count}, $${(total / 100).toFixed(2)}. ${followUp}`,
        `Got it. ${product.shortName} is in your cart. ${followUp}`
      );
      setSelectedId(null);
    },
    [say]
  );

  /** The card, once React has actually put it on the shelf. */
  const cardFor = useCallback(async (id: string): Promise<HTMLImageElement | null> => {
    for (let i = 0; i < 12; i += 1) {
      const found = imgRefs.current[id];
      if (found) return found;
      await new Promise((r) => setTimeout(r, 60));
    }
    return null;
  }, []);

  /*
   * `quiet` puts it in the cart without saying so.
   *
   * Two cartons is one decision, and confirming each of them separately is the
   * doubling-up that made it sound like it was not listening. So a run of adds
   * speaks once, at the end, when the total is finally true.
   */
  const addProduct = useCallback(
    async (product: DemoProduct, quiet = false) => {
      if (quiet) {
        dropIn(product);
        return;
      }
      /*
       * Wait for the card before giving up on it. A swap puts the new carton on
       * the shelf and adds it in the same breath, and the card is one render
       * behind — reading the ref straight away found nothing and the add was
       * quietly dropped, which is a cart that ignores what it was told.
       */
      const img = await cardFor(product.id);
      const cartEl = cartRef.current;
      if (!img || !cartEl) {
        // No card to fly out of, so no animation. It still goes in the cart.
        await confirmAdd(product, dropIn(product));
        return;
      }

      setSelectedId(product.id);
      setPhase("adding");
      setPrompt(`Adding ${product.shortName}.`);
      setHint("Watch the cart.");
      setFlight({
        src: product.image,
        from: img.getBoundingClientRect(),
        to: cartEl.getBoundingClientRect()
      });

      /*
       * The cart is true now, not when the package lands.
       *
       * It used to wait out the three quarters of a second the package spends
       * in the air before it would even answer, and on a live line that is
       * three quarters of a second of Axon holding its tongue on every single
       * add. The flight is decoration. The cart is not.
       */
      await confirmAdd(product, dropIn(product));
    },
    [cardFor, confirmAdd, dropIn]
  );

  /** Several of one thing, confirmed once at the end rather than each time. */
  const addMany = useCallback(
    async (product: DemoProduct, count: number) => {
      for (let i = 0; i < count - 1; i += 1) await addProduct(product, true);
      await addProduct(product);
    },
    [addProduct]
  );

  const removeFromCart = useCallback((id: string): string => {
    const product = productById(id);
    const now = cartNow.current;
    const at = now.map((p) => p.id).lastIndexOf(id);
    if (at < 0) {
      return product ? `${product.name} is not in the cart` : "no such product";
    }
    const next = [...now.slice(0, at), ...now.slice(at + 1)];
    cartNow.current = next;
    setCart(next);
    setPulse(true);
    window.setTimeout(() => setPulse(false), 240);

    const total = next.reduce((sum, p) => sum + payCents(p), 0);
    return `took ${product?.name ?? id} out. ${next.length} ${
      next.length === 1 ? "item" : "items"
    }, $${(total / 100).toFixed(2)}.`;
  }, []);

  /*
   * Makes the cart hold as many as they asked for.
   *
   * A number is the count they want, not an instruction to add. "Make it two
   * half gallons" said over a cart that already holds one is the case the model
   * gets wrong about one time in three: it decides there is nothing to do and
   * leaves it at one, which looks exactly like the feature not working.
   *
   * Only ever acts on a number the shopper actually said, and only on the item
   * the turn was already about, so it enforces their words rather than
   * second-guessing them.
   */
  const settleCount = useCallback(async (heard: string, subject?: DemoProduct) => {
    /*
     * Only when a number was actually said. A count of one is an instruction
     * like any other — "make it three" then "actually just one" has to come
     * back down — but no number at all is not an instruction to hold one, or
     * every ordinary add would start trimming the cart behind them.
     */
    const wanted = countSaid(heard);
    if (wanted === null) return;
    const item = subject ?? cartNow.current[cartNow.current.length - 1];
    if (!item) return;
    const held = cartNow.current.filter((p) => p.id === item.id).length;
    if (held === 0 || held === wanted) return;
    for (let i = held; i < wanted; i += 1) await addProduct(item, true);
    for (let i = held; i > wanted; i -= 1) removeFromCart(item.id);
    setPulse(true);
    window.setTimeout(() => setPulse(false), 240);

    /*
     * And say it. The adds here are deliberately quiet, so that settling three
     * cartons does not confirm three times — but quiet all the way through
     * means the cart changed while the answer talked about something else, and
     * a total that moves without being mentioned is the one people check twice.
     */
    const left = cartNow.current;
    const total = left.reduce((sum, p) => sum + payCents(p), 0);
    await say(
      `That's ${wanted} of the ${item.name.replace(/\s+-\s+/g, ", ")} now.`,
      `${left.length} ${left.length === 1 ? "item" : "items"}, $${(total / 100).toFixed(2)}.`
    );
  }, [addProduct, removeFromCart, say]);

  const onFlightDone = useCallback(() => {
    setFlight(null);
    setSelectedId(null);
  }, []);

  /*
   * Taking something back out.
   *
   * "No, not that one" is half of shopping, and until now the only way out of
   * the cart was to reload the page, which threw the whole cart away.
   */

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

      // "Two half gallons" is one carton asked for twice, not two cartons.
      const many = Math.min(Math.max(turn.quantity ?? 1, 1), 12);

      if (turn.action === "add" && turn.products.length === 1) {
        // addMany speaks the confirmation itself, because it is the only thing
        // that knows the cart total once all of this has gone in.
        await addMany(turn.products[0], many);
      } else if (turn.action === "replace" && turn.outgoing && turn.products.length === 1) {
        // The old one goes as the new one arrives, so a change of mind about
        // the size leaves one carton in the cart rather than two.
        removeFromCart(turn.outgoing.id);
        await addMany(turn.products[0], many);
      } else if (turn.action === "remove" && turn.outgoing) {
        const gone = turn.outgoing;
        removeFromCart(gone.id);
        const left = cartNow.current;
        const total = left.reduce((sum, p) => sum + payCents(p), 0);
        await say(
          `Done \u2014 the ${gone.name.replace(/\s+-\s+/g, ", ")} is out of your cart.`,
          left.length
            ? `${left.length} ${left.length === 1 ? "item" : "items"}, $${(total / 100).toFixed(2)}.`
            : "Your cart is empty."
        );
      } else {
        await say(turn.say, turn.hint);
      }

      /*
       * The subject is only the subject when something was bought. On a turn
       * that answers rather than buys, products[0] is whatever went up on the
       * shelf — not in the cart at all — and settling the count against it
       * finds none of it held and does nothing. Which is how "actually just
       * one" left three in the cart: the sentence was understood, the shelf
       * moved, and the count it named was measured against the wrong carton.
       */
      const bought = turn.action === "add" || turn.action === "replace";
      await settleCount(text, bought ? turn.products[0] ?? turn.outgoing : undefined);

      // Clear only once the answer is out, so the shopper sees what was heard
      // while it is being handled, and a second request starts from empty.
      setQuery("");
      exitBusy();
      log("done", turn.action);
    },
    [addMany, addProduct, cart, enterBusy, exitBusy, merchProducts, onTheList, removeFromCart, say, settleCount, view]
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

  /*
   * The catalogue, asked rather than remembered.
   *
   * This is what makes the store's size somebody else's problem: the assistant
   * holds an aisle index and looks products up, so the same code answers for a
   * hundred items or forty thousand. What comes back is what is now on the
   * shelf, so the conversation and the screen cannot disagree.
   */
  /*
   * Puts the right aisle up when someone mentions what they cannot eat.
   *
   * Axon is told to show whatever it names, and mostly does. When it does not,
   * the shopper hears a good answer about milk while looking at a box of eggs,
   * which reads as broken however right the words were. So this waits to see
   * whether Axon changes the shelf itself, and only steps in if it has not.
   *
   * It never contradicts Axon and never touches the cart — it fills a screen
   * Axon left behind. That is the difference between this and the old size
   * guardrail, which overrode what the shopper had actually asked for.
   */
  const dietaryShelfBackstop = useCallback((heard: string) => {
    // "staples" is the opening spread rather than a real aisle, so it counts as
    // standing nowhere in particular.
    const standing = viewNow.current === "staples" ? null : viewNow.current;
    const advice = dietaryAdvice(heard, standing);
    if (!advice) return;
    const wanted = advice.products.map((p) => p.id);
    window.setTimeout(() => {
      /*
       * Whether the right cartons are up, not merely whether the aisle
       * changed. Axon has been known to move to the milk and then show the
       * carton already in the cart, which is the wrong shelf in the right
       * aisle.
       */
      const up = shelfNow.current.map((p) => p.id);
      if (wanted.every((id) => up.includes(id))) return;
      setView(advice.aisle);
      setShelfItems(advice.products);
      setRequested((was) => dedupe([...was, ...advice.products]));
      setMerchHeading(shelfById(advice.aisle)?.heading ?? "Here you are.");
      setHint(advice.hint);
    }, 2600);
  }, []);

  const findForModel = useCallback((query: string, aisle?: string): string => {
    const { products, aisle: found } = findProducts(query, (aisle as ShelfId) || null);
    if (!products.length) {
      return `nothing in the store matches "${query}"; tell them it is not carried`;
    }
    const view = found ?? (products[0].category as ShelfId);
    setView(view);
    setShelfItems(products);
    setRequested((was) => dedupe([...was, ...products]));
    setMerchHeading(
      products.length === 1 ? `${products[0].name}.` : shelfById(view)?.heading ?? "Here you are."
    );
    /*
     * The aisle's knowledge rides along with its products, rather than sitting
     * in the standing instructions. A paragraph an aisle is nothing at four
     * aisles and an impossible prompt at a hundred, so it is looked up for the
     * aisle in play — the same reason the catalogue is.
     */
    const notes = notesFor(view);
    return [
      `on the shelf now: ${productsForModel(products)}`,
      notes ? `what you know about the ${view} aisle:\n${notes}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");
  }, []);

  const addToCart = useCallback(
    async (id: string, quantity?: number, suggested?: boolean): Promise<string> => {
      const product = productById(id);
      if (!product) return "no such product";
      // "Two of those" is a normal thing to ask a person for. Capped so a
      // misheard number cannot fill the cart.
      const many = Math.min(Math.max(Math.round(quantity ?? 1) || 1, 1), 6);
      // Make sure it is on screen: the package has to fly out of a card. No
      // fixed pause afterwards — addProduct waits for the card itself, and
      // gives up the wait the moment it appears.
      if (!imgRefs.current[product.id]) {
        setView(product.category as ShelfId);
        setShelfItems([product]);
        setMerchHeading(`${product.name}.`);
      }
      for (let i = 0; i < many; i += 1) await addProduct(product);

      /*
       * Whose idea it was, at the price actually being charged. This is the
       * other half of the ledger from the cost meter: what the conversation put
       * in the basket that a search box would not have.
       */
      if (suggested) {
        const units = Array.from({ length: many }, () => ({
          brand: product.brand,
          cents: payCents(product)
        }));
        suggestedRef.current = [...suggestedRef.current, ...units];
        setSuggested(suggestedRef.current);
      }

      const now = cartNow.current;
      const total = now.reduce((sum, p) => sum + payCents(p), 0);
      const mine = now.filter((p) => p.id === product.id).length;
      return `${mine > 1 ? `${mine} \u00d7 ` : ""}${product.name} in the cart. ${now.length} ${
        now.length === 1 ? "item" : "items"
      }, $${(total / 100).toFixed(2)}.`;
    },
    [addProduct]
  );

  /*
   * One for the other, in a single move.
   *
   * "Make it the gallon instead" is one thought, not two, and running it as a
   * remove and then an add let a slow add land after the remove and leave both
   * cartons sitting in the cart.
   */
  const replaceInCart = useCallback(
    async (outId: string, inId: string): Promise<string> => {
      const going = productById(outId);
      const coming = productById(inId);
      if (!coming) return "no such product to put in";
      const had = cartNow.current.some((p) => p.id === outId);
      if (had) removeFromCart(outId);
      await addToCart(inId);
      const now = cartNow.current;
      const total = now.reduce((sum, p) => sum + payCents(p), 0);
      return `${had ? `swapped ${going?.name ?? outId} for ` : "put "}${coming.name} in the cart. ${
        now.length
      } ${now.length === 1 ? "item" : "items"}, $${(total / 100).toFixed(2)}.`;
    },
    [addToCart, removeFromCart]
  );

  const tools = useRef({ findForModel, showProducts, addToCart, removeFromCart, replaceInCart });
  useEffect(() => {
    tools.current = { findForModel, showProducts, addToCart, removeFromCart, replaceInCart };
  }, [findForModel, showProducts, addToCart, removeFromCart, replaceInCart]);

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
          findProducts: (query, aisle) => tools.current.findForModel(query, aisle),
          showProducts: (aisle, ids) => tools.current.showProducts(aisle, ids),
          addToCart: (id, quantity, suggested) =>
            tools.current.addToCart(id, quantity, suggested),
          removeFromCart: (id) => tools.current.removeFromCart(id),
          replaceInCart: (outId, inId) => tools.current.replaceInCart(outId, inId)
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
            dietaryShelfBackstop(text);
            // Same wait as the shelf: Axon gets first go at it.
            window.setTimeout(() => void settleCount(text), 2600);
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

  /*
   * The voice line against what the basket has earned.
   *
   * Spoken minutes are the cost of this whole idea, so they are metered. A
   * growing cart keeps raising the allowance, which means a real shopper is
   * never cut off; a cart that stays empty while the talking goes on hits the
   * base allowance and the conversation moves to typing, which costs nothing.
   */
  const warned = useRef(false);
  useEffect(() => {
    if (!liveOn) {
      warned.current = false;
      return;
    }
    const id = window.setInterval(() => {
      const { verdict, left } = budgetNow(cartTotalCents);
      if (verdict === "warn" && !warned.current) {
        warned.current = true;
        log("voice budget low", money(left));
        setHint("We can keep talking a little longer \u2014 or type, which is quicker anyway.");
        return;
      }
      if (verdict !== "spent") return;
      log("voice budget spent", money(budgetNow(cartTotalCents).spent));
      live.current?.close();
      live.current = null;
      setLiveOn(false);
      setVoiceMode(false);
      setEngine("browser");
      setMood("resting");
      setListening(false);
      setPrompt("Let's carry on in writing \u2014 your cart is exactly as you left it.");
      setHint("Type below. Add something and I can pick the conversation back up.");
      inputRef.current?.focus();
    }, 2000);
    return () => window.clearInterval(id);
  }, [liveOn, cartTotalCents]);

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
    stopListening(recRef.current);
    recRef.current = null;
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
    cartNow.current = [];
    suggestedRef.current = [];
    setSuggested([]);
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
        cartCents={cartTotalCents}
        suggested={suggested}
        state={listening ? "listening" : busy ? "thinking or speaking" : phase}
        lastHeard={lastHeard}
        lastError={lastError}
      />
    </div>
  );
}
