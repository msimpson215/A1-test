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
};

export const milk: DemoProduct = {
  id: "dierbergs-milk-1",
  name: "Dierbergs 1% Milk - Gallon",
  shortName: "Dierbergs 1% Milk",
  size: "128 oz",
  price: "$4.39",
  priceCents: 439,
  category: "milk",
  image: asset("/dierbergs/products/milk-dierbergs.png"),
  aisle: "Aisle 12 - A"
};

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
