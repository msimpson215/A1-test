import {
  breadCellExtras,
  cheeseCellExtras,
  eggCellExtras,
  milkCellExtras
} from "./dierbergs-cells";
import {
  breadProducts,
  cheddarProducts,
  eggProducts,
  milkProducts,
  type DemoProduct
} from "./dierbergs-demo-products";

/**
 * One entry per aisle the shopper can ask for.
 *
 * Everything the conversation needs to handle an aisle lives here, so adding
 * one is a matter of writing its products and a few lines of copy. There is no
 * per-aisle branch anywhere in the components or the parser.
 */
export type Shelf = {
  id: ShelfId;
  /** What a shopper calls this aisle. Plurals are handled for you. */
  words: string[];
  /** How the aisle is named back to the shopper. */
  label: string;
  /** Sits above the grid. */
  heading: string;
  /** Said when more than one option is still on the shelf. */
  ask: string;
  askHint: string;
  products: DemoProduct[];
  /**
   * Which products to score against after the shopper has named a kind.
   * Milk's capsule uses this to honour a named size. A bare "I need milk"
   * ignores it and opens on the Dierbergs gallon and half gallon — the
   * money-saving ask — rather than the whole cooler.
   */
  opening?: (text: string, all: DemoProduct[]) => DemoProduct[];
  /** What counts as a different kind on an un-narrowed open. */
  kindOf?: (product: DemoProduct) => string;
  /** Preferred order of those kinds, so rye and bagels are not left off. */
  spread?: string[];
};

export type ShelfId = "milk" | "eggs" | "bread" | "cheese";

/*
 * A cell is the aisle's full depth: the handful of products the demo has
 * always carried, plus everything else the storefront stocks in that
 * category. The originals come first so that a request that names nothing in
 * particular still opens on the familiar ones.
 */
const breadCell = [...breadProducts, ...breadCellExtras];
// Milk is the first capsule: every harvested carton in this list can go in
// the cart. Later aisles get the same treatment; milk is the one we polish.
const milkCell = [...milkProducts, ...milkCellExtras];
const eggCell = [...eggProducts, ...eggCellExtras];
const cheeseCell = [...cheddarProducts, ...cheeseCellExtras];

export const cells: Record<ShelfId, DemoProduct[]> = {
  bread: breadCell,
  milk: milkCell,
  eggs: eggCell,
  cheese: cheeseCell
};

/**
 * This week's ad: one item per cell.
 *
 * The products, their names and their shelf prices come off the storefront
 * like everything else here. The promotion itself — the lower price and the
 * day it ends — is the demo's own ad, because Dierbergs' weekly ad is not in
 * what we harvested. It is written down rather than left to a model so that
 * "is there a special on eggs" gets the same answer twice in a row, and so
 * nothing invents a deal on a product that has none.
 */
export type Special = {
  productId: string;
  /** The ad price, against the product's own price as the "was". */
  nowCents: number;
  /** When it runs out, the way a shopper would hear it. */
  through: string;
  /** Offered in the assistant's own words, so eggs are "those" and a loaf is "it". */
  ask: string;
};

export const specials: Record<ShelfId, Special> = {
  eggs: { productId: "eggs-eb-large-18", nowCents: 549, through: "Saturday", ask: "Want those?" },
  milk: { productId: "dierbergs-whole-gal", nowCents: 349, through: "Saturday", ask: "Want one?" },
  bread: { productId: "natures-own-thick", nowCents: 399, through: "Saturday", ask: "Want it?" },
  cheese: { productId: "sargento-sharp", nowCents: 299, through: "Saturday", ask: "Want it?" }
};

const SPECIAL_ASKED =
  /\b(specials?|sales?|on sale|deals?|discount|coupon|promo|weekly ad|marked down|anything cheap)\b/;

/** "Is there a special on eggs?" — asking about the ad rather than the aisle. */
export function asksForSpecial(text: string): boolean {
  return SPECIAL_ASKED.test(plain(text));
}

