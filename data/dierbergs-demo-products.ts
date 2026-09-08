import { asset } from "@/lib/asset-base";

export type DemoProduct = {
  id: string;
  name: string;
  shortName: string;
  size: string;
  price: string;
  priceCents: number;
  category: "milk" | "eggs" | "bread" | "cheddar";
  image: string;
  aisle: string;
  /**
   * The words that single this product out from the rest of its aisle. This is
   * the whole of the narrowing logic: say enough of a product's keywords and it
   * is the one you meant. Adding a product means writing its keywords, not
   * writing code.
   */
  keywords: string[];
  /**
   * Dierbergs' own item number, once there is a catalogue to take it from.
   * Nothing reads this yet; it is here so the demo records can be swapped for
   * real ones without changing their shape.
   */
  sku?: string;
  /** Milk only: how much fat, and how big the jug is. */
  variety?: "whole" | "2%" | "1%" | "skim";
  volume?: "gallon" | "half gallon";
};

/*
 * Names, sizes, prices and packshots are taken from the live Dierbergs
 * storefront. `scripts/fetch-dierbergs-products.mjs <term>` re-reads them.
 */

// --- Milk ------------------------------------------------------------------
// The Dierbergs own-brand milk wall: four fat levels in two jug sizes.

const VARIETY_WORDS: Record<NonNullable<DemoProduct["variety"]>, string[]> = {
  whole: ["whole", "vitamin d", "full fat", "red cap"],
  "2%": ["2%", "2 percent", "two percent", "reduced fat"],
  "1%": ["1%", "1 percent", "one percent", "lowfat", "low fat"],
  skim: ["skim", "fat free", "nonfat", "non fat", "blue cap"]
};

const VOLUME_WORDS: Record<NonNullable<DemoProduct["volume"]>, string[]> = {
  gallon: ["gallon", "128 oz", "big", "large"],
  "half gallon": ["half gallon", "half a gallon", "64 oz", "small", "smaller"]
};

function milkProduct(
  id: string,
  variety: NonNullable<DemoProduct["variety"]>,
  volume: NonNullable<DemoProduct["volume"]>,
  priceCents: number,
  file: string
): DemoProduct {
  const label = variety === "whole" ? "Whole" : variety === "skim" ? "Skim" : variety;
  const jug = volume === "gallon" ? "Gallon" : "Half Gallon";
  return {
    id,
    name: `Dierbergs ${label} Milk - ${jug}`,
    shortName: `Dierbergs ${label} Milk`,
    size: volume === "gallon" ? "128 oz" : "64 oz",
    price: `$${(priceCents / 100).toFixed(2)}`,
    priceCents,
    category: "milk",
    image: asset(`/dierbergs/products/${file}.png`),
    aisle: "Aisle 12 - A",
    keywords: [...VARIETY_WORDS[variety], ...VOLUME_WORDS[volume]],
    variety,
    volume
  };
}

export const milkWholeGallon = milkProduct("dierbergs-whole-gal", "whole", "gallon", 444, "milk-whole-gal");
export const milkTwoGallon = milkProduct("dierbergs-2pct-gal", "2%", "gallon", 424, "milk-2pct-gal");
export const milkOneGallon = milkProduct("dierbergs-1pct-gal", "1%", "gallon", 424, "milk-1pct-gal");
export const milkSkimGallon = milkProduct("dierbergs-skim-gal", "skim", "gallon", 424, "milk-skim-gal");

export const milkWholeHalf = milkProduct("dierbergs-whole-half", "whole", "half gallon", 269, "milk-whole-half");
export const milkTwoHalf = milkProduct("dierbergs-2pct-half", "2%", "half gallon", 269, "milk-2pct-half");
export const milkOneHalf = milkProduct("dierbergs-1pct-half", "1%", "half gallon", 269, "milk-1pct-half");
export const milkSkimHalf = milkProduct("dierbergs-skim-half", "skim", "half gallon", 269, "milk-skim-half");

export const milkGallons = [milkWholeGallon, milkTwoGallon, milkOneGallon, milkSkimGallon];
export const milkHalfGallons = [milkWholeHalf, milkTwoHalf, milkOneHalf, milkSkimHalf];
export const milkProducts = [...milkGallons, ...milkHalfGallons];

/** The one milk used when a request does not name a variety. */
export const milk = milkOneGallon;

// --- Eggs ------------------------------------------------------------------

export const eggsLarge: DemoProduct = {
  id: "dierbergs-eggs-large",
  name: "Dierbergs Grade A Large Eggs - 12 ct",
  shortName: "Dierbergs Large Eggs",
  size: "12 ct",
  price: "$1.79",
  priceCents: 179,
  category: "eggs",
  image: asset("/dierbergs/products/eggs-dierbergs-large.png"),
  aisle: "Aisle 12 - A",
  keywords: ["large", "dierbergs", "regular", "grade a"]
};

export const eggsExtraLarge: DemoProduct = {
  id: "dierbergs-eggs-xl",
  name: "Dierbergs Grade A Extra Large Eggs - 12 ct",
  shortName: "Dierbergs Extra Large Eggs",
  size: "12 ct",
  price: "$1.94",
  priceCents: 194,
  category: "eggs",
  image: asset("/dierbergs/products/eggs-dierbergs-xl.png"),
  aisle: "Aisle 12 - A",
  keywords: ["extra large", "xl", "dierbergs", "grade a"]
};

