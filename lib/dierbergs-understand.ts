import {
  aisleIndex,
  allSpecialsLine,
  dietaryAdvice,
  findProducts,
  LACTOSE_LINE,
  milkAskedForQuart,
  milkForLactose,
  milkSwapForSize,
  milkTheyMean,
  milkWantedSize,
  narrowShelf,
  payCents,
  shelfById,
  shelves,
  specialFor,
  specialLine,
  specialPriceFor,
  type ShelfId
} from "@/data/dierbergs-catalogue";
import { notesFor } from "@/data/dierbergs-aisle-notes";
import { staplesProducts, type DemoProduct } from "@/data/dierbergs-demo-products";
import { countIn, parseRequest } from "./dierbergs-demo-intents";

/**
 * What the shopper's words came to.
 *
 * The model and the local parser both produce this, so the demo has one way of
 * acting on a turn no matter which one answered.
 */
export type Turn = {
  action: "show" | "add" | "chat" | "replace" | "remove";
  /** The aisle to put on the shelf. */
  aisle: ShelfId | "staples" | null;
  /** Products to show, the one to add, or the one to put in on a replace. */
  products: DemoProduct[];
  /** What leaves the cart on a replace or a remove. */
  outgoing?: DemoProduct;
  /** How many of it, when they asked for a number. One when unsaid. */
  quantity?: number;
  /** Spoken aloud. */
  say: string;
  /** On screen only. */
  hint: string;
  source: "model" | "local";
  model?: string;
};

export type TurnContext = {
  showing: DemoProduct[];
  cart: DemoProduct[];
  /** Everything asked for so far, which is what makes "the cheese" mean one thing. */
  onList: DemoProduct[];
  /** The aisle already on the shelf, which is what makes "the jumbo ones" mean something. */
  current: ShelfId | null;
};

const ENDPOINT = process.env.NEXT_PUBLIC_UNDERSTAND_ENDPOINT || "/api/understand";
const TIMEOUT_MS = 6000;

const everyProduct = new Map<string, DemoProduct>();
for (const shelf of shelves) {
  for (const product of shelf.products) everyProduct.set(product.id, product);
}
for (const product of staplesProducts) everyProduct.set(product.id, product);

/*
 * What the model is given to choose from.
 *
 * Only what it needs to choose: images and keywords would cost tokens to say
 * nothing, since keywords exist for the parser's benefit rather than a model's.
 *
 * A shortlist, not the store. Every product costs about fifty tokens described
 * this way, so a hundred of them is a big prompt and forty thousand is not a
 * prompt at all. The search finds the handful this sentence could be about, and
 * that is what goes over — which is the same cost whatever size the store is.
 */
function payload(products: DemoProduct[]) {
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    kind: p.subcategory,
    also: p.type?.length ? p.type : undefined,
    form: p.form,
    size: p.size,
    price: p.price,
    aisle: p.category,
    // Only ever set on the one product per aisle that is on the ad, so the
    // model cannot decide anything else is a deal.
    deal: specialPriceFor(p.id) ?? undefined,
    diet: p.dietary?.length ? p.dietary : undefined
  }));
}

