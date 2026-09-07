import { asset } from "@/lib/asset-base";

export type DemoProduct = {
  id: string;
  name: string;
  shortName: string;
  size: string;
  price: string;
  priceCents: number;
  category: "milk" | "bread" | "cheddar";
  image: string;
  aisle: string;
  /** Milk only: how much fat, and how big the jug is. */
  variety?: "whole" | "2%" | "1%" | "skim";
  volume?: "gallon" | "half gallon";
};

// The real Dierbergs own-brand milk wall, prices as listed on the storefront.
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

export const bread: DemoProduct = {
  id: "bunny-white-bread",
  name: "Bunny Bread Original Soft-Twist White Enriched Bread",
  shortName: "Bunny Bread Original",
  size: "16 oz",
  price: "$2.09",
  priceCents: 209,
  category: "bread",
  image: asset("/dierbergs/products/bread-bunny.png"),
  aisle: "Aisle 9 - C"
};

export const borden: DemoProduct = {
  id: "borden-extra-sharp",
  name: "Borden Finely Shredded Cheese - Extra Sharp Cheddar",
  shortName: "Borden Extra Sharp Cheddar",
  size: "7 oz",
  price: "$3.91",
  priceCents: 391,
  category: "cheddar",
  image: asset("/dierbergs/products/cheese-borden.png"),
  aisle: "Aisle 12 - B"
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
  aisle: "Aisle 12 - B"
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
  aisle: "Aisle 12 - B"
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
  aisle: "Aisle 12 - B"
};

export const staplesProducts = [milk, bread, borden];
export const cheddarProducts = [borden, sargento, landOLakes, cabot];
export const alsoRequestedProducts = [milk, bread];
