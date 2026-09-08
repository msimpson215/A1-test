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
   * Milk uses this so "two percent" lands on the store-brand gallon rather
   * than every 2% carton in the cooler. A bare "I need milk" ignores it and
   * opens on the spread instead — otherwise the shelf is the same four
   * gallons it has always been.
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
const milkCell = [...milkProducts, ...milkCellExtras];
const eggCell = [...eggProducts, ...eggCellExtras];
const cheeseCell = [...cheddarProducts, ...cheeseCellExtras];

export const cells: Record<ShelfId, DemoProduct[]> = {
  bread: breadCell,
  milk: milkCell,
  eggs: eggCell,
  cheese: cheeseCell
};

export const shelves: Shelf[] = [
  {
    id: "milk",
    label: "milk",
    words: ["milk"],
    heading: "Our milk.",
    ask: "Whole, two percent, lactose-free, organic or chocolate. Which would you like?",
    askHint: "Name a kind, a brand or a size.",
    products: milkCell,
    kindOf: milkKind,
    spread: ["whole", "2%", "chocolate", "lactose-free", "organic", "filtered", "a2", "1%"],
    /*
     * The store's own milk is the same four cartons in two jug sizes, and
     * putting all eight up at once is not a choice, it is a wall. So the
     * shelf shows one jug size at a time, and a plain "whole milk" answers
     * with the store's own carton rather than every whole milk in the cell.
     *
     * The rest of the cell — the lactose free, the organics, the brands — is
     * reached by asking for it: when something off the wall answers the
     * question better than the wall can, the whole aisle opens up.
     */
    opening: (text, all) => {
      const size = mentionsHalfGallon(text) ? "half gallon" : "gallon";
      const inSize = all.filter((p) => !p.volume || p.volume === size);
      const wall = inSize.filter((p) => p.volume);
      const beyond = inSize.filter((p) => !p.volume);
      return bestScore(beyond, text) > bestScore(wall, text) ? inSize : wall;
    }
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

function mentionsHalfGallon(text: string): boolean {
  return /\b(half gallon|half a gallon|64 ?oz|small(er)?)\b/.test(text);
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

const CHEAPEST = /\b(cheapest|least expensive|lowest price|budget|save money|on a budget)\b/;
const DEAREST = /\b(most expensive|priciest|dearest|best one|nicest|fanciest)\b/;

/**
 * Narrows an aisle down to what the shopper asked for.
 *
 * Each product is scored by how many of its own keywords appear in what was
 * said, and the best-scoring products survive. Saying more narrows further,
 * which is why "whole" leaves two jug sizes and "whole milk, a gallon" leaves
 * one, without either rule being written down anywhere.
 */
export function narrowShelf(shelf: Shelf, text: string): DemoProduct[] {
  const pool = shelf.opening ? shelf.opening(text, shelf.products) : shelf.products;

  if (CHEAPEST.test(text)) return [least(pool)];
  if (DEAREST.test(text)) return [most(pool)];

  /*
   * Scored by how much of what was said each product accounts for, in
   * characters rather than in words. A cell is deep enough now that counting
   * matches is not enough to separate its products: "borden extra sharp" is
   * two matches for the extra sharp Borden and two for the plain sharp one,
   * because "sharp" sits inside "extra sharp". Weighing the longer phrase
   * higher is what makes the more specific request win.
   */
  let best = 0;
  const scored = pool.map((product) => {
    const value = score(product, text);
    best = Math.max(best, value);
    return { product, score: value };
  });
  /*
   * Nothing in the request names a product, so this is the aisle opening.
   * Use the whole cell, not milk's four-gallon wall: "I need bread" has to
   * put rye and bagels on the shelf, and "I need milk" has to put more than
   * the four Dierbergs gallons the demo has always shown.
   */
  if (best === 0) return oneOfEachKind(shelf);

  return scored
    .filter((s) => s.score === best)
    .map((s) => s.product)
    .slice(0, 4);
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

function bestScore(list: DemoProduct[], text: string): number {
  return list.reduce((top, p) => Math.max(top, score(p, text)), 0);
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
function wordsFor(product: DemoProduct): string[] {
  return [...new Set([
    ...product.keywords,
    ...(product.brand ? [product.brand.toLowerCase()] : []),
    ...(product.subcategory ? [product.subcategory] : []),
    ...(product.form ? [product.form] : []),
    ...(product.type ?? []),
    ...(product.dietary ?? []).map((d) => d.replace(/-/g, " "))
  ])];
}

/** True when anything on the shelf answers to what was said. */
export function shelfRespondsTo(shelf: Shelf, text: string): boolean {
  if (CHEAPEST.test(text) || DEAREST.test(text)) return true;
  return shelf.products.some((p) => wordsFor(p).some((k) => containsPhrase(text, k)));
}

function least(list: DemoProduct[]): DemoProduct {
  return list.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
}

function most(list: DemoProduct[]): DemoProduct {
  return list.reduce((a, b) => (b.priceCents > a.priceCents ? b : a));
}
