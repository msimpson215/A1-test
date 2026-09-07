export type DemoIntent =
  | "SHOW_MILK"
  | "SHOW_BREAD"
  | "SHOW_CHEDDARS"
  | "SHOW_STAPLES"
  | "ADD_MILK"
  | "ADD_BREAD"
  | "ADD_CHEESE"
  | "ADD_CURRENT"
  | "HOW_IT_WORKS"
  | "UNKNOWN";

export type MilkVariety = "whole" | "2%" | "1%" | "skim";
export type MilkVolume = "gallon" | "half gallon";

export type ParsedRequest = {
  intent: DemoIntent;
  /** Set when the shopper named a kind of milk, e.g. "two percent". */
  variety: MilkVariety | null;
  /** Set when the shopper named a jug size. */
  volume: MilkVolume | null;
};

export function normalizeUtterance(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    // Apostrophes close up rather than split, so "I'll" reads as one word.
    .replace(/['\u2019]/g, "")
    .replace(/[^\w\s.%$]/g, " ")
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

function readVariety(t: string): MilkVariety | null {
  if (/\b(whole|vitamin d|full fat|red cap)\b/.test(t)) return "whole";
  if (/\b(2 ?%|2 percent|two percent|reduced fat)\b/.test(t)) return "2%";
  if (/\b(1 ?%|1 percent|one percent|low ?fat|lowfat)\b/.test(t)) return "1%";
  if (/\b(skim|fat ?free|nonfat|non fat|blue cap)\b/.test(t)) return "skim";
  return null;
}

function readVolume(t: string): MilkVolume | null {
  if (/\b(half gallon|half a gallon|halfgallon|64 ?oz|small(er)?)\b/.test(t)) return "half gallon";
  if (/\b(gallon|128 ?oz|big|large|bigger|full size)\b/.test(t)) return "gallon";
  return null;
}

export function parseRequest(raw: string): ParsedRequest {
  const t = normalizeUtterance(raw);
  const variety = readVariety(t);
  const volume = readVolume(t);
  const intent = readIntent(t, variety, volume);
  return { intent, variety, volume };
}

function readIntent(t: string, variety: MilkVariety | null, volume: MilkVolume | null): DemoIntent {
  if (
    /\b(what is this|whats this|how does this work|how do i use|what can you do|who are you|what are you|are you a chatbot|help|instructions|explain)\b/.test(
      t
    )
  ) {
    return "HOW_IT_WORKS";
  }

  const hasMilk = /\bmilk\b/.test(t) || (variety !== null && !/\bcheese|cheddar|bread\b/.test(t));
  const hasBread = /\bbread\b/.test(t);
  const hasCheese = /\b(cheese|cheddar|borden|sargento|cabot|land o lakes)\b/.test(t);
  const named = [hasMilk, hasBread, hasCheese].filter(Boolean).length;

  // Naming one specific cheddar is always a choice, never a browse.
  if (/\b(borden|3.91|391|cheapest|extra sharp)\b/.test(t)) return "ADD_CHEESE";

  if (wantsToAdd(t) && named <= 1) {
    if (hasMilk) return "ADD_MILK";
    if (hasBread) return "ADD_BREAD";
    if (hasCheese) return "ADD_CHEESE";
    return "ADD_CURRENT";
  }

  if (named > 1) return "SHOW_STAPLES";
  if (/\b(staples|groceries|basics)\b/.test(t)) return "SHOW_STAPLES";

  if (hasCheese) return "SHOW_CHEDDARS";
  if (hasMilk) return "SHOW_MILK";
  if (hasBread) return "SHOW_BREAD";

  // "Do you have a smaller one?" while the milk wall is up.
  if (volume !== null) return "SHOW_MILK";

  return "UNKNOWN";
}

/** Kept for callers that only care which branch to take. */
export function parseIntent(raw: string): DemoIntent {
  return parseRequest(raw).intent;
}
