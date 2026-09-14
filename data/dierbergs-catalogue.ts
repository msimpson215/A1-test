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
    /*
     * The opening offer, and the way out of it.
     *
     * Two jugs is the right thing to open with and it was the only thing anyone
     * ever saw, because nothing on screen said the case held twenty more. Asked
     * to see all the milks the shelf put the same two up again, so the store
     * looked like it stocked two. The hint now names the sentence that opens the
     * whole case, because a way out nobody is told about is not a way out.
     */
    ask: "Our own Dierbergs milk is on special right now \u2014 would you like to try that? Gallon or half gallon?",
    askHint: "Name a size, or say \u201cshow me all the milks\u201d to see the whole case.",
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
/*
 * Only cartons whose own label says lactose free.
 *
 * a2 gets mistaken for lactose free constantly, and it is worth saying out loud
 * that it is not — but it does not belong on this shelf, where one tap adds it
 * to the cart. The caution goes in the words; the shelf stays true to the ask.
 */
export function milkForLactose(): DemoProduct[] {
  const wanted = ["milk-lactaid-2", "milk-pf-lf-whole", "milk-fairlife-2"];
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

/**
 * Bread they cannot eat.
 *
 * The same shape as the lactose question: not a product request, no keyword in
 * it that matches a loaf, and the one thing a shopper most needs the aisle to
 * know about them.
 */
export function asksAboutGluten(raw: string): boolean {
  const text = plain(raw);
  return (
    /\bglutens?\b/.test(text) ||
    /\bceliac|coeliac\b/.test(text) ||
    /\b(cant|cannot|dont|do not) (eat|have) (wheat|gluten|bread)\b/.test(text) ||
    /\bwheat (bothers|upsets|hurts)\b/.test(text)
  );
}

/** Low carb rather than gluten: a different request that arrives in the same breath. */
export function asksAboutCarbs(raw: string): boolean {
  const text = plain(raw);
  return /\b(keto|low carb|lowcarb|carbs|carb count|atkins|diabetic)\b/.test(text);
}

function breadBy(ids: string[]): DemoProduct[] {
  const bread = shelfById("bread")?.products ?? [];
  return ids
    .map((id) => bread.find((p) => p.id === id))
    .filter((p): p is DemoProduct => Boolean(p));
}

/** The gluten free loaves, cheapest way in first. */
export function breadForGluten(): DemoProduct[] {
  return breadBy([
    "bread-udis-white-gf",
    "bread-canyon-white-gf",
    "bread-canyon-7grain-gf",
    "bread-carbonaut-lowcarb"
  ]);
}

/** The low carb loaves, which are not the same thing as the gluten free ones. */
export function breadForCarbs(): DemoProduct[] {
  return breadBy(["bread-natures-keto", "bread-carbonaut-lowcarb"]);
}

/**
 * Cheese for someone who cannot drink milk.
 *
 * The useful fact, and one most people do not know: aged hard cheeses lose
 * nearly all their lactose in the making, so cheddar and swiss are usually fine
 * for someone who cannot manage a glass of milk. There is also one bag labelled
 * lactose free outright, for anyone who would rather not take the chance.
 */
export function cheeseForLactose(): DemoProduct[] {
  const cheese = shelfById("cheese")?.products ?? [];
  const wanted = [
    "cheese-kraft-shred-lf",
    "cabot-extra-sharp",
    "cheese-sargento-slice-aged",
    "cheese-ee-swiss"
  ];
  return wanted
    .map((id) => cheese.find((p) => p.id === id))
    .filter((p): p is DemoProduct => Boolean(p));
}

/*
 * Said to anyone who mentions a condition, an allergy or a diet.
 *
 * A grocer is not a clinic, and a shop assistant who tells someone what their
 * body will do with a food has taken on something no shop wants and no shopper
 * asked for. So these lines describe the product and stop: what the label says,
 * what the process does, what it costs. The judgement is the shopper's, and if
 * they have been advised by someone qualified, that advice wins without
 * argument.
 */
export const DIET_DISCLAIMER =
  "Label information only \u2014 read the packet, and go by what your dietitian or doctor has told you.";

export const GLUTEN_LINE =
  "Three of our loaves are labelled gluten free. " +
  "Udi's is the softer sandwich loaf and the cheaper of the two; Canyon Bakehouse does a white and a seven grain. " +
  "Carbonaut is labelled gluten free and low carb both. " +
  "Two things worth knowing: they run two to three times the price of ordinary bread, and some of them are in the freezer case. " +
  "I'm not a dietitian, so read the packet yourself \u2014 recipes change. Which would you like to see?";

export const CARB_LINE =
  "Two loaves labelled low carb: Nature's Own Keto is the cheaper, and Carbonaut is lower again and labelled gluten free with it. " +
  "Low carb and gluten free are different labels, so say if you need both. The carb counts are printed on the packet.";

export const CHEESE_LACTOSE_LINE =
  "Going by the labels: one Kraft shredded cheddar is marked lactose free outright. " +
  "Beyond that, aging breaks lactose down, so aged cheeses are naturally low in it \u2014 " +
  "the Cabot extra sharp and the aged Sargento slices are the well aged ones here, and the Essential Everyday swiss is the cheapest way in. " +
  "I'm not a dietitian, so what to do with that is yours to decide, and the packet has the detail.";

export type DietaryAdvice = {
  aisle: ShelfId;
  products: DemoProduct[];
  line: string;
  hint: string;
};

/**
 * What to say when someone tells you what they cannot eat.
 *
 * Aisle-aware, because the same sentence has a different answer depending on
 * where they are standing: "I'm lactose intolerant" in front of the milk means
 * lactose free cartons, and in front of the cheese means the far more useful
 * fact that most of the cheese was never a problem.
 */
export function dietaryAdvice(raw: string, aisle?: ShelfId | null): DietaryAdvice | null {
  if (asksAboutLactose(raw)) {
    if (aisle === "cheese") {
      return {
        aisle: "cheese",
        products: cheeseForLactose(),
        line: CHEESE_LACTOSE_LINE,
        hint: `Aging breaks lactose down; one bag is labelled lactose free. ${DIET_DISCLAIMER}`
      };
    }
    return {
      aisle: "milk",
      products: milkForLactose(),
      line: LACTOSE_LINE,
      hint: `Lactaid and Prairie Farms: lactose broken down. fairlife: ultra filtered. a2: a2 protein only, not lactose free. ${DIET_DISCLAIMER}`
    };
  }
  if (asksAboutGluten(raw)) {
    return {
      aisle: "bread",
      products: breadForGluten(),
      line: GLUTEN_LINE,
      hint: `Udi's is the cheaper soft loaf. Canyon does seven grain. Both run two to three times ordinary bread. ${DIET_DISCLAIMER}`
    };
  }
  if (asksAboutCarbs(raw)) {
    return {
      aisle: "bread",
      products: breadForCarbs(),
      line: CARB_LINE,
      hint: `Nature's Own Keto is the cheaper. Carbonaut is lower carb and gluten free with it. ${DIET_DISCLAIMER}`
    };
  }
  return null;
}

/** Said out loud with them. Not advice — what each carton is. */
export const LACTOSE_LINE =
  "Here's what the cartons say. " +
  "Lactaid and Prairie Farms Lactose Free are ordinary milk with the lactose already broken down, so they taste like milk. " +
  "fairlife is ultra filtered \u2014 labelled lactose free, with more protein and less sugar. " +
  "a2 is not lactose free at all: it's milk from cows whose protein is only the a2 kind. " +
  "I'm not a dietitian, so if you've had advice, go by that. Any of those you'd like to see?";

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

// Chocolate sits alongside these as a kind of milk, but it is a flavour rather
// than a fat: "the half gallon" plus "chocolate" is not a fat being named.
const MILK_FATS = ["whole", "2%", "1%", "skim"];

function namedMilkFat(text: string): string | null {
  const said = milkScoreText(text);
  for (const fat of MILK_FATS) {
    const words = KIND_WORDS.milk[fat] ?? [];
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

/*
 * "Show me all the milks."
 *
 * Every aisle opens on a small, chosen handful, and that is the right way to
 * open — twenty-two cartons at somebody who said "milk" is a wall, not an
 * answer. But it left no way out. Asked to see all the milks the shelf put up
 * the same two Dierbergs jugs it always did, so the store looked like it
 * stocked two milks, and the more plainly you asked the more it insisted.
 *
 * So this is the escape hatch, and it is deliberately generous about how it
 * might be said. Anyone who has been shown a handful and wants the rest asks in
 * whatever words come to hand, and being ignored twice is how a person decides
 * the thing is broken.
 */
const WANTS_THE_LOT =
  /\b(all|every|everything|the lot|the rest|full (list|range|selection)|what else|anything else|others|rest of (them|the)|show me them all|see them all|whole (lot|range|selection))\b/;

/** Whether they asked to be shown the whole aisle rather than a selection. */
export function askedForWholeAisle(raw: string): boolean {
  const text = plain(raw);
  // "All of it" about one carton is not a request for the cooler, and neither is
  // "is that all?" — a question about the shelf they are looking at.
  if (/\bis that all\b/.test(text)) return false;
  return WANTS_THE_LOT.test(text);
}

/*
 * "All the milks" is the whole cooler. "Anything else that's lactose free" is
 * not — it is everything of one kind, and answering it with twenty-two cartons
 * would be a worse failure than the two-carton shelf this replaced. So the
 * question is whether they named anything besides the aisle and the asking.
 */
const WANTS_THE_LOT_ALL = new RegExp(WANTS_THE_LOT.source, "g");

/*
 * Asking for the lot puts everything in the plural — "all the cheddars", "all
 * the gluten free breads" — and the catalogue's keywords are singular, so the
 * plural scored nothing and the shelf widened to the whole case instead of to
 * the kind they named.
 */
function singulars(text: string): string {
  return text.replace(/\b(\w{3,}?)s\b/g, "$1");
}
function namedMoreThanTheAisle(shelf: Shelf, text: string, pool: DemoProduct[]): boolean {
  /*
   * The aisle's own name only, not its synonyms. An aisle answers to the kinds it
   * holds — cheese answers to "cheddar" — so stripping all of them turned "all the
   * cheddars" into a request for the whole cheese case.
   */
  const residual = text
    .replace(WANTS_THE_LOT_ALL, " ")
    .replace(new RegExp(`\\b(${shelf.label}|${shelf.id})(s|es)?\\b`, "g"), " ");
  const singular = singulars(residual);
  return pool.some((product) => score(product, residual) > 0 || score(product, singular) > 0);
}

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
   * Asked for the whole aisle, hand over the whole aisle — before any of the
   * narrowing below, because "all the milks" names milk and would otherwise be
   * scored as a request for the store's own two jugs. Naming a kind as well
   * ("all the lactose free ones") falls through to the narrowing instead, and is
   * only spared the shelf-size cap at the end.
   */
  const wantsTheLot = askedForWholeAisle(text);
  if (wantsTheLot && !namedMoreThanTheAisle(shelf, text, pool)) return shelf.products;

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
  // "All the cheddars" got this far because it named a kind, so score it in the
  // singular the catalogue is written in.
  const asked = wantsTheLot ? singulars(text) : text;
  const scoredText = shelf.id === "milk" ? milkScoreText(asked) : asked;

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

  const cap = wantsTheLot ? Number.MAX_SAFE_INTEGER : shelf.id === "milk" ? 8 : 4;
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
/*
 * What they said they did not want.
 *
 * "A block of cheddar, not shredded" is a normal sentence, and reading it as
 * two positive words put the shredded bags at the top of the shelf — the exact
 * opposite of what was asked for. So the words after a "not" are pulled out of
 * the query and counted against a product instead of for it.
 *
 * Deliberately short-sighted: it takes the two or three words following the
 * negation, because "not shredded, I want a block" must not go on to treat
 * "block" as unwanted too.
 */
const NEGATION = /\b(?:not|no|none|without|other than|dont want|do not want|nothing)\s+(?:the\s+|a\s+|any\s+)?([a-z%0-9]+(?:\s+[a-z%0-9]+)?)/g;

function unwantedIn(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(NEGATION)) {
    const phrase = match[1]?.trim();
    if (!phrase) continue;
    out.push(phrase);
    // "not finely shredded" should also rule out "shredded" on its own.
    const words = phrase.split(/\s+/);
    if (words.length > 1) out.push(...words);
  }
  return out;
}

/** The query with the unwanted words taken out, so they cannot score for. */
function wantedText(text: string, unwanted: string[]): string {
  let wanted = text;
  for (const phrase of unwanted) {
    wanted = wanted.replace(new RegExp(`(^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "g"), " ");
  }
  return wanted.replace(/\s+/g, " ").trim();
}

function score(product: DemoProduct, text: string): number {
  const unwanted = unwantedIn(text);
  const words = wordsFor(product);
  const positive = unwanted.length ? wantedText(text, unwanted) : text;

  let value = words
    .filter((k) => containsPhrase(positive, k))
    .reduce((sum, k) => sum + k.length, 0);

  /*
   * A product that is the thing they ruled out drops out of the running rather
   * than merely ranking lower, or "not shredded" still shows shredded when the
   * rest of the sentence matches it well.
   */
  for (const phrase of unwanted) {
    if (words.some((k) => k === phrase || containsPhrase(k, phrase))) return 0;
  }
  return value;
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
/*
 * What a shopper calls it, against what the data calls it.
 *
 * This is most of what "knowing an aisle" actually means. Nobody asks for hard
 * cooked eggs; they ask for hard boiled. Nobody asks for a low moisture part
 * skim block; they ask for pizza cheese. The gap between the two vocabularies is
 * where a search quietly fails and the assistant says the store does not carry
 * something it has twelve of.
 *
 * One table per aisle, keyed on the kind, in the words people say out loud.
 */
const KIND_WORDS: Record<string, Record<string, string[]>> = {
  milk: {
    whole: ["whole", "vitamin d", "full fat"],
    "2%": ["2%", "2 percent", "two percent", "reduced fat"],
    "1%": ["1%", "1 percent", "one percent", "lowfat", "low fat"],
    skim: ["skim", "fat free", "nonfat", "non fat"],
    chocolate: ["chocolate", "choc", "chocolate milk"]
  },
  eggs: {
    large: ["large"],
    "extra large": ["extra large", "xl", "x large"],
    jumbo: ["jumbo", "biggest", "largest"],
    // Every shopper says hard boiled. No carton anywhere says it.
    "hard cooked": [
      "hard cooked",
      "hard boiled",
      "hardboiled",
      "boiled",
      "already cooked",
      "peeled",
      "ready to eat",
      "no cooking"
    ]
  },
  bread: {
    white: ["white", "plain", "sandwich bread"],
    wheat: ["wheat", "brown bread"],
    "whole grain": ["whole grain", "whole wheat", "multigrain", "multi grain", "grainy", "seeds"],
    sourdough: ["sourdough", "sour dough", "sour"],
    // Pumpernickel and Jewish rye are on the loaves that are actually those
    // things; listing them here would make every rye answer to both equally.
    rye: ["rye", "deli bread"],
    bagel: ["bagel", "bagels"]
  },
  cheese: {
    cheddar: ["cheddar", "cheddar cheese"],
    swiss: ["swiss", "swiss cheese"],
    provolone: ["provolone"],
    // "For pizza" is how the low moisture block is asked for far more often
    // than by name, and nothing else in the store answers to it.
    mozzarella: ["mozzarella", "mozarella", "mozzarela", "pizza cheese", "pizza"]
  }
};

/** How it is packaged, in the words it is asked for. */
const FORM_WORDS: Record<string, string[]> = {
  shredded: ["shredded", "shred", "grated", "bag of shredded"],
  sliced: ["sliced", "slices", "for sandwiches", "sandwich slices"],
  block: ["block", "chunk", "brick", "bar", "hunk"],
  cubes: ["cubes", "cubed", "snack cubes"],
  fresh: ["fresh", "ball", "caprese"],
  deli: ["deli", "from the counter", "cut to order", "sliced to order"],
  loaf: ["loaf", "full loaf"],
  "half loaf": ["half loaf", "small loaf", "little loaf", "half a loaf"],
  bagels: ["bagels", "bagel"],
  dozen: ["dozen", "twelve", "12 ct", "12 count"],
  "18 count": ["18 count", "18 pack", "18 ct", "eighteen", "eighteen count", "big pack"],
  "6 count": ["6 count", "half dozen", "six count", "small pack"]
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
  const kind = product.subcategory
    ? KIND_WORDS[product.category]?.[product.subcategory] ?? []
    : [];
  const form = product.form ? FORM_WORDS[product.form] ?? [] : [];
  return [...new Set([
    ...product.keywords,
    ...kind,
    ...form,
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
/**
 * What the store has for these words.
 *
 * The whole point of this, and the only reason a thousand cells is possible:
 * the assistant does not hold the catalogue, it asks. Handing a model every
 * product costs about fifty tokens each, which is fine for a hundred and
 * hopeless for forty thousand — and no amount of context makes reading the
 * entire store on every sentence a good idea.
 *
 * Inside a cell this is exactly the narrowing that has always run, so the milk
 * knows what it knows. Across cells it scores every product on its own words,
 * which is the same scoring, just wider.
 */
export function findProducts(
  query: string,
  aisleHint?: ShelfId | null,
  limit = 8
): { products: DemoProduct[]; aisle: ShelfId | null } {
  const text = plain(query);
  const named = shelvesNamedIn(text);
  const shelf =
    named.length === 1
      ? named[0]
      : shelfById(aisleHint) ?? named.find((s) => shelfRespondsTo(s, text)) ?? null;

  if (shelf) {
    /*
     * The limit is there to keep a shelf readable, and it has to lose to somebody
     * asking for the whole aisle. Trimming "show me all the milks" back to eight
     * is the same answer as before with extra steps: they asked to see everything
     * and got a selection, with nothing to say a selection was made.
     */
    const narrowed = narrowShelf(shelf, text);
    const room = askedForWholeAisle(text) ? narrowed.length : limit;
    return { products: narrowed.slice(0, room), aisle: shelf.id };
  }

  let best = 0;
  const scored = shelves
    .flatMap((s) => s.products)
    .map((product) => {
      const value = score(product, text);
      best = Math.max(best, value);
      return { product, value };
    });
  if (best === 0) return { products: [], aisle: null };

  // Best matches first, and only real matches: a shelf of near misses is worse
  // than saying the store does not carry it.
  const products = scored
    .filter((s) => s.value >= best * 0.7)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((s) => s.product);
  const aisles = new Set(products.map((p) => p.category));
  return { products, aisle: aisles.size === 1 ? (products[0].category as ShelfId) : null };
}

/**
 * The store as an index, which is all the assistant needs to hold.
 *
 * Aisle names and, where there is room, the kinds and brands in each, so it
 * knows where things live and what words are worth searching.
 *
 * This is the one part of the prompt that grows with the store, so it is
 * capped. Spelling out kinds and brands costs about two hundred characters an
 * aisle: fine for four aisles, forty-eight thousand tokens at a thousand, sent
 * on every session. Past the cap the detail is dropped a layer at a time and
 * the aisle names alone go down. Nothing is lost by that — find_products
 * searches the whole store either way, and never reads this — so the shopper
 * sees the same answers whether their store has four aisles or a thousand.
 */
const INDEX_BUDGET = 2000;

export function aisleIndexFrom(list: Shelf[], budget = INDEX_BUDGET): string {
  // Richest first: names with kinds and brands, then names with kinds, then
  // the bare list of aisles, which always fits.
  const layers: Array<(shelf: Shelf) => string> = [
    (shelf) => {
      const kinds = [...new Set(shelf.products.map((p) => p.subcategory).filter(Boolean))];
      const brands = [...new Set(shelf.products.map((p) => p.brand).filter(Boolean))];
      return [
        `${shelf.id}: ${shelf.products.length} items`,
        kinds.length ? `kinds: ${kinds.join(", ")}` : "",
        brands.length ? `brands: ${brands.join(", ")}` : ""
      ]
        .filter(Boolean)
        .join(" | ");
    },
    (shelf) => {
      const kinds = [...new Set(shelf.products.map((p) => p.subcategory).filter(Boolean))];
      return kinds.length
        ? `${shelf.id}: ${shelf.products.length} items | kinds: ${kinds.join(", ")}`
        : `${shelf.id}: ${shelf.products.length} items`;
    },
    (shelf) => `${shelf.id}: ${shelf.products.length} items`
  ];

  let text = "";
  for (const layer of layers) {
    text = list.map(layer).join("\n");
    if (text.length <= budget) return text;
  }
  /*
   * Even bare aisle names can overrun once a store is listed cell by cell. Say
   * how many were left out rather than trailing off, so the assistant knows to
   * search for what it cannot see instead of assuming the store ends here.
   */
  const names = list.map(layers[2]);
  const tail = (n: number) => `…and ${n} more aisles: search for anything not listed here.`;
  // The note about what was cut counts against the budget like everything else.
  const room = Math.max(0, budget - tail(names.length).length - 1);
  const kept: string[] = [];
  let used = 0;
  for (const name of names) {
    if (used + name.length + 1 > room) break;
    kept.push(name);
    used += name.length + 1;
  }
  const rest = names.length - kept.length;
  return rest > 0 ? `${kept.join("\n")}\n${tail(rest)}` : kept.join("\n");
}

export function aisleIndex(): string {
  return aisleIndexFrom(shelves);
}

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