function uniqueById(products: DemoProduct[]): DemoProduct[] {
  const seen = new Set<string>();
  return products.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

type Spoken = { role: "user" | "assistant"; content: string };

const history: Spoken[] = [];

/*
 * How many times in a row they have moved the same item.
 *
 * Two changes of mind is a person deciding. Four is nobody deciding, and
 * swapping the cart a fourth time helps no one, so the count is what tells the
 * shopper it is time to stop and ask.
 */
let swaps = 0;
let swapping: ShelfId | null = null;

export function forgetConversation(): void {
  history.length = 0;
  swaps = 0;
  swapping = null;
}

/** Everything the store stocks, by the id the model chooses it with. */
export function productById(id: string): DemoProduct | undefined {
  return everyProduct.get(id);
}

/**
 * Works out what the shopper wants.
 *
 * The model does the understanding. It is the only thing that copes with the
 * way people actually talk — plurals, corrections, "not the eighteen", asking
 * what the store has rather than for a product. The parser underneath is a
 * safety net for a dropped connection, not the plan.
 */
export async function understand(said: string, context: TurnContext): Promise<Turn> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        said,
        // The aisle index is cheap and constant. The shortlist is what this
        // sentence could be about, plus everything already in play, so "the
        // other one" and "take the cheddar out" still have something to mean.
        index: aisleIndex(),
        choices: payload(
          uniqueById([
            ...findProducts(said, context.current, 12).products,
            ...context.showing,
            ...context.cart,
            ...context.onList
          ])
        ),
        // What someone who works this aisle knows, for the aisle in play only.
        notes: notesFor(findProducts(said, context.current, 12).aisle ?? context.current),
        showing: context.showing.map((p) => p.id),
        cart: context.cart.map((p) => p.id),
        asked: context.onList.map((p) => p.id),
        history
      })
    }).finally(() => clearTimeout(timer));

    if (!response.ok) throw new Error(`understand ${response.status}`);
    const body = await response.json();

    let products = (body.products as string[])
      .map((id) => everyProduct.get(id))
      .filter((p): p is DemoProduct => Boolean(p));

    /*
     * The shelf has to follow the words.
     *
     * Told "I'm lactose intolerant", the model reliably says the right thing
     * and then, often enough to matter, forgets to change the screen — so the
     * shopper hears about four cartons of milk while looking at a box of eggs.
     * This does not argue with the model, which is what made the old size
     * guardrail so infuriating; it only fills in the shelf the model's own
     * answer was about.
     */
    let aisle: Turn["aisle"] = body.aisle ?? null;
    const advice = dietaryAdvice(said, context.current);
    /*
     * Only when the model is showing or talking. If it decided to put
     * something in the cart, that came from the shopper and is none of this
     * code's business.
     */
    if (advice && (body.action === "show" || body.action === "chat")) {
      products = advice.products;
      aisle = advice.aisle;
    }

    const outgoing = body.remove ? everyProduct.get(String(body.remove)) : undefined;

    // A model that says "add" without naming a product has not actually
    // chosen one, and guessing is how a demo puts the wrong thing in the cart.
    // Same for a swap with nothing to swap out, or with nothing to put in.
    let action: Turn["action"] = body.action;
    if ((action === "add" || action === "replace") && products.length !== 1) action = "show";
    if ((action === "replace" || action === "remove") && !outgoing) {
      action = action === "replace" ? "add" : "chat";
    }

    remember(said, body.say);

    /*
     * A number they actually said, kept sane. Nobody talks their way into a
     * hundred cartons, and a model that returns one has misread the sentence,
     * so it is capped rather than trusted.
     */
    const asked = Number(body.quantity);
    const quantity = Number.isFinite(asked) ? Math.min(Math.max(Math.round(asked), 1), 12) : 1;

    return {
      action,
      aisle,
      products,
      outgoing,
      quantity,
      say: body.say,
      hint: body.hint,
      source: "model",
      model: body.model
    };
  } catch {
    const turn = locally(said, context);
    remember(said, turn.say);
    return turn;
  }
}

function remember(said: string, reply: string): void {
  history.push({ role: "user", content: said }, { role: "assistant", content: reply });
  // Enough for "the cheapest one" to refer back, short enough to stay quick.
  if (history.length > 12) history.splice(0, history.length - 12);
}

/**
 * How to name a carton in a conversation about sizes.
 *
 * The short name drops the size — "Dierbergs Whole Milk" — which is the one
 * thing they are choosing between, so a swap has to say the long one.
 */
function sizeful(product: DemoProduct): string {
  return product.name.replace(/\s+-\s+/g, ", ");
}

/** The one of theirs a correction is about: the last of that aisle they bought. */
function lastFromCart(cart: DemoProduct[], aisle: ShelfId | null): DemoProduct | null {
  const mine = aisle ? cart.filter((p) => p.category === aisle) : cart;
  return mine.length ? mine[mine.length - 1] : null;
}