export const eggsJumbo: DemoProduct = {
  id: "dierbergs-eggs-jumbo",
  name: "Dierbergs Grade A Jumbo Eggs - 12 ct",
  shortName: "Dierbergs Jumbo Eggs",
  size: "12 ct",
  price: "$2.04",
  priceCents: 204,
  category: "eggs",
  image: asset("/dierbergs/products/eggs-dierbergs-jumbo.png"),
  aisle: "Aisle 12 - A",
  keywords: ["jumbo", "biggest", "dierbergs", "grade a"]
};

export const eggsEgglands: DemoProduct = {
  id: "egglands-best-large",
  name: "Eggland's Best Classic Large White Eggs, 12 count",
  shortName: "Eggland's Best Large Eggs",
  size: "12 ct",
  price: "$5.48",
  priceCents: 548,
  category: "eggs",
  image: asset("/dierbergs/products/eggs-egglands-large.png"),
  aisle: "Aisle 12 - A",
  keywords: ["egglands", "egglands best", "classic", "white", "name brand"]
};

export const eggProducts = [eggsLarge, eggsExtraLarge, eggsJumbo, eggsEgglands];

// --- Bread -----------------------------------------------------------------

export const bread: DemoProduct = {
  id: "bunny-white-bread",
  name: "Bunny Bread Original Soft-Twist White Enriched Bread",
  shortName: "Bunny Bread Original",
  size: "16 oz",
  price: "$2.09",
  priceCents: 209,
  category: "bread",
  image: asset("/dierbergs/products/bread-bunny.png"),
  aisle: "Aisle 9 - C",
  keywords: ["bunny", "original", "soft twist", "cheapest"]
};

export const breadEssential: DemoProduct = {
  id: "essential-everyday-white",
  name: "Essential Everyday White Enriched Bread - 20 oz",
  shortName: "Essential Everyday White",
  size: "20 oz",
  price: "$2.56",
  priceCents: 256,
  category: "bread",
  image: asset("/dierbergs/products/bread-essential.png"),
  aisle: "Aisle 9 - C",
  keywords: ["essential", "everyday", "essential everyday", "store brand"]
};

export const breadWonder: DemoProduct = {
  id: "wonder-classic-white",
  name: "Wonder Bread Classic White Sandwich Bread",
  shortName: "Wonder Classic White",
  size: "20 oz",
  price: "$3.68",
  priceCents: 368,
  category: "bread",
  image: asset("/dierbergs/products/bread-wonder.png"),
  aisle: "Aisle 9 - C",
  keywords: ["wonder", "classic", "sandwich"]
};

export const breadNaturesOwn: DemoProduct = {
  id: "natures-own-thick",
  name: "Nature's Own White Bread, Thick Sliced",
  shortName: "Nature's Own Thick Sliced",
  size: "22 oz",
  price: "$5.25",
  priceCents: 525,
  category: "bread",
  image: asset("/dierbergs/products/bread-natures-own.png"),
  aisle: "Aisle 9 - C",
  keywords: ["natures own", "nature", "thick", "thick sliced", "texas toast"]
};

export const breadProducts = [bread, breadEssential, breadWonder, breadNaturesOwn];

// --- Cheddar ---------------------------------------------------------------

export const borden: DemoProduct = {
  id: "borden-extra-sharp",
  name: "Borden Finely Shredded Cheese - Extra Sharp Cheddar",
  shortName: "Borden Extra Sharp Cheddar",
  size: "7 oz",
  price: "$3.91",
  priceCents: 391,
  category: "cheddar",
  image: asset("/dierbergs/products/cheese-borden.png"),
  aisle: "Aisle 12 - B",
  keywords: ["borden", "shredded", "finely shredded", "extra sharp", "cheapest", "3.91"]
};

export const sargento: DemoProduct = {
  id: "sargento-sharp",
  name: "Sargento Ultra Thin Sharp Cheddar Sliced Cheese",
  shortName: "Sargento Sharp Cheddar",
  size: "6.84 oz",
  price: "$4.36",
  priceCents: 436,
  category: "cheddar",
  image: asset("/dierbergs/products/cheese-sargento.png"),
  aisle: "Aisle 12 - B",
  keywords: ["sargento", "sliced", "slices", "ultra thin", "4.36"]
};

export const landOLakes: DemoProduct = {
  id: "land-o-lakes-extra-sharp",
  name: "Land O Lakes Cheese, Extra Sharp White Cheddar",
  shortName: "Land O Lakes Extra Sharp",
  size: "8 oz",
  price: "$4.69",
  priceCents: 469,
  category: "cheddar",
  image: asset("/dierbergs/products/cheese-landolakes.png"),
  aisle: "Aisle 12 - B",
  keywords: ["land o lakes", "land o", "white cheddar", "white", "4.69"]
};

export const cabot: DemoProduct = {
  id: "cabot-extra-sharp",
  name: "Cabot Extra Sharp Cheddar Cheese Block",
  shortName: "Cabot Extra Sharp Cheddar",
  size: "8 oz",
  price: "$4.80",
  priceCents: 480,
  category: "cheddar",
  image: asset("/dierbergs/products/cheese-cabot.png"),
  aisle: "Aisle 12 - B",
  keywords: ["cabot", "block", "4.80"]
};

export const cheddarProducts = [borden, sargento, landOLakes, cabot];

export const staplesProducts = [milk, bread, borden];
export const alsoRequestedProducts = [milk, bread];