export function specialFor(id: ShelfId): { product: DemoProduct; special: Special } | null {
  const special = specials[id];
  const product = cells[id].find((p) => p.id === special.productId);
  return product ? { product, special } : null;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** The ad price for one product, for the card. Null when it is not on the ad. */
export function specialPriceFor(productId: string): string | null {
  for (const special of Object.values(specials)) {
    if (special.productId === productId) return dollars(special.nowCents);
  }
  return null;
}

/**
 * What this actually rings up at.
 *
 * An ad price that the cart ignores is not a special, it is a claim. Every
 * total goes through here so the saving is real at the register.
 */
export function payCents(product: DemoProduct): number {
  for (const special of Object.values(specials)) {
    if (special.productId === product.id) return special.nowCents;
  }
  return product.priceCents;
}

/** What to say when they ask about one aisle's special. */
export function specialLine(id: ShelfId): string {
  const found = specialFor(id);
  if (!found) return "";
  const { product, special } = found;
  return `Yes \u2014 the ${product.shortName} is ${dollars(special.nowCents)} through ${
    special.through
  }, down from ${product.price}. ${special.ask}`;
}

/** What to say when they ask what is on special without naming an aisle. */
export function allSpecialsLine(): string {
  const parts = shelfOrder
    .map((id) => {
      const found = specialFor(id);
      if (!found) return null;
      return `${found.product.shortName} at ${dollars(found.special.nowCents)}`;
    })
    .filter((p): p is string => Boolean(p));
  return `This week: ${parts.join(", ")}. Which of those would you like to see?`;
}

const shelfOrder: ShelfId[] = ["milk", "eggs", "bread", "cheese"];

export const shelves: Shelf[] = [
  {
    id: "milk",
    label: "milk",
    words: ["milk"],
    heading: "Our Dierbergs milk.",
    ask: "Want to save money? Our Dierbergs milk comes in a gallon or a half gallon. Which size?",
    askHint: "Name a size, or say if you want another brand.",
    products: milkCell,
    kindOf: milkKind,
    spread: ["whole", "2%", "1%", "skim", "chocolate", "lactose-free", "organic", "filtered"],
    /*
     * Milk capsule. The cooler has dozens of cartons. A clerk does not dump
     * them on the counter. The opening is the money-saving ask: Dierbergs
     * whole, gallon and half gallon. (The live storefront has no Dierbergs
     * quart.) Prairie Farms, Lactaid, Horizon and the rest are a "something
     * else" away, and every carton that is shown can still go in the cart.
     */
    opening: (text, all) => milkCapsulePool(text, all)
  },
  {
    id: "eggs",
    label: "eggs",
    words: ["egg"],
    heading: "Our eggs.",
    ask: "Dozen or eighteen, large through jumbo, organic or cage-free. Which would you like?",
    askHint: "Name a size, a count or a brand and I'll pull it up.",
    products: eggCell,
    kindOf: eggKind,
    spread: ["large", "extra large", "jumbo", "18", "organic", "cage-free", "hard cooked"]
  },
  {
    id: "bread",
    label: "bread",
    words: ["bread", "loaf", "bagel", "sourdough", "rye", "pumpernickel"],
    heading: "Our bread.",
    ask: "White, wheat, sourdough, rye or bagels. Which would you like?",
    askHint: "Name a kind or a brand \u2014 or ask for the cheapest.",
    products: breadCell,
    spread: ["white", "wheat", "sourdough", "rye", "bagel", "whole grain"]
  },
  {
    id: "cheese",
    label: "cheese",
    words: ["cheddar", "cheese", "swiss", "provolone", "mozzarella"],
    heading: "Our cheese.",
    ask: "Cheddar, Swiss, provolone or mozzarella. Which would you like?",
    askHint: "Name a kind, a brand or how it is cut.",
    products: cheeseCell,
    spread: ["cheddar", "swiss", "provolone", "mozzarella"]
  }
];

/*
 * Speech arrives with capitals and punctuation ("No, I want the half.") and
 * these are also called with raw transcripts from the live voice line, so
 * every one of them folds the words down first rather than trusting a caller
 * to have done it.
 */
function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^\w\s.%$]/g, " ")
    .replace(/(?<!\d)\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mentionsHalfGallon(raw: string): boolean {
  const text = plain(raw);
  // "Half a dozen" is eggs. It is not a milk size.
  if (/\bhalf\s+(a\s+)?dozen\b/.test(text)) return false;
  if (/\b(half[\s-]?gallons?|half a gallon|64 ?oz)\b/.test(text)) return true;
  // "No, I want the half" / "just the half" — they already said milk.
  if (/\b(the half|a half|half one|half size|smaller one)\b/.test(text)) return true;
  if (/\b(want|need|get|got|no)\b.{0,24}\b(the )?half\b/.test(text)) return true;
  return /^(no[ ]+)*(the )?half$/.test(text);
}

function mentionsGallon(raw: string): boolean {
  const text = plain(raw);
  if (mentionsHalfGallon(text)) return false;
  return /\b((whole|full|entire)\s+gallons?|gallons?|128 ?oz|the (big|large) one)\b/.test(text);
}

/** Gallon vs half gallon vs quart, including "the half" with no "milk". */
export function milkWantedSize(text: string): "gallon" | "half gallon" | "quart" | null {
  if (milkAskedForQuart(text)) return "quart";
  if (mentionsHalfGallon(text)) return "half gallon";
  if (mentionsGallon(text)) return "gallon";
  return null;
}

/** Size talk with no "milk" — "a whole gallon", "the half". */
export function utteranceNamesMilkSize(text: string): boolean {
  return milkWantedSize(text) !== null;
}

/** Quart, "a quarter", 32 oz — Dierbergs does not sell a store-brand quart. */
export function milkAskedForQuart(raw: string): boolean {
  return /\b(quarts?|quarter(\s+gallons?)?|32 ?oz)\b/.test(plain(raw));
}

export function milkTurnedDownStore(raw: string): boolean {
  const text = plain(raw);
  return (
    /^(no|nope|nah|no thanks)$/.test(text) ||
    /\b(something else|other milks?|other brands?|different brand|not (the )?(dierbergs|store brand))\b/.test(text)
  );
}

/** Gallon, half gallon or quart, including extras that only record it as form/size. */
function milkJugSize(product: DemoProduct): "gallon" | "half gallon" | "quart" | null {
  if (product.volume === "gallon" || product.volume === "half gallon") return product.volume;
  if (product.form === "gallon" || product.form === "half gallon" || product.form === "quart") {
    return product.form;
  }
  const size = (product.size || "").toLowerCase();
  if (/\b(32\s*(fl\s*)?oz|1\s*qt|quart)\b/.test(size)) return "quart";
  if (/\b(128\s*(fl\s*)?oz|1\s*gal)\b/.test(size)) return "gallon";
  if (/\b(64\s*(fl\s*)?oz|0\.5\s*gal)\b/.test(size)) return "half gallon";
  return null;
}

function isDierbergsWhiteMilk(product: DemoProduct): boolean {
  return (
    product.category === "milk" &&
    product.brand === "Dierbergs" &&
    product.subcategory !== "chocolate" &&
    (product.type ?? []).includes("store brand")
  );
}

const SIZE_ORDER: Array<"gallon" | "half gallon" | "quart"> = ["gallon", "half gallon", "quart"];

/** Dierbergs whole (or the named fat) in the sizes the store actually sells. */
function milkStoreBrandSizes(pool: DemoProduct[], fat = "whole"): DemoProduct[] {
  const ofFat = pool.filter((p) => isDierbergsWhiteMilk(p) && p.subcategory === fat);
  return SIZE_ORDER.map((size) => ofFat.find((p) => milkJugSize(p) === size)).filter(
    (p): p is DemoProduct => Boolean(p)
  );
}

function namedOtherMilkBrand(text: string): boolean {
  return /\b(prairie|lactaid|horizon|fairlife|kalona|organic valley|a2)\b/.test(text);
}

/**
 * Milk that does not agree with them.
 *
 * "I'm lactose intolerant" is not a product request and narrowing the shelf by
 * those words finds nothing, so it needs catching before the keyword match.
 */
export function asksAboutLactose(raw: string): boolean {
  const text = plain(raw);
  return (
    /\blactos/.test(text) ||
    /\b(dairy free|non dairy)\b/.test(text) ||
    /\b(cant|cannot|dont|do not) (drink|have|handle|do) (milk|dairy)\b/.test(text) ||
    /\bmilk (bothers|upsets|hurts|messes with)\b/.test(text)
  );
}

/**
 * The four answers to it, one of each kind, cheapest way in first.
 *
 * Lactose free and a2 are not the same thing and the difference is the useful
 * part, so one of each goes up rather than five cartons of Lactaid.
 */
export function milkForLactose(): DemoProduct[] {
  const wanted = ["milk-lactaid-2", "milk-pf-lf-whole", "milk-fairlife-2", "milk-a2-whole"];
  const milk = shelfById("milk")?.products ?? [];
  return wanted
    .map((id) => milk.find((p) => p.id === id))
    .filter((p): p is DemoProduct => Boolean(p));
}

/**
 * The one carton "the half gallon" means.
 *
 * A size on its own matches a dozen cartons, and asking "which one?" after
 * someone has already told you the size is the kiosk answer. They mean the
 * store's own in that size, in the fat they named if they named one — which is
 * what a person behind the counter would hand them.
 */
export function milkTheyMean(raw: string): DemoProduct | null {
  const size = milkWantedSize(raw);
  if (!size || size === "quart") return null;
  const fat = namedMilkFat(plain(raw));
  const milk = shelfById("milk")?.products ?? [];
  const inSize = milk.filter((p) => milkJugSize(p) === size && isDierbergsWhiteMilk(p));
  if (fat) return inSize.find((p) => p.subcategory === fat) ?? null;
  return inSize.find((p) => p.subcategory === "whole") ?? inSize[0] ?? null;
}

/**
 * The same milk in the size they just asked for.
 *
 * "Make it the gallon instead" means this milk, bigger — not the fourteen
 * gallons in the case. Same brand and same fat, and if that carton does not
 * exist in that size, the store's own in the fat they were drinking.
 */
export function milkSwapForSize(
  going: DemoProduct,
  size: "gallon" | "half gallon" | "quart"
): DemoProduct | null {
  const milk = shelfById("milk")?.products ?? [];
  const inSize = milk.filter((p) => milkJugSize(p) === size);
  const sameCarton = inSize.find(
    (p) => p.brand === going.brand && p.subcategory === going.subcategory
  );
  if (sameCarton) return sameCarton;
  const store = inSize.find(
    (p) => isDierbergsWhiteMilk(p) && p.subcategory === going.subcategory
  );
  return store ?? inSize.find(isDierbergsWhiteMilk) ?? null;
}

/** Said out loud with them. Not advice — what each carton is. */
export const LACTOSE_LINE =
  "I'm not a doctor, so I won't tell you what to drink \u2014 but here's what we carry. " +
  "Lactaid and Prairie Farms are ordinary milk with the lactose already broken down, so they taste like milk. " +
  "fairlife is ultra filtered: lactose free, more protein, less sugar. " +
  "a2 isn't lactose free at all \u2014 it's milk with only the a2 protein, which some people say sits easier. " +
  "Any of those sound right?";

function milkCapsulePool(text: string, all: DemoProduct[]): DemoProduct[] {
  if (milkTurnedDownStore(text)) {
    return all.filter((p) => !isDierbergsWhiteMilk(p));
  }
  if (milkAskedForQuart(text)) {
    return all.filter((p) => isDierbergsWhiteMilk(p) && milkJugSize(p) !== "quart");
  }
  const size = milkWantedSize(text);
  if (size === "half gallon" || size === "gallon") {
    return all.filter((p) => milkJugSize(p) === size);
  }
  return all;
}

/** "Whole gallon" / "full gallon" is the gallon size, not whole-milk fat. */
function milkScoreText(text: string): string {
  return text.replace(/\b(whole|full|entire)\s+(?=gallons?\b)/g, "");
}

function namedMilkFat(text: string): string | null {
  const said = milkScoreText(text);
  for (const [fat, words] of Object.entries(MILK_FAT_WORDS)) {
    if (words.some((word) => containsPhrase(said, word))) return fat;
  }
  return null;
}

/** Several milks of one size — one of each kind, not a single carton. */
function milkSpreadOfSize(pool: DemoProduct[], size: "gallon" | "half gallon"): DemoProduct[] {
  const ofSize = pool.filter((p) => milkJugSize(p) === size);
  return oneOfEachKind({
    ...shelfById("milk")!,
    products: ofSize.length ? ofSize : pool
  });
}

export function shelfById(id: ShelfId | null | undefined): Shelf | null {
  return shelves.find((s) => s.id === id) ?? null;
}

/**
 * Matches the aisle a shopper named. Plurals and possessives are folded in
 * here rather than in each entry, because "what other milks do you have" is
 * how people actually talk and \bmilk\b does not match it.
 */
export function shelfNamedIn(text: string): Shelf | null {
  for (const shelf of shelves) {
    for (const word of shelf.words) {
      if (new RegExp(`\\b${word}(s|es)?\\b`).test(text)) return shelf;
    }
  }
  return null;
}

/** Every aisle the utterance names, so "milk, bread and cheese" is not one. */
export function shelvesNamedIn(text: string): Shelf[] {
  return shelves.filter((shelf) =>
    shelf.words.some((word) => new RegExp(`\\b${word}(s|es)?\\b`).test(text))
  );
}

const CHEAPEST = /\b(cheapest|least expensive|lowest price|budget|on a budget)\b/;
const DEAREST = /\b(most expensive|priciest|dearest|best one|nicest|fanciest)\b/;

/**
 * Narrows an aisle down to what the shopper asked for.
 *
 * Each product is scored by how many of its own keywords appear in what was
 * said, and the best-scoring products survive. Saying more narrows further,
 * which is why "whole" leaves the Dierbergs whole milks and "a gallon"
 * leaves the gallon, without either rule being written down per product.
 */
export function narrowShelf(shelf: Shelf, text: string): DemoProduct[] {
  const pool = shelf.opening ? shelf.opening(text, shelf.products) : shelf.products;

  if (CHEAPEST.test(text)) return [least(pool)];
  if (DEAREST.test(text)) return [most(pool)];

  /*
   * A named milk size is a size, not a prompt to put both jugs back. Asking
   * for a half gallon used to collapse into the Dierbergs gallon-and-half
   * pair (gallon first), which is how "I want the half" still showed a gallon.
   * Honour the size and put several of those cartons on the shelf.
   */
  if (shelf.id === "milk") {
    const size = milkWantedSize(text);
    if (size === "gallon" || size === "half gallon") {
      const fat = namedMilkFat(text);
      const ofSize = pool.filter((p) => milkJugSize(p) === size);
      const inSize = ofSize.length ? ofSize : pool;
      if (fat) {
        const store = inSize.filter((p) => isDierbergsWhiteMilk(p) && p.subcategory === fat);
        if (store.length) return store.slice(0, 8);
        const ofFat = inSize.filter((p) => p.subcategory === fat);
        if (ofFat.length) return ofFat.slice(0, 8);
      }
      if (namedOtherMilkBrand(text)) {
        return inSize.slice(0, 8);
      }
      return milkSpreadOfSize(inSize, size);
    }
  }

  /*
   * Scored by how much of what was said each product accounts for, in
   * characters rather than in words. A cell is deep enough now that counting
   * matches is not enough to separate its products: "borden extra sharp" is
   * two matches for the extra sharp Borden and two for the plain sharp one,
   * because "sharp" sits inside "extra sharp". Weighing the longer phrase
   * higher is what makes the more specific request win.
   */
  const scoredText = shelf.id === "milk" ? milkScoreText(text) : text;

  let best = 0;
  const scored = pool.map((product) => {
    const value = score(product, scoredText);
    best = Math.max(best, value);
    return { product, score: value };
  });
  /*
   * Nothing in the request names a product, so this is the aisle opening.
   * Bread still opens on a spread of kinds. Milk does not dump the cooler:
   * it puts the Dierbergs gallon and half gallon up and asks if they want
   * to save money.
   */
  if (best === 0) {
    if (shelf.id === "milk") {
      if (milkTurnedDownStore(text)) {
        return oneOfEachKind({ ...shelf, products: pool });
      }
      return milkStoreBrandSizes(pool);
    }
    if (shelf.opening && pool.length > 0 && pool.length !== shelf.products.length) {
      return oneOfEachKind({ ...shelf, products: pool });
    }
    return oneOfEachKind(shelf);
  }

  const cap = shelf.id === "milk" ? 8 : 4;
  const hits = scored.filter((s) => s.score === best).map((s) => s.product);
  if (shelf.id === "milk" && !namedOtherMilkBrand(text) && !milkTurnedDownStore(text) && !milkWantedSize(text)) {
    const store = hits.filter(isDierbergsWhiteMilk);
    if (store.length) {
      const fats = [...new Set(store.map((p) => p.subcategory).filter(Boolean))] as string[];
      if (fats.length === 1) return milkStoreBrandSizes(pool, fats[0]);
      return SIZE_ORDER.map((size) => store.find((p) => milkJugSize(p) === size)).filter(
        (p): p is DemoProduct => Boolean(p)
      );
    }
  }
  return hits.slice(0, cap);
}

const SPREAD_CAP = 8;

/** One product per kind, in the aisle's preferred order, up to a full shelf. */
function oneOfEachKind(shelf: Shelf): DemoProduct[] {
  const kindOf = shelf.kindOf ?? ((p) => p.subcategory ?? p.id);
  const firstOf = new Map<string, DemoProduct>();
  for (const product of shelf.products) {
    const kind = kindOf(product);
    if (!firstOf.has(kind)) firstOf.set(kind, product);
  }
  const picked: DemoProduct[] = [];
  for (const kind of shelf.spread ?? []) {
    const product = firstOf.get(kind);
    if (product) picked.push(product);
  }
  for (const product of firstOf.values()) {
    if (!picked.includes(product)) picked.push(product);
  }
  return picked.slice(0, SPREAD_CAP);
}

function hasType(product: DemoProduct, phrase: string): boolean {
  return (product.type ?? []).some((t) => t.includes(phrase));
}

/** Milk kinds the shopper names, not the four fat levels on the store wall. */
function milkKind(product: DemoProduct): string {
  if (product.subcategory === "chocolate") return "chocolate";
  if (hasType(product, "ultra filtered")) return "filtered";
  if (hasType(product, "lactose free")) return "lactose-free";
  if ((product.dietary ?? []).includes("organic")) return "organic";
  if (hasType(product, "a2 protein")) return "a2";
  return product.subcategory ?? product.id;
}

/** Eggs: size, count and how they were raised, or the shelf hides the 18s. */
function eggKind(product: DemoProduct): string {
  if (product.subcategory === "hard cooked") return "hard cooked";
  if (product.count === 18) return "18";
  if (hasType(product, "organic") || (product.dietary ?? []).includes("organic")) {
    return "organic";
  }
  if (hasType(product, "cage free")) return "cage-free";
  return product.subcategory ?? product.id;
}

/** How much of what was said this one product accounts for. */
function score(product: DemoProduct, text: string): number {
  return wordsFor(product)
    .filter((k) => containsPhrase(text, k))
    .reduce((sum, k) => sum + k.length, 0);
}

/** True when the whole phrase appears, so "large" does not match "x-large". */
function containsPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(text);
}