function dedupeById(products: DemoProduct[]): DemoProduct[] {
  const seen = new Set<string>();
  return products.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

const AISLE_NAMES = shelves.map((s) => s.label);
const AISLE_AND = `${AISLE_NAMES.slice(0, -1).join(", ")} and ${AISLE_NAMES.at(-1)}`;

/** The parser, in the same shape, for when the model cannot be reached. */
function locally(said: string, context: TurnContext): Turn {
  const req = parseRequest(said, context.current);
  const base = { source: "local" as const, products: [] as DemoProduct[], aisle: null };
  // Anything that is not another correction ends the run of them.
  if (req.intent !== "REPLACE") {
    swaps = 0;
    swapping = null;
  }

  /*
   * "No, I meant rye" is a correction when a loaf is already in the cart and
   * plain browsing when nothing is. With an empty cart it must still narrow
   * the shelf to the rye rather than falling back to the whole aisle, or a
   * shopper who changes their mind before buying anything gets less than one
   * who never spoke.
   */
  if (req.intent === "REPLACE" && !lastFromCart(context.cart, req.shelf)) {
    req.intent = "SHOW";
  }

  switch (req.intent) {
    case "SHOW":
    case "ADD": {
      const shelf = shelfById(req.shelf);
      if (!shelf) break;
      const picked = narrowShelf(shelf, req.text);

      // "The cheese" with four cheddars showing means the one they already
      // asked for. Only unambiguous because there is exactly one of them.
      const already = context.onList.filter((p) => p.category === shelf.id);
      // "I'll take the half gallon" is a decision, not a question. A size names
      // one carton: the store's own, in the fat they said.
      const bySize =
        shelf.id === "milk" && req.intent === "ADD" && picked.length !== 1
          ? milkTheyMean(req.text)
          : null;
      /*
       * A brand said on its own, while a shelf is up, means the one on the
       * shelf. "The Cabot, put it in the cart" narrows to two Cabots across the
       * whole cheese aisle and so used to buy neither, but only one of them was
       * on screen — and a shopper naming what they are looking at should not
       * have to describe it more fully than the shelf already does.
       */
      const onScreen = picked.filter((p) => context.showing.some((s) => s.id === p.id));
      const one =
        picked.length === 1
          ? picked[0]
          : bySize ??
            (onScreen.length === 1 ? onScreen[0] : already.length === 1 ? already[0] : null);

      if (req.intent === "ADD" && one) {
        return {
          action: "add",
          quantity: countIn(req.text),
          // Leave the shelf be when the choice came from the list rather than
          // the words: they are looking at four cheddars and buying one. A
          // size, though, is words, and the carton has to be on screen to fly
          // out of it.
          aisle: picked.length === 1 || bySize ? shelf.id : null,
          products: [one],
          say: "",
          hint: "",
          source: "local"
        };
      }

      const single = picked.length === 1 ? picked[0] : null;
      const quart = shelf.id === "milk" && milkAskedForQuart(req.text);
      const size = shelf.id === "milk" ? milkWantedSize(req.text) : null;
      return {
        action: "show",
        aisle: shelf.id,
        products: picked,
        say: quart
          ? "We don't have a quart of the Dierbergs. Gallon or half gallon?"
          : single
            ? `${single.shortName}, ${single.price}.`
            : size === "half gallon"
              ? "Here are the half gallons."
              : size === "gallon"
                ? "Here are the gallons."
                : req.intent === "ADD"
                  ? `Happy to. ${shelf.ask}`
                  : shelf.ask,
        hint: quart
          ? "Name a gallon or a half gallon, or say if you want another brand."
          : single
            ? "Say \u201Cadd it to my cart\u201D when you want it."
            : size
              ? "Say which one, or add it from the card."
              : req.intent === "ADD"
                ? "Name one and I'll drop it in."
                : shelf.askHint,
        source: "local"
      };
    }

    /*
     * The week's ad. Put the one item up on its own and offer it, so a plain
     * "yes" afterwards has exactly one thing to mean. With no aisle in play,
     * read the four out and let them pick.
     */
    case "SPECIAL": {
      const shelf = shelfById(req.shelf);
      const found = shelf ? specialFor(shelf.id) : null;
      if (!shelf || !found) {
        return {
          ...base,
          action: "chat",
          say: allSpecialsLine(),
          hint: "Ask about any of those and I'll pull it up."
        };
      }
      return {
        action: "show",
        aisle: shelf.id,
        products: [found.product],
        say: specialLine(shelf.id),
        hint: `On special through ${found.special.through}. Say yes and I'll add it.`,
        source: "local"
      };
    }

    /*
     * "Make it the gallon instead."
     *
     * One thought, so it is one move: the old carton comes out as the new one
     * goes in. Adding without removing is what left a shopper who said two
     * sizes holding both.
     */
    case "REPLACE": {
      const shelf = shelfById(req.shelf);
      const going = lastFromCart(context.cart, req.shelf);
      // Nothing of theirs to swap: they are choosing, not correcting.
      if (!shelf || !going) break;

      const picked = narrowShelf(shelf, req.text);
      const size = shelf.id === "milk" ? milkWantedSize(req.text) : null;
      const coming =
        picked.length === 1
          ? picked[0]
          : // "The gallon instead" is this milk in that size, not every gallon
            // in the case.
            size && size !== "quart"
            ? milkSwapForSize(going, size)
            : null;

      if (!coming) {
        return {
          action: "show",
          aisle: shelf.id,
          products: picked,
          say:
            size === "quart"
              ? `We don't have a quart of the Dierbergs. You've got the ${sizeful(going)} \u2014 keep it, or go up to the gallon?`
              : `You've got the ${sizeful(going)}. What would you like instead?`,
          hint: "Name the one you want and I'll swap it.",
          source: "local"
        };
      }

      if (coming.id === going.id) {
        return {
          ...base,
          action: "chat",
          say: `That's the one you've got \u2014 the ${sizeful(going)} is already in your cart.`,
          hint: "Nothing to change."
        };
      }

      swaps = swapping === shelf.id ? swaps + 1 : 1;
      swapping = shelf.id;

      // Third turnaround on the same aisle. Stop moving it and let them think.
      if (swaps >= 3) {
        // Asked once. Whatever they say next is honoured rather than met with
        // the same line again.
        swaps = 0;
        swapping = null;
        return {
          action: "show",
          aisle: shelf.id,
          products: dedupeById([going, coming, ...picked]),
          say: `I'm sorry \u2014 I want to get this right rather than keep swapping. You've got the ${sizeful(going)}. Take your time and tell me which one you want, and I'll sort the cart out then.`,
          hint: "I'll wait. Name the one you want.",
          source: "local"
        };
      }

      return {
        action: "replace",
        aisle: shelf.id,
        products: [coming],
        outgoing: going,
        say: "",
        hint: "",
        source: "local"
      };
    }

    /** "Take that back out." */
    case "REMOVE": {
      // Named it? Take that one, not whatever went in last: a cart with the
      // chocolate and the half gallon in it has two right answers otherwise.
      const shelf = shelfById(req.shelf);
      const named = shelf ? narrowShelf(shelf, req.text) : [];
      const spoken =
        named.length === 1 ? context.cart.find((p) => p.id === named[0].id) ?? null : null;
      const going = spoken ?? lastFromCart(context.cart, req.shelf);
      if (!going) {
        return {
          ...base,
          action: "chat",
          say: context.cart.length
            ? "Which one would you like me to take out?"
            : "There's nothing in your cart yet.",
          hint: context.cart.length ? "Name it and it's gone." : "Ask me for a grocery to start."
        };
      }
      return {
        ...base,
        action: "remove",
        outgoing: going,
        say: "",
        hint: ""
      };
    }

    /*
     * "I'm lactose intolerant." "I'm gluten free." "I'm doing keto."
     *
     * Not a doctor and not going to pretend: say what each one is and let them
     * choose. One of each kind, because lactose free and a2 are different
     * things, and gluten free and low carb are different things, and the
     * difference is the useful part.
     */
    case "DIET_ADVICE": {
      // Aisle-aware, and the aisle the parser settled on is the one to answer in.
      const advice = dietaryAdvice(req.text, req.shelf) ?? {
        aisle: "milk" as ShelfId,
        products: milkForLactose(),
        line: LACTOSE_LINE,
        hint: "Lactaid and Prairie Farms: lactose broken down. fairlife: ultra filtered. a2: a2 protein only, not lactose free."
      };
      return {
        action: "show",
        aisle: advice.aisle,
        products: advice.products,
        say: advice.line,
        hint: advice.hint,
        source: "local"
      };
    }

    case "SHOW_STAPLES":
      return {
        ...base,
        action: "show",
        aisle: "staples",
        products: staplesProducts,
        say: "Sure. Here are a few good matches.",
        hint: "Tell me which one to add."
      };

    case "ADD_CURRENT":
      if (context.showing.length === 1) {
        return {
          ...base,
          action: "add",
          products: [context.showing[0]],
          say: "",
          hint: ""
        };
      }
      return {
        ...base,
        action: "chat",
        say: context.current ? "Which one would you like?" : "What can I help you find?",
        hint: context.current ? "Name it and I'll add it." : "Try: I need milk."
      };

    case "SEVERAL_ITEMS":
      return {
        ...base,
        action: "chat",
        say: "Happy to help. What would you like to get first?",
        hint: "Name one thing at a time and I'll pull it up."
      };

    case "READ_BACK_CART": {
      const held = context.cart;
      const total = held.reduce((sum, item) => sum + payCents(item), 0);
      return {
        ...base,
        action: "chat",
        say: held.length
          ? `You have ${held.length} ${held.length === 1 ? "item" : "items"}: ${held
              .map((item) => item.name.replace(/\s+-\s+/g, ", "))
              .join(", ")}. That is $${(total / 100).toFixed(2)}.`
          : "Your cart is empty at the moment.",
        hint: held.length
          ? "Say what else you need, or name something to take out."
          : "Ask for a grocery and the shelves change."
      };
    }

    case "HOW_IT_WORKS":
      return {
        ...base,
        action: "chat",
        say: "Talk to the store the way you'd talk to a person. Ask for a grocery and the shelves change. When you're ready, say add it to my cart.",
        hint: "Ask for a grocery and the shelves change. Narrow it down, then say \u201Cadd it to my cart.\u201D"
      };

    default:
      break;
  }

  // Already looking at an aisle: a size, a correction, or a clipped
  // follow-up is still about that aisle. Dumping milk/eggs/bread/cheese
  // over a "whole gallon" is how this stops sounding like a person.
  if (context.current) {
    const shelf = shelfById(context.current);
    if (shelf) {
      const picked = narrowShelf(shelf, said);
      const quart = shelf.id === "milk" && milkAskedForQuart(said);
      const size = shelf.id === "milk" ? milkWantedSize(said) : null;
      return {
        action: "show",
        aisle: shelf.id,
        products: picked,
        say: quart
          ? "We don't have a quart of the Dierbergs. Gallon or half gallon?"
          : picked.length === 1
            ? `${picked[0].shortName}, ${picked[0].price}.`
            : size === "half gallon"
              ? "Here are the half gallons."
              : size === "gallon"
                ? "Here are the gallons."
                : shelf.id === "milk"
                  ? "Which size — a gallon or a half gallon?"
                  : shelf.ask,
        hint: quart
          ? "Name a gallon or a half gallon, or say if you want another brand."
          : picked.length === 1
            ? "Say \u201Cadd it to my cart\u201D when you want it."
            : size
              ? "Say which one, or add it from the card."
              : shelf.askHint,
        source: "local"
      };
    }
  }

  return {
    ...base,
    action: "chat",
    say: `We've got ${AISLE_AND}. Which of those can I help you with?`,
    hint: "Name one and I'll put it on the shelf."
  };
}
