import { narrowShelf, shelfById, shelves, type ShelfId } from "@/data/dierbergs-catalogue";
import { staplesProducts, type DemoProduct } from "@/data/dierbergs-demo-products";
import { parseRequest } from "./dierbergs-demo-intents";

/**
 * What the shopper's words came to.
 *
 * The model and the local parser both produce this, so the demo has one way of
 * acting on a turn no matter which one answered.
 */
export type Turn = {
  action: "show" | "add" | "chat";
  /** The aisle to put on the shelf. */
  aisle: ShelfId | "staples" | null;
  /** Products to show, or the single one to add. */
  products: DemoProduct[];
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

// Only what the model needs to choose. Sending images and keywords would cost
// tokens to say nothing: keywords exist for the parser's benefit, not a model's.
const AISLE_PAYLOAD = shelves.map((shelf) => ({
  id: shelf.id,
  name: shelf.label,
  products: shelf.products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    kind: p.subcategory,
    also: p.type?.length ? p.type : undefined,
    form: p.form,
    size: p.size,
    price: p.price,
    diet: p.dietary?.length ? p.dietary : undefined
  }))
}));

type Spoken = { role: "user" | "assistant"; content: string };

const history: Spoken[] = [];

export function forgetConversation(): void {
  history.length = 0;
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
        aisles: AISLE_PAYLOAD,
        showing: context.showing.map((p) => p.id),
        cart: context.cart.map((p) => p.id),
        asked: context.onList.map((p) => p.id),
        history
      })
    }).finally(() => clearTimeout(timer));

    if (!response.ok) throw new Error(`understand ${response.status}`);
    const body = await response.json();

    const products = (body.products as string[])
      .map((id) => everyProduct.get(id))
      .filter((p): p is DemoProduct => Boolean(p));

    // A model that says "add" without naming a product has not actually
    // chosen one, and guessing is how a demo puts the wrong thing in the cart.
    const action: Turn["action"] =
      body.action === "add" && products.length !== 1 ? "show" : body.action;

    remember(said, body.say);

    return {
      action,
      aisle: body.aisle ?? null,
      products,
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

const AISLE_NAMES = shelves.map((s) => s.label);
const AISLE_LIST = `${AISLE_NAMES.slice(0, -1).join(", ")} or ${AISLE_NAMES.at(-1)}`;

/** The parser, in the same shape, for when the model cannot be reached. */
function locally(said: string, context: TurnContext): Turn {
  const req = parseRequest(said, context.current);
  const base = { source: "local" as const, products: [] as DemoProduct[], aisle: null };

  switch (req.intent) {
    case "SHOW":
    case "ADD": {
      const shelf = shelfById(req.shelf);
      if (!shelf) break;
      const picked = narrowShelf(shelf, req.text);

      // "The cheese" with four cheddars showing means the one they already
      // asked for. Only unambiguous because there is exactly one of them.
      const already = context.onList.filter((p) => p.category === shelf.id);
      const one = picked.length === 1 ? picked[0] : already.length === 1 ? already[0] : null;

      if (req.intent === "ADD" && one) {
        return {
          action: "add",
          // Leave the shelf be when the choice came from the list rather than
          // the words: they are looking at four cheddars and buying one.
          aisle: picked.length === 1 ? shelf.id : null,
          products: [one],
          say: "",
          hint: "",
          source: "local"
        };
      }

      const single = picked.length === 1 ? picked[0] : null;
      return {
        action: "show",
        aisle: shelf.id,
        products: picked,
        say: single
          ? `${single.shortName}, ${single.price}.`
          : req.intent === "ADD"
            ? `Happy to. ${shelf.ask}`
            : shelf.ask,
        hint: single
          ? "Say \u201Cadd it to my cart\u201D when you want it."
          : req.intent === "ADD"
            ? "Name one and I'll drop it in."
            : shelf.askHint,
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
        say: context.current ? "Which one would you like?" : "Tell me what you're after first.",
        hint: context.current ? "Name it and I'll add it." : "Try: I need milk."
      };

    case "SEVERAL_ITEMS":
      return {
        ...base,
        action: "chat",
        say: "Happy to help. What would you like to get first?",
        hint: "Name one thing at a time and I'll pull it up."
      };

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

  return {
    ...base,
    action: "chat",
    say: `I can bring up ${AISLE_LIST} right now. Which would you like?`,
    hint: "Tell me which and I'll put it on the shelf."
  };
}
