export type DemoIntent =
  | "REQUEST_STAPLES"
  | "REQUEST_CHEDDARS"
  | "ADD_CHEESE"
  | "ADD_MILK"
  | "ADD_BREAD"
  | "CAPABILITIES"
  | "UNKNOWN";

export function normalizeUtterance(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^\w\s.$]/g, " ")
    .replace(/\s+/g, " ");
}

const ADD_VERB = /\b(add|put|take|grab|get|buy|want|need|like|give|throw|include|choose|pick|ill|i'll)\b/;
const CART_WORD = /\b(cart|basket|bag|order)\b/;

function wantsToAdd(t: string): boolean {
  return ADD_VERB.test(t) || CART_WORD.test(t);
}

export function parseIntent(raw: string): DemoIntent {
  const t = normalizeUtterance(raw);

  if (/\b(what can you do|who are you|how does this work|what do you do|help me|are you a chatbot|what are you)\b/.test(t)) {
    return "CAPABILITIES";
  }

  const hasMilk = /\bmilk\b/.test(t);
  const hasBread = /\bbread\b/.test(t);
  const hasCheese = /\b(cheese|cheddar)\b/.test(t);

  // A request naming all three staples is a browse request, never an add.
  if (hasMilk && hasBread && hasCheese) return "REQUEST_STAPLES";
  if (/\b(staples|groceries|basics)\b/.test(t) && !wantsToAdd(t)) return "REQUEST_STAPLES";

  const isBrowsing =
    /\b(show|different|other|kinds|kind|types|options|variety|varieties|have|what|which|else|see|browse|compare)\b/.test(t);
  if (hasCheese && isBrowsing) return "REQUEST_CHEDDARS";

  // Naming a specific cheddar product always means "add that one".
  if (/\b(borden|3\.91|391|cheapest|extra sharp)\b/.test(t)) return "ADD_CHEESE";

  if (hasCheese && !hasMilk && !hasBread && wantsToAdd(t)) return "ADD_CHEESE";
  if (hasMilk && !hasBread && !hasCheese && wantsToAdd(t)) return "ADD_MILK";
  if (hasBread && !hasMilk && !hasCheese && wantsToAdd(t)) return "ADD_BREAD";

  // Bare product names once results are on screen still read as a choice.
  if (hasCheese && !hasMilk && !hasBread) return "ADD_CHEESE";
  if (hasMilk && !hasBread && !hasCheese) return "ADD_MILK";
  if (hasBread && !hasMilk && !hasCheese) return "ADD_BREAD";

  return "UNKNOWN";
}