/**
 * Everything a product answers to.
 *
 * Its own keywords plus the attributes that make it what it is, so that a
 * product does not have to repeat "cheddar" in two places to be found by
 * someone asking for cheddar. Written once here rather than once per record.
 */
const MILK_FAT_WORDS: Record<string, string[]> = {
  whole: ["whole", "vitamin d", "full fat"],
  "2%": ["2%", "2 percent", "two percent", "reduced fat"],
  "1%": ["1%", "1 percent", "one percent", "lowfat", "low fat"],
  skim: ["skim", "fat free", "nonfat", "non fat"]
};

function milkSizeWords(product: DemoProduct): string[] {
  const size = milkJugSize(product);
  if (size === "gallon") return ["gallon", "128 oz"];
  if (size === "half gallon") return ["half gallon", "half a gallon", "64 oz"];
  if (size === "quart") return ["quart", "quarter", "32 oz"];
  return [];
}

function brandWords(brand: string): string[] {
  const lower = brand.toLowerCase();
  const skip = new Set(["milk", "bread", "eggs", "cheese", "the", "of", "and"]);
  const parts = lower.split(/\s+/).filter((w) => w.length > 1 && !skip.has(w));
  return [lower, ...parts];
}

function wordsFor(product: DemoProduct): string[] {
  const fat =
    product.category === "milk" && product.subcategory
      ? MILK_FAT_WORDS[product.subcategory] ?? []
      : [];
  return [...new Set([
    ...product.keywords,
    ...fat,
    ...milkSizeWords(product),
    ...(product.brand ? brandWords(product.brand) : []),
    ...(product.subcategory ? [product.subcategory] : []),
    ...(product.form ? [product.form] : []),
    ...(product.type ?? []),
    ...(hasType(product, "a2 protein") ? ["a2"] : []),
    ...(product.dietary ?? []).map((d) => d.replace(/-/g, " "))
  ])];
}

/** True when anything on the shelf answers to what was said. */
export function shelfRespondsTo(shelf: Shelf, text: string): boolean {
  if (CHEAPEST.test(text) || DEAREST.test(text)) return true;
  if (
    shelf.id === "milk" &&
    (milkWantedSize(text) || milkTurnedDownStore(text) || /\bsave money\b/.test(text))
  ) {
    return true;
  }
  return shelf.products.some((p) => wordsFor(p).some((k) => containsPhrase(text, k)));
}

function least(list: DemoProduct[]): DemoProduct {
  return list.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
}

function most(list: DemoProduct[]): DemoProduct {
  return list.reduce((a, b) => (b.priceCents > a.priceCents ? b : a));
}
