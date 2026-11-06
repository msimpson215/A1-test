"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { dierbergsLayout } from "@/data/dierbergs-layout";
import { staplesProducts, type DemoProduct } from "@/data/dierbergs-demo-products";
import { dietaryAdvice, findProducts, payCents, shelfById, type ShelfId } from "@/data/dierbergs-catalogue";
import { allNotes } from "@/data/dierbergs-aisle-notes";
import { asset } from "@/lib/asset-base";
import { forgetConversation, productById, understand } from "@/lib/dierbergs-understand";
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
export type MerchView = null | ShelfId | "staples" | "checkout";

// Left on deliberately: this demo is driven on machines we cannot attach a
// debugger to, so the console is the only trace of where a run stopped.
/*
 * The heading has to say what is actually up there.
 *
 * "Our Dierbergs milk" over all twenty-two cartons is the shelf's old lie told
 * in a different place: it claims a selection to somebody who asked to see
 * everything and was given it.
 */
function headingFor(aisle: ShelfId, products: DemoProduct[]): string {
  const shelf = shelfById(aisle);
  if (products.length === 1) return `${products[0].name}.`;
  if (shelf && products.length >= shelf.products.length) {
    return `All the ${shelf.label} we carry.`;
  }
  return shelf?.heading ?? "Here you are.";
}

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
// The other two hints name a fix. This one only named the fault, which leaves a
// shopper looking at a dead voice line with nothing to try. Pressing the mic
// again now retries the live line, so say that, and say typing works meanwhile.
const LIVE_FAILED_HINT =
  "Browser voice \u2014 Axon did not connect. Type below, or press the mic to try the live line again.";
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
  /*
   * The last few things they were looking at elsewhere, not everything they have
   * ever seen. Now that a shopper can ask for a whole aisle, "everything seen so
   * far" is thirty cartons, and a sidebar of thirty is not a reminder.
   */
  const alsoRequested =
    view && view !== "staples" && view !== "checkout"
      ? onTheList.filter((p) => p.category !== view).slice(-4)
      : [];

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

  /*
   * Carry on shopping after saying yes, and the order re-opens.
   *
   * Otherwise the receipt goes on saying "Order placed" over a basket that kept
   * growing, and the last thing anyone should be able to do here is hand
   * somebody a confirmed order that is not the order they have.
   */
  useEffect(() => {
    if (!orderRef.current) return;
    if (cart.map((p) => p.id).join("|") === orderedIds.current) return;
    orderRef.current = null;
    setOrderNumber(null);
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
  /*
   * Which brain answered, named, or null when GPT could not be reached.
   *
   * undefined until something has been said, so the badge stays off during the
   * greeting rather than announcing a model that has not been asked anything.
   */
  const [brain, setBrain] = useState<string | null | undefined>(undefined);
  /* The order, once placed. A ref beside the state because a spoken "yes" and a
     clicked button can both land before a render. */
  const orderRef = useRef<string | null>(null);
  const orderedIds = useRef("");
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

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

  /* Emptying the cart without ending the visit: the shelf, the aisle and the
     conversation all stay where they are. */
  const emptyCart = useCallback(() => {
    cartNow.current = [];
    setCart([]);
    suggestedRef.current = [];
    setSuggested([]);
    setPulse(true);
    window.setTimeout(() => setPulse(false), 240);
  }, []);

  const removeFromCart = useCallback((id: string, howMany?: number): string => {
    const product = productById(id);
    const now = cartNow.current;
    const held = now.filter((p) => p.id === id).length;
    if (held === 0) {
      return product ? `${product.name} is not in the cart` : "no such product";
    }
    /*
     * All of them unless they named a number. Taking one loaf out of twelve and
     * reporting the bread gone is the same lie as confirming an add that never
     * happened, and it took four goes to undo.
     */
    const taking = Math.min(Math.max(Math.round(howMany ?? held) || held, 1), held);
    let next = now;
    for (let i = 0; i < taking; i += 1) {
      const at = next.map((p) => p.id).lastIndexOf(id);
      next = [...next.slice(0, at), ...next.slice(at + 1)];
    }
    cartNow.current = next;
    setCart(next);
    setPulse(true);
    window.setTimeout(() => setPulse(false), 240);

    const total = next.reduce((sum, p) => sum + payCents(p), 0);
    const still = next.filter((p) => p.id === id).length;
    return `took ${taking} ${product?.name ?? id} out${
      still ? `, ${still} still in the cart` : ""
    }. ${next.length} ${next.length === 1 ? "item" : "items"}, $${(total / 100).toFixed(2)}.`;
  }, []);

  /*
   * Makes the cart hold as many as they asked for.
   *
   * A number they said is the number they want in the cart, not a number to pile
   * on top of what is already in it. One chocolate milk and "actually make it two
   * of the chocolate" ended with three: the model reported a quantity of two,
   * correctly, and this added two more. That is the oldest complaint about this
   * demo and it keeps coming back, so it stops depending on whether the model
   * phrased the number as a total or an increment. Whatever number arrives, the
   * cart ends holding exactly that many.
   *
   * Only when a number was actually said, and only for the item the turn was
   * already about. Silence means one more, because saying "add the cheddar" twice
   * is somebody who wants two.
   */
  const settleTo = useCallback(
    async (product: DemoProduct, said: number | null | undefined, target: number) => {
      if (said == null) return void (await addProduct(product));

      const held = cartNow.current.filter((p) => p.id === product.id).length;
      if (target > held) return void (await addMany(product, target - held));

      for (let i = 0; i < held - target; i += 1) removeFromCart(product.id);
      const now = cartNow.current;
      const total = now.reduce((sum, p) => sum + payCents(p), 0);
      await say(
        target === 0
          ? `${product.shortName} is out of your cart.`
          : `You've got ${target} of the ${product.shortName}.`,
        `${now.length} ${now.length === 1 ? "item" : "items"}, $${(total / 100).toFixed(2)}.`
      );
    },
    [addMany, addProduct, removeFromCart, say]
  );

  /*
   * The end of the shop, which the demo did not have.
   *
   * A cart was a number in the corner and there was nowhere for a conversation to
   * finish, so five minutes of choosing milk ended with nothing to say yes to.
   * The yes is the point: a store is not buying a nicer search box, it is buying
   * completed baskets, and a demo that cannot be completed is not showing them
   * the thing they would be paying for.
   */
  const showCheckout = useCallback((): string => {
    const held = cartNow.current;
    setView("checkout");
    setMerchHeading("");
    if (!held.length) return "the cart is empty, so there is nothing to check out";
    const total = held.reduce((sum, p) => sum + payCents(p), 0);
    const saved = held.reduce((sum, p) => sum + Math.max(0, p.priceCents - payCents(p)), 0);
    return `showing the order: ${held.length} ${held.length === 1 ? "item" : "items"}, $${(
      total / 100
    ).toFixed(2)}${saved > 0 ? `, $${(saved / 100).toFixed(2)} saved on the ad` : ""}`;
  }, []);

  /*
   * "Okay, we'll take it."
   *
   * No money moves and none pretends to. What it does is prove the conversation
   * can reach an end, and give the shopper a number back — which is the moment a
   * grocer recognises, because it is the only part of this they already have a
   * process for.
   */
  const placeOrder = useCallback((): string => {
    const held = cartNow.current;
    if (!held.length) return "nothing in the cart, so no order was placed";
    if (orderRef.current) return `order ${orderRef.current} is already placed`;
    const number = `D${String(Math.floor(Math.random() * 9000) + 1000)}`;
    orderRef.current = number;
    orderedIds.current = held.map((p) => p.id).join("|");
    setOrderNumber(number);
    setView("checkout");
    setMerchHeading("");
    const total = held.reduce((sum, p) => sum + payCents(p), 0);
    return `order ${number} placed: ${held.length} ${
      held.length === 1 ? "item" : "items"
    }, $${(total / 100).toFixed(2)}, ready for pickup`;
  }, []);

  /* The button on the receipt. Same order, same words back, so clicking and
     saying it are the same act rather than two half-implemented ones. */
  const placeOrderAloud = useCallback(async () => {
    const held = cartNow.current;
    if (!held.length || orderRef.current) return;
    const total = held.reduce((sum, p) => sum + payCents(p), 0);
    placeOrder();
    await say(
      `Done. Order ${orderRef.current}, $${(total / 100).toFixed(
        2
      )}, and it'll be ready for pickup. Thanks very much.`,
      `Order ${orderRef.current}.`
    );
  }, [placeOrder, say]);

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
        // Neither the staples shelf nor the checkout page is an aisle, so
        // neither is the aisle a clipped follow-up is about.
        current: view === "staples" || view === "checkout" ? null : view,
        atCheckout: view === "checkout"
      });
      log("heard", JSON.stringify(text), "->", turn.action, turn.aisle ?? "", `(${turn.source})`);
      setLastHeard(`${text} (${turn.action}${turn.aisle ? " " + turn.aisle : ""} \u00b7 ${turn.model ?? turn.source})`);
      setBrain(turn.source === "model" ? turn.model ?? "GPT" : null);

      // Put the shelf up before speaking, so what the shopper is being told
      // about is already in front of them.
      if (turn.aisle === "staples") {
        setRequested(staplesProducts);
        setView("staples");
        setMerchHeading("Here are a few good matches.");
      } else if (turn.aisle && turn.products.length) {
        setView(turn.aisle);
        setShelfItems(turn.products);
        setMerchHeading(headingFor(turn.aisle, turn.products));
      }

      // "Two half gallons" is one carton asked for twice, not two cartons.
      /*
       * An unstated number is one when buying and everything when taking out.
       * "Take the bread out" with twelve loaves in the cart used to remove a
       * single loaf and announce the bread was gone, which is the same lie as
       * confirming an add that never happened.
       */
      const many = Math.min(Math.max(turn.quantity ?? 1, 1), 12);

      if (turn.action === "add" && turn.products.length >= 1) {
        // addMany speaks the confirmation itself, because it is the only thing
        // that knows the cart total once all of this has gone in. Several named
        // in one breath go in quietly and are confirmed once, together.
        for (const product of turn.products.slice(0, -1)) await addProduct(product, true);
        await settleTo(turn.products[turn.products.length - 1], turn.quantity, many);
      } else if (turn.action === "replace" && turn.outgoing && turn.products.length === 1) {
        // The old one goes as the new one arrives, so a change of mind about
        // the size leaves one carton in the cart rather than two.
        removeFromCart(turn.outgoing.id);
        await addMany(turn.products[0], many);
      } else if (turn.action === "remove" && turn.outgoing) {
        const gone = turn.outgoing;
        const held = cartNow.current.filter((p) => p.id === gone.id).length;
        // No number named means all of them, because that is what "take the
        // bread out" means to the person saying it.
        const taking = Math.min(turn.quantity ?? held, held);
        for (let i = 0; i < taking; i += 1) removeFromCart(gone.id);

        const left = cartNow.current;
        const total = left.reduce((sum, p) => sum + payCents(p), 0);
        const still = left.filter((p) => p.id === gone.id).length;
        const name = gone.name.replace(/\s+-\s+/g, ", ");
        await say(
          held === 0
            ? `The ${name} was not in your cart.`
            : still
              ? `Took ${taking} out. There ${still === 1 ? "is" : "are"} still ${still} ${name} in there.`
              : `Done \u2014 the ${name} is out of your cart.`,
          left.length
            ? `${left.length} ${left.length === 1 ? "item" : "items"}, $${(total / 100).toFixed(2)}.`
            : "Your cart is empty."
        );
      } else if (turn.action === "clear") {
        const had = cartNow.current.length;
        emptyCart();
        await say(
          had ? "Right \u2014 your cart is empty again." : "Your cart is already empty.",
          "Start wherever you like."
        );
      } else if (turn.action === "checkout") {
        const held = cartNow.current;
        showCheckout();
        if (!held.length) {
          await say("There's nothing in your cart yet.", "Ask me for a grocery and I'll pull it up.");
        } else {
          const total = held.reduce((sum, p) => sum + payCents(p), 0);
          const saved = held.reduce((sum, p) => sum + Math.max(0, p.priceCents - payCents(p)), 0);
          await say(
            `That's ${held.length} ${held.length === 1 ? "item" : "items"}, $${(total / 100).toFixed(
              2
            )}${
              saved > 0 ? `, and this week's ad saved you $${(saved / 100).toFixed(2)}` : ""
            }. Shall I place it?`,
            "Say \u201Cokay, we\u2019ll take it\u201D, or keep shopping."
          );
        }
      } else if (turn.action === "order") {
        const held = cartNow.current;
        if (!held.length) {
          showCheckout();
          await say("There's nothing to order yet.", "Ask me for a grocery and I'll pull it up.");
        } else {
          const total = held.reduce((sum, p) => sum + payCents(p), 0);
          const already = orderRef.current;
          if (!already) placeOrder();
          const number = orderRef.current;
          await say(
            already
              ? `That one's already in \u2014 order ${already}.`
              : `Done. Order ${number}, $${(total / 100).toFixed(
                  2
                )}, and it'll be ready for pickup. Thanks very much.`,
            `Order ${number}.`
          );
        }
      } else {
        await say(turn.say, turn.hint);
      }

      // Clear only once the answer is out, so the shopper sees what was heard
      // while it is being handled, and a second request starts from empty.
      setQuery("");
      exitBusy();
      log("done", turn.action);
    },
    [addMany, addProduct, cart, enterBusy, exitBusy, merchProducts, onTheList, emptyCart, removeFromCart, say, view]
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
    // Browsing a whole aisle is not asking for thirty things. Only a shelf small
    // enough to have been a choice goes on the list they are working through.
    if (picked.length <= 8) setRequested((was) => dedupe([...was, ...picked]));
    setMerchHeading(headingFor((aisle as ShelfId) || (picked[0].category as ShelfId), picked));
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
    // Neither the opening spread nor the checkout page is a real aisle, so both
    // count as standing nowhere in particular.
    const standing =
      viewNow.current === "staples" || viewNow.current === "checkout" ? null : viewNow.current;
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
    setMerchHeading(headingFor(view, products));
    /*
     * Only what changed on screen. The store and every aisle's notes are in the
     * session now, so repeating them here would send the same fifteen hundred
     * tokens back on every search for nothing.
     */
    return `on the shelf now: ${productsForModel(products)}`;
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

  const emptyCartForModel = useCallback((): string => {
    const had = cartNow.current.length;
    emptyCart();
    return had ? `emptied the cart. 0 items $0.00.` : "the cart was already empty";
  }, [emptyCart]);

  const tools = useRef({
    findForModel,
    showProducts,
    addToCart,
    removeFromCart,
    replaceInCart,
    emptyCartForModel,
    showCheckout,
    placeOrder
  });
  useEffect(() => {
    tools.current = {
      findForModel,
      showProducts,
      addToCart,
      removeFromCart,
      replaceInCart,
      emptyCartForModel,
      showCheckout,
      placeOrder
    };
  }, [
    findForModel,
    showProducts,
    addToCart,
    removeFromCart,
    replaceInCart,
    emptyCartForModel,
    showCheckout,
    placeOrder
  ]);

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
          removeFromCart: (id, howMany) => tools.current.removeFromCart(id, howMany),
          emptyCart: () => tools.current.emptyCartForModel(),
          replaceInCart: (outId, inId) => tools.current.replaceInCart(outId, inId),
          showCheckout: () => tools.current.showCheckout(),
          placeOrder: () => tools.current.placeOrder()
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
          },
          onSaid: (text) => {
            setPrompt(text);
            setHint("Just talk \u2014 I'm listening.");
          },
          onModel: (name) => setBrain(name),
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
   * The running cost of the live line, metered and reported and nothing else.
   *
   * This used to close the line when the basket had not earned enough talking.
   * That is a defensible thing to sell and an indefensible thing to demo: an
   * empty cart buys about ninety seconds, so anyone actually testing it — asking
   * what the milk is like, changing their mind twice, arguing — got hung up on
   * mid-thought and moved to typing. From the outside that is exactly what a
   * broken live model looks like, so the meter was making the demo lie about the
   * product it exists to show.
   *
   * The numbers still run, and the diagnostics panel still reports them, because
   * a store does need the cost as a bounded line item. It just does not get a
   * vote on whether the conversation continues.
   */
  useEffect(() => {
    if (!liveOn) return;
    const id = window.setInterval(() => {
      log("voice spend", money(budgetNow(cartTotalCents).spent));
    }, 30000);
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
    // Turning it off is only ever turning it off.
    if (voiceMode) {
      cancelSpeech();
      setVoiceMode(false);
      return;
    }

    /*
     * Turning it back on tries GPT's live line again.
     *
     * It did not, and that was the whole of the complaint. One dropped
     * connection set fallback for the session, and after that the mic could
     * only toggle the browser's own speech recognition — so somebody who
     * asked for Realtime, got a blip, and pressed the button again stayed on
     * the typed path until they reloaded, with nothing saying so. A blip is
     * not a verdict. An empty balance, a missing key and a browser with no
     * WebRTC are verdicts, and those are the only reasons to stop trying.
     */
    if (outOfCredit.current || noKey.current || !realtimeSupported()) {
      if (!voiceAvailable) return;
      cancelSpeech();
      setVoiceMode(true);
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
    noKey.current = false;
    setEngine("off");
    setBrain(undefined);
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
    setOrderNumber(null);
    orderRef.current = null;
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
                  brain={brain}
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
            cart={cart}
            orderNumber={orderNumber}
            onProductImage={setProductImage}
            onAdd={(p) => void addProduct(p)}
            onPlaceOrder={() => void placeOrderAloud()}
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
