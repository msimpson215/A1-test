import {
  dietaryAdvice,
  asksForSpecial,
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
  | "READ_BACK_CART"
  | "EMPTY_CART"
  | "SEVERAL_ITEMS"
  /** "Is there a special on eggs?" — the week's ad, not the whole aisle. */
  | "SPECIAL"
  /** "Make it the gallon instead" — swap what is in the cart, don't add to it. */
  | "REPLACE"
  /** "Take that back out." */
  | "REMOVE"
  /** "I'm lactose intolerant", "I'm gluten free" — what they cannot eat. */
  | "DIET_ADVICE"
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

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  couple: 2, pair: 2
};

/* Nouns a number can be counting. Deliberately not "eggs" on its own: a dozen
   eggs is one carton, and treating the dozen as a count bought twelve boxes. */
const COUNTABLE =
  "(?:more\\s+)?(?:half\\s+gallons?|gallons?|quarts?|dozens?|cartons?|boxe?s?|packs?|packets?|loave?s?|loaf|blocks?|bags?|bottles?|jugs?|tubs?|slices?|of\\b)";

/**
 * How many of it they asked for, and nothing more.
 *
 * This used to take any number anywhere in the sentence, which is how a
 * complaint became an order. "There are still five things in there, empty means
 * empty" set the milk to five and made the cart bigger than the one being
 * complained about; "that's a hundred and forty four eggs you clown" was read
 * as four. So a number now has to be attached to something you can count, and
 * where a sentence holds more than one, this gives up rather than picks — "make
 * it three of them, no four" is exactly the sentence a regex should decline to
 * have an opinion about, and the model is right there to read it properly.
 */
export function countIn(raw: string): number {
  return countSaid(raw) ?? 1;
}

/** The count they said, or null when they said none, or none that is unambiguous. */
export function countSaid(raw: string): number | null {
  const t = normalizeUtterance(raw)
    // The numbers that describe the product, out of the way first. No trailing
    // word boundary: "2%" is followed by a space, and % is not a word
    // character, so a boundary there never matches and the 2 survives as a
    // quantity — which is how "a gallon of 2% milk" asks for two gallons.
    .replace(/\b\d+\s*(%|percent|count|ct|oz|ounces?|pack|inch)/g, " ");

  const words = Object.keys(NUMBER_WORDS).join("|");
  const found = new Set<number>();
  for (const hit of t.matchAll(new RegExp(`\\b(\\d{1,3}|${words})\\s+${COUNTABLE}`, "g"))) {
    /*
     * A number that is taken back is not a number they asked for. "Make it
     * three of them, no four" is attached and unambiguous by every measure a
     * regex has, and it means four — so where anything after the count reads
     * like a change of mind, this has no opinion and the model reads it.
     */
    if (TAKING_IT_BACK.test(t.slice(hit.index + hit[0].length))) return null;
    const n = NUMBER_WORDS[hit[1]] ?? Number(hit[1]);
    // Nobody talks their way into a hundred cartons; past a dozen it is misheard.
    if (Number.isFinite(n) && n >= 1) found.add(Math.min(n, 12));
  }
  return found.size === 1 ? [...found][0] : null;
}

/* A change of mind, mid-sentence. */
const TAKING_IT_BACK = /\b(no|not|nope|actually|instead|sorry|forget|scratch|make that|i meant)\b/;

// The line between browsing and buying. "I need milk" asks to see milk; only an
// explicit add, a cart, or a plain yes puts something in it. Verbs like "need"
// and "get" stay out of this on purpose — they are how people ask to look.
const ADD_VERB = /\b(add|put|throw|toss|include|purchase|buy)\b/;
const TAKE_PHRASE =
  /\b(ill take|i will take|ill have|ill get|ill grab|give me|i want|id like|i would like)\b/;
const CART_WORD = /\b(cart|basket|bag|checkout)\b/;

/*
 * Reading the cart back. Deliberately narrow: it has to be a question about
 * the cart as a whole, because "add the milk to my cart" also names the cart
 * and must stay a purchase.
 */
/*
 * Starting over. "There are still five things in there, empty means empty" is
 * the sentence this exists for: it names a number, and reading that number as
 * an order made the cart half again bigger than the one being complained about.
 */
const EMPTY_CART =
  /\b(empty|clear|scrap|dump|bin|cancel) (it|them|the (cart|basket|lot|whole lot|order)|my (cart|basket|order)|everything)\b|\bempty means empty\b|\bstart (again|over)\b|\b(scrap|forget) the (lot|whole lot|whole thing)\b|\bnothing in it\b|\btake (it |everything )?all (out|off)\b/;

