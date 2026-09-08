import {
  breadProducts,
  cheddarProducts,
  eggProducts,
  milkGallons,
  milkHalfGallons,
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
   * Which products to show before the shopper has narrowed anything. Milk is
   * the only aisle that needs this: it stocks the same four cartons in two jug
   * sizes, and putting all eight up at once is not a choice, it is a wall.
   */
  opening?: (text: string, all: DemoProduct[]) => DemoProduct[];
};

export type ShelfId = "milk" | "eggs" | "bread" | "cheddar";

export const shelves: Shelf[] = [
  {
    id: "milk",
    label: "milk",
    words: ["milk"],
    heading: "Our milk.",
    ask: "We carry four. Whole, two percent, one percent and skim. Which would you like?",
    askHint: "Name a kind \u2014 or ask for a half gallon.",
    products: milkProducts,
    opening: (text) => (mentionsHalfGallon(text) ? milkHalfGallons : milkGallons)
  },
  {
    id: "eggs",
    label: "eggs",
    words: ["egg"],
    heading: "Our eggs, by the dozen.",
    ask: "Large, extra large, jumbo, or Eggland's Best. Which would you like?",
    askHint: "Name a size or a brand and I'll pull it up.",
    products: eggProducts
  },
  {
    id: "bread",
    label: "bread",
    words: ["bread", "loaf"],
    heading: "Our sandwich bread.",
    ask: "Bunny, Essential Everyday, Wonder or Nature's Own. Which would you like?",
    askHint: "Name a brand \u2014 or ask for the cheapest.",
    products: breadProducts
  },
  {
    id: "cheddar",
    label: "cheddar",
    words: ["cheddar", "cheese"],
    heading: "Our cheddar.",
    ask: "Borden, Sargento, Land O Lakes or Cabot. Which would you like?",
    askHint: "Name a brand \u2014 or ask for the cheapest.",
    products: cheddarProducts
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

  let best = 0;
  const scored = pool.map((product) => {
    const score = product.keywords.filter((k) => containsPhrase(text, k)).length;
    best = Math.max(best, score);
    return { product, score };
  });
  if (best === 0) return pool;
  return scored.filter((s) => s.score === best).map((s) => s.product);
}

/** True when the whole phrase appears, so "large" does not match "x-large". */
function containsPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(text);
}

/** True when anything on the shelf answers to what was said. */
export function shelfRespondsTo(shelf: Shelf, text: string): boolean {
  if (CHEAPEST.test(text) || DEAREST.test(text)) return true;
  return shelf.products.some((p) => p.keywords.some((k) => containsPhrase(text, k)));
}

function least(list: DemoProduct[]): DemoProduct {
  return list.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
}

function most(list: DemoProduct[]): DemoProduct {
  return list.reduce((a, b) => (b.priceCents > a.priceCents ? b : a));
}
