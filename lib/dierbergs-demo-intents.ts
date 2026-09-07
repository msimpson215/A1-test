export type DemoIntent =
  | "SHOW_MILK"
  | "SHOW_BREAD"
  | "SHOW_CHEDDARS"
  | "SHOW_STAPLES"
  | "ADD_MILK"
  | "ADD_BREAD"
  | "ADD_CHEESE"
  | "ADD_CURRENT"
  | "CAPABILITIES"
  | "UNKNOWN";

export function normalizeUtterance(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    // Apostrophes close up rather than split, so "I'll" reads as one word.
    .replace(/['\u2019]/g, "")
    .replace(/[^\w\s.$]/g, " ")
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

const BROWSE_WORD =
  /\b(show|different|other|kinds|kind|types|sorts|options|variety|varieties|have|what|which|else|see|browse|compare|look|find|need|want|got)\b/;

function wantsToAdd(t: string): boolean {
  return ADD_VERB.test(t) || TAKE_PHRASE.test(t) || CART_WORD.test(t) || CONFIRM.test(t);
}

export function parseIntent(raw: string): DemoIntent {
  const t = normalizeUtterance(raw);

  if (/\b(what can you do|who are you|how does this work|what do you do|are you a chatbot|what are you)\b/.test(t)) {
    return "CAPABILITIES";
  }

  const hasMilk = /\bmilk\b/.test(t);
  const hasBread = /\bbread\b/.test(t);
  const hasCheese = /\b(cheese|cheddar|borden|sargento|cabot|land o lakes)\b/.test(t);
  const named = [hasMilk, hasBread, hasCheese].filter(Boolean).length;

  // Naming one specific cheddar is always a choice, never a browse.
  if (/\b(borden|3.91|391|cheapest|extra sharp)\b/.test(t)) return "ADD_CHEESE";

  if (wantsToAdd(t) && named <= 1) {
    if (hasMilk) return "ADD_MILK";
    if (hasBread) return "ADD_BREAD";
    if (hasCheese) return "ADD_CHEESE";
    // "add it to my cart" — whatever is on screen.
    return "ADD_CURRENT";
  }

  if (named > 1) return "SHOW_STAPLES";
  if (/\b(staples|groceries|basics)\b/.test(t)) return "SHOW_STAPLES";

  if (hasCheese) return "SHOW_CHEDDARS";
  if (hasMilk) return "SHOW_MILK";
  if (hasBread) return "SHOW_BREAD";

  // A bare "show me what you've got" with nothing named.
  if (BROWSE_WORD.test(t) && /\b(everything|anything|something)\b/.test(t)) return "SHOW_STAPLES";

  return "UNKNOWN";
}