const READ_BACK_CART =
  /\b(whats|what is|what.s) (in|on) (my|the) (cart|basket|bag)\b|\b(read|run) (back |through )?(my|the) (cart|basket|list)\b|\bhow much (is|does) (my|the) (cart|basket|total)\b|\bmy (cart|basket) total\b|\bwhats my total\b/;
const CONFIRM = /^(yes|yep|yeah|yup|sure|ok|okay|do it|go ahead|please|that one|this one|the first one)\b/;

function wantsToAdd(t: string): boolean {
  return ADD_VERB.test(t) || TAKE_PHRASE.test(t) || CART_WORD.test(t) || CONFIRM.test(t);
}

const HOW =
  /\b(what is this|whats this|how does this work|how do i use|what can you do|who are you|what are you|help|instructions|explain)\b/;

/*
 * Changing their mind, in the three ways people do it.
 *
 * These have to be told apart before anything else, because all three can be
 * the same sentence with one word different. "Make it the gallon" replaces what
 * is in the cart; "just add the chocolate too" adds a second carton; "take that
 * out" empties one. Getting it wrong leaves two cartons in the cart, which is
 * the thing that feels broken.
 */
const ON_TOP = /\b(also|too|as well|in addition|on top of that|both)\b/;
const JUST_ADD = /\bjust (add|put|throw|toss|grab|get)\b/;
const SWAP_WORD = /\b(instead|replace|swap|switch|change (it|that|the order)|make it)\b/;
const SECOND_THOUGHT = /^(no|nope|actually|wait|hold on|hang on|sorry|scratch that|never mind)\b/;
const MEANT = /\b(wanted|meant|want|asked for)\b/;
// "Take it out", but also "take the chocolate milk out" — the thing being
// taken out sits in the middle of the sentence as often as not.
const TAKE_OUT =
  /\b(take\b[\w\s%]{0,28}\bout|remove|get rid of|delete|drop (it|that)|off (my|the) (cart|list)|dont want (it|that)|forget (it|that|the))\b/;

// "Well, no, I wanted the half gallon" — people do not start the sentence at
// the word that matters.
const FILLER = /^(well|so|um|uh|oh|okay|ok|yeah|but|and|hey|i mean|actually then)\s+/;

function changingTheirMind(raw: string): "replace" | "remove" | null {
  let t = raw;
  while (FILLER.test(t)) t = t.replace(FILLER, "");
  // "Well, no, just add chocolate milk" is a second carton, not a swap, even
  // though it opens with a no.
  if (JUST_ADD.test(t) || ON_TOP.test(t)) return null;
  if (TAKE_OUT.test(t)) return "remove";
  if (SWAP_WORD.test(t)) return "replace";
  // "No, I wanted the half gallon."
  if (SECOND_THOUGHT.test(t) && MEANT.test(t)) return "replace";
  return null;
}

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
  // Asking what is in the cart is not asking for a product, and answering it
  // with "which one would you like?" is how the fallback used to reply to a
  // shopper checking their own basket.
  if (READ_BACK_CART.test(text)) return { intent: "READ_BACK_CART", shelf: null, text };
  // Emptying it. Kept above everything that reads a product out of a sentence,
  // because the one thing this must never do is find an order inside a cancel.
  if (EMPTY_CART.test(text)) return { intent: "EMPTY_CART", shelf: null, text };
  if (OPENING_A_LIST.test(text) || GOING_SHOPPING.test(text)) {
    return { intent: "SEVERAL_ITEMS", shelf: null, text };
  }

  const named = shelvesNamedIn(text);
  const aisle = named.length === 1 ? named[0].id : current;

  /*
   * "I'm lactose intolerant", "I'm gluten free" — what they cannot eat. No
   * keyword in any of it matches a product, so it has to be caught before the
   * keyword match, and it is aisle-aware: the lactose answer in front of the
   * cheese is a different and much better answer than the one in front of the
   * milk.
   */
  const advice = dietaryAdvice(text, aisle);
  if (advice) return { intent: "DIET_ADVICE", shelf: advice.aisle, text };

  /*
   * Second thoughts, before anything reads this as a fresh request. Whether
   * there is really something to swap is the cart's business, not the parser's.
   */
  const turned = changingTheirMind(text);
  if (turned) return { intent: turned === "remove" ? "REMOVE" : "REPLACE", shelf: aisle, text };

  /*
   * Asking about the ad comes before asking about the aisle: "is there a
   * special on eggs" is not a request to see the eggs, it is a question with
   * one answer. With no aisle named it is the whole ad, and if they are
   * already looking at an aisle it is that aisle's deal.
   */
  if (asksForSpecial(text)) {
    return { intent: "SPECIAL", shelf: aisle, text };
  }

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
