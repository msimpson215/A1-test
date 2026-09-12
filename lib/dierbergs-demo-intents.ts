import {
  shelfById,
  shelfRespondsTo,
  shelvesNamedIn,
  utteranceNamesMilkSize,
  type ShelfId
} from "@/data/dierbergs-catalogue";

export type DemoIntent =
  /** Put an aisle on the shelf, or narrow the one already there. */
  | "SHOW"
  /** Put a specific product in the cart. */
  | "ADD"
  /** "Add it" with nothing named: only actionable when one thing is showing. */
  | "ADD_CURRENT"
  | "SHOW_STAPLES"
  | "HOW_IT_WORKS"
  | "SEVERAL_ITEMS"
  | "UNKNOWN";

export type ParsedRequest = {
  intent: DemoIntent;
  /** The aisle this is about, named outright or carried over from the shelf. */
  shelf: ShelfId | null;
  /** The words to narrow that aisle by. */
  text: string;
};

export function normalizeUtterance(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    // Apostrophes close up rather than split, so "I'll" reads as one word.
    .replace(/['\u2019]/g, "")
    .replace(/[^\w\s.%$]/g, " ")
    // Keep the dot in "$3.91" but drop the one ending a sentence, which would
    // otherwise stop "two percent." matching the phrase "two percent".
    .replace(/(?<!\d)\.(?!\d)/g, " ")
    .replace(/\s+/g, " ");
}

// The line between browsing and buying. "I need milk" asks to see milk; only an
// explicit add, a cart, or a plain yes puts something in it. Verbs like "need"
// and "get" stay out of this on purpose — they are how people ask to look.
const ADD_VERB = /\b(add|put|throw|toss|include|purchase|buy)\b/;
const TAKE_PHRASE =
  /\b(ill take|i will take|ill have|ill get|ill grab|give me|i want|id like|i would like)\b/;
const CART_WORD = /\b(cart|basket|bag|checkout)\b/;
const CONFIRM = /^(yes|yep|yeah|yup|sure|ok|okay|do it|go ahead|please|that one|this one|the first one)\b/;

function wantsToAdd(t: string): boolean {
  return ADD_VERB.test(t) || TAKE_PHRASE.test(t) || CART_WORD.test(t) || CONFIRM.test(t);
}

const HOW =
  /\b(what is this|whats this|how does this work|how do i use|what can you do|who are you|what are you|help|instructions|explain)\b/;

const OPENING_A_LIST =
  /\b(a few|some|several|couple|handful|bunch)\b.{0,12}\b(items|things|groceries|stuff|products)\b/;
const GOING_SHOPPING = /\b(do some shopping|go shopping|start shopping|my shopping|shopping list|make a list)\b/;

/**
 * Works out what to do with an utterance.
 *
 * `current` is the aisle already on the shelf. It is what lets "two percent"
 * or "the jumbo ones" mean something on their own: an utterance that names no
 * aisle but answers to the one in front of the shopper is narrowing it.
 */
export function parseRequest(raw: string, current: ShelfId | null = null): ParsedRequest {
  const text = normalizeUtterance(raw);

  if (HOW.test(text)) return { intent: "HOW_IT_WORKS", shelf: null, text };
  if (OPENING_A_LIST.test(text) || GOING_SHOPPING.test(text)) {
    return { intent: "SEVERAL_ITEMS", shelf: null, text };
  }

  const named = shelvesNamedIn(text);
  if (named.length > 1) return { intent: "SHOW_STAPLES", shelf: null, text };
  if (/\b(staples|groceries|basics)\b/.test(text)) {
    return { intent: "SHOW_STAPLES", shelf: null, text };
  }

  if (named.length === 1) {
    return { intent: wantsToAdd(text) ? "ADD" : "SHOW", shelf: named[0].id, text };
  }

  // "A whole gallon" / "half gallon" is milk even when they never say milk.
  // After a half-gallon request, that is how people correct the size.
  if (utteranceNamesMilkSize(text)) {
    return { intent: wantsToAdd(text) ? "ADD" : "SHOW", shelf: "milk", text };
  }

  // No aisle named. If what they said picks something out of the aisle already
  // showing, they are still talking about that aisle.
  const shelf = shelfById(current);
  if (shelf && shelfRespondsTo(shelf, text)) {
    return { intent: wantsToAdd(text) ? "ADD" : "SHOW", shelf: shelf.id, text };
  }

  if (wantsToAdd(text)) return { intent: "ADD_CURRENT", shelf: current, text };

  return { intent: "UNKNOWN", shelf: null, text };
}
