/**
 * Turns harvested Dierbergs tiles into the demo's product cells.
 *
 * Every product below is picked out of the harvest by its exact name, so the
 * name, size, price and packshot are the store's, not mine. A name that is no
 * longer in the harvest is a hard error rather than a quiet omission — the one
 * thing this must never do is put a product or a price in the demo that
 * Dierbergs does not have.
 *
 * The attributes are read off the product's own label. "Sara Lee 100% Whole
 * Wheat" is wheat because it says so. Dietary claims are narrower still: they
 * come only from the badges the storefront puts on the tile, so nothing is
 * called gluten free on my say-so.
 *
 *   node scripts/build-cells.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const IMAGES = "public/dierbergs/products";
mkdirSync(IMAGES, { recursive: true });

const pool = new Map();
for (const file of ["/tmp/cells.json", "/tmp/gap.json", "/tmp/gap2.json"]) {
  if (!existsSync(file)) continue;
  const data = JSON.parse(readFileSync(file, "utf8"));
  for (const list of Object.values(data)) {
    for (const p of list) if (!pool.has(p.name)) pool.set(p.name, p);
  }
}
console.error(`${pool.size} harvested products available`);

/*
 * The cells. Each row is [harvested name, id, attributes].
 *
 * `sub` is what the shopper asks for by name ("sourdough", "2%", "jumbo",
 * "swiss"). `type` is everything else they might say about it. `form` is how
 * it is sold, which is the axis people forget to name and then correct
 * themselves on: sliced, shredded, block, half loaf, gallon.
 */
const CELLS = {
  bread: [
    ["Bunny Bread Original Soft-Twist White Enriched Bread", "bread-bunny-white", { brand: "Bunny Bread", sub: "white", type: ["soft twist", "enriched", "original"], form: "loaf" }],
    ["Wonder Bread Classic White Sandwich Bread, Sliced White Bread", "bread-wonder-white", { brand: "Wonder", sub: "white", type: ["classic", "sandwich", "sliced"], form: "loaf" }],
    ["Essential Everyday White Enriched Bread - 20 oz", "bread-ee-white", { brand: "Essential Everyday", sub: "white", type: ["enriched"], form: "loaf" }],
    ["Nature's Own Butter Bread, Sliced White Bread", "bread-natures-butter", { brand: "Nature's Own", sub: "white", type: ["butter", "sliced"], form: "loaf" }],
    ["Pepperidge Farm Farmhouse Hearty White Bread", "bread-pf-hearty-white", { brand: "Pepperidge Farm", sub: "white", type: ["farmhouse", "hearty", "thick"], form: "loaf" }],
    ["Dierbergs Bakehouse Split Top White Bread - 16 oz", "bread-db-split-white", { brand: "Dierbergs Bakehouse", sub: "white", type: ["split top", "store brand"], form: "loaf" }],
    ["Wonder Bread White Mini Loaf", "bread-wonder-mini", { brand: "Wonder", sub: "white", type: ["mini", "small"], form: "half loaf" }],
    ["Wonder Bread Giant Bread", "bread-wonder-giant", { brand: "Wonder", sub: "white", type: ["giant", "large", "big"], form: "loaf" }],

    ["Sara Lee Honey Wheat, Bread, Sandwich Bread, 20 oz", "bread-sl-honey-wheat", { brand: "Sara Lee", sub: "wheat", type: ["honey wheat", "sandwich"], form: "loaf" }],
    ["Sara Lee 100% Whole Wheat, Bread, 13g Whole Grain, Sandwich Bread, 20 oz", "bread-sl-whole-wheat", { brand: "Sara Lee", sub: "wheat", type: ["100% whole wheat", "whole grain", "sandwich"], form: "loaf" }],
    ["Bunny Bread Whole Wheat Bread", "bread-bunny-wheat", { brand: "Bunny Bread", sub: "wheat", type: ["whole wheat"], form: "loaf" }],
    ["Bunny Bread Original Honey Wheat Bread", "bread-bunny-honey-wheat", { brand: "Bunny Bread", sub: "wheat", type: ["honey wheat"], form: "loaf" }],
    ["Dave's Killer Bread 21 Whole Grains and Seeds Organic Bread", "bread-daves-21", { brand: "Dave's Killer Bread", sub: "whole grain", type: ["21 whole grains", "seeds", "organic"], form: "loaf" }],
    ["Nature's Own Perfectly Crafted Multigrain Bread, Thick Sliced Non-GMO Sandwich Bread", "bread-natures-multigrain", { brand: "Nature's Own", sub: "whole grain", type: ["multigrain", "thick sliced"], form: "loaf" }],

    ["Dierbergs Bakehouse Sourdough Hearth Bread - 19 oz", "bread-db-sourdough", { brand: "Dierbergs Bakehouse", sub: "sourdough", type: ["hearth", "store brand"], form: "loaf" }],
    ["Dierbergs Bakehouse Bread Sourdough Hearth Half Loaf - 9 oz", "bread-db-sourdough-half", { brand: "Dierbergs Bakehouse", sub: "sourdough", type: ["hearth", "half loaf", "small"], form: "half loaf" }],
    ["Pepperidge Farm Farmhouse Sourdough Bread", "bread-pf-sourdough", { brand: "Pepperidge Farm", sub: "sourdough", type: ["farmhouse"], form: "loaf" }],
    ["The Rustik Oven Sourdough Bread", "bread-rustik-sourdough", { brand: "The Rustik Oven", sub: "sourdough", type: ["artisan"], form: "loaf" }],

    ["Dierbergs Bakehouse St. Louis Rye Bread - 19 oz", "bread-db-rye", { brand: "Dierbergs Bakehouse", sub: "rye", type: ["st louis rye", "store brand"], form: "loaf" }],
    ["Pepperidge Farm Jewish Rye Seedless Bread", "bread-pf-rye", { brand: "Pepperidge Farm", sub: "rye", type: ["jewish rye", "seedless"], form: "loaf" }],
    ["Dierbergs Bakehouse Rye Pumpernickel Bread - 19 oz", "bread-db-pumpernickel", { brand: "Dierbergs Bakehouse", sub: "rye", type: ["pumpernickel"], form: "loaf" }],

    ["Dierbergs Bakehouse Plain Bagels - 3 ct", "bagel-db-plain", { brand: "Dierbergs Bakehouse", sub: "bagel", type: ["plain"], form: "bagels" }],
    ["Dierbergs Bakehouse Everything Bagels - 3 ct", "bagel-db-everything", { brand: "Dierbergs Bakehouse", sub: "bagel", type: ["everything"], form: "bagels" }],
    ["Thomas’ 10 ct, Plain, Mini Bagels, Kosher, Bagels, 15 oz", "bagel-thomas-mini", { brand: "Thomas'", sub: "bagel", type: ["mini", "plain"], form: "bagels" }],
    ["Dave's Killer Bread Organic Plain Awesome Bagels", "bagel-daves-plain", { brand: "Dave's Killer Bread", sub: "bagel", type: ["plain", "organic"], form: "bagels" }],

    ["Canyon Bakehouse Gluten Free Sliced Mountain White Bread", "bread-canyon-white-gf", { brand: "Canyon Bakehouse", sub: "white", type: ["gluten free", "sliced"], form: "loaf" }],
    ["Udi's Gluten Free Delicious Soft White Sandwich Bread, Frozen", "bread-udis-white-gf", { brand: "Udi's", sub: "white", type: ["gluten free", "sandwich", "frozen"], form: "loaf" }],
    ["Canyon Bakehouse 7-Grain Sandwich Bread, Gluten Free Bread, 100% Whole Grain, Frozen", "bread-canyon-7grain-gf", { brand: "Canyon Bakehouse", sub: "whole grain", type: ["gluten free", "7 grain", "frozen"], form: "loaf" }],

    ["Carbonaut Low Carb White Bread, Gluten Free, 1g Net Carbs, 15g Fiber", "bread-carbonaut-lowcarb", { brand: "Carbonaut", sub: "white", type: ["low carb", "keto", "gluten free"], form: "loaf" }],
    ["Nature's Own Life Keto Soft White Bread", "bread-natures-keto", { brand: "Nature's Own", sub: "white", type: ["keto", "low carb"], form: "loaf" }]
  ],

  milk: [
    ["Dierbergs Whole Milk - Gallon - 128 oz", "milk-db-whole-gal", { brand: "Dierbergs", sub: "whole", type: ["store brand"], form: "gallon" }],
    ["Dierbergs 2% Milk - Gallon - 128 oz", "milk-db-2-gal", { brand: "Dierbergs", sub: "2%", type: ["reduced fat", "store brand"], form: "gallon" }],
    ["Dierbergs 1% Milk - Gallon - 128 oz", "milk-db-1-gal", { brand: "Dierbergs", sub: "1%", type: ["lowfat", "store brand"], form: "gallon" }],
    ["Dierbergs Skim Milk - Gallon - 128 oz", "milk-db-skim-gal", { brand: "Dierbergs", sub: "skim", type: ["fat free", "nonfat", "store brand"], form: "gallon" }],
    ["Dierbergs Whole Milk - Half Gallon - 64 oz", "milk-db-whole-half", { brand: "Dierbergs", sub: "whole", type: ["store brand"], form: "half gallon" }],
    ["Dierbergs 2% Milk - Half Gallon - 64 oz", "milk-db-2-half", { brand: "Dierbergs", sub: "2%", type: ["reduced fat", "store brand"], form: "half gallon" }],
    ["Dierbergs 1% Milk - Half Gallon - 64 oz", "milk-db-1-half", { brand: "Dierbergs", sub: "1%", type: ["lowfat", "store brand"], form: "half gallon" }],
    ["Dierbergs Skim Milk - Half Gallon - 64 oz", "milk-db-skim-half", { brand: "Dierbergs", sub: "skim", type: ["fat free", "nonfat", "store brand"], form: "half gallon" }],
    ["Dierbergs 1% Chocolate Milk - Half Gallon - 64 oz", "milk-db-choc-half", { brand: "Dierbergs", sub: "chocolate", type: ["1%", "store brand"], form: "half gallon" }],

    ["Prairie Farms Lactose Free Whole Milk", "milk-pf-lf-whole", { brand: "Prairie Farms", sub: "whole", type: ["lactose free"], form: "half gallon" }],
    ["Prairie Farms 100% Lactose Free Milk", "milk-pf-lf", { brand: "Prairie Farms", sub: "2%", type: ["lactose free"], form: "half gallon" }],
    ["Lactaid 2% Reduced Fat Milk", "milk-lactaid-2", { brand: "Lactaid", sub: "2%", type: ["lactose free", "reduced fat"], form: "carton" }],
    ["Lactaid One Percent Lowfat Milk", "milk-lactaid-1", { brand: "Lactaid", sub: "1%", type: ["lactose free", "lowfat"], form: "half gallon" }],
    ["Lactaid Fat Free Milk", "milk-lactaid-skim", { brand: "Lactaid", sub: "skim", type: ["lactose free", "fat free"], form: "carton" }],

    ["Horizon Organic 2% Reduced Fat Milk, 128 fl oz Gallon Jug", "milk-horizon-2-gal", { brand: "Horizon Organic", sub: "2%", type: ["organic", "reduced fat"], form: "gallon" }],
    ["Horizon Organic 1% Lowfat Milk, 64 fl oz Half Gallon Carton", "milk-horizon-1-half", { brand: "Horizon Organic", sub: "1%", type: ["organic", "lowfat"], form: "half gallon" }],
    ["Organic Valley® 2% Milk", "milk-ov-2", { brand: "Organic Valley", sub: "2%", type: ["organic"], form: "half gallon" }],
    ["Kalona SuperNatural Organic, Whole Milk, Grass-fed Cows", "milk-kalona-whole", { brand: "Kalona SuperNatural", sub: "whole", type: ["organic", "grass fed"], form: "half gallon" }],

    ["fairlife Whole Ultra-Filtered Milk, Lactose Free", "milk-fairlife-whole", { brand: "fairlife", sub: "whole", type: ["ultra filtered", "lactose free", "high protein"], form: "carton" }],
    ["fairlife 2% Reduced Fat Ultra-Filtered Milk, Lactose Free", "milk-fairlife-2", { brand: "fairlife", sub: "2%", type: ["ultra filtered", "lactose free", "high protein"], form: "carton" }],
    ["a2 Milk Whole Milk", "milk-a2-whole", { brand: "a2 Milk", sub: "whole", type: ["a2 protein"], form: "carton" }],
    ["Prairie Farms Fat Free Milk", "milk-pf-skim", { brand: "Prairie Farms", sub: "skim", type: ["fat free"], form: "half gallon" }]
  ],

  eggs: [
    ["Eggland's Best Classic Large White Eggs, 12 count", "eggs-eb-large-12", { brand: "Eggland's Best", sub: "large", type: ["white", "classic"], form: "dozen", count: 12 }],
    ["Eggland's Best Classic Large White Eggs, 18 count", "eggs-eb-large-18", { brand: "Eggland's Best", sub: "large", type: ["white", "classic", "18 pack"], form: "18 count", count: 18 }],
    ["Eggland's Best Classic Extra Large White Eggs, 12 count", "eggs-eb-xl-12", { brand: "Eggland's Best", sub: "extra large", type: ["white", "classic"], form: "dozen", count: 12 }],
    ["Eggland's Best Classic Extra Large White Eggs, 18 count", "eggs-eb-xl-18", { brand: "Eggland's Best", sub: "extra large", type: ["white", "18 pack"], form: "18 count", count: 18 }],
    ["Eggland's Best Cage Free Large Brown Eggs, 12 count", "eggs-eb-cagefree-12", { brand: "Eggland's Best", sub: "large", type: ["cage free", "brown"], form: "dozen", count: 12 }],
    ["Eggland's Best Cage Free Large Brown Eggs, 18 count", "eggs-eb-cagefree-18", { brand: "Eggland's Best", sub: "large", type: ["cage free", "brown", "18 pack"], form: "18 count", count: 18 }],
    ["Eggland's Best 100% USDA Organic Certified Large Brown Eggs, 12 count", "eggs-eb-organic-12", { brand: "Eggland's Best", sub: "large", type: ["organic", "brown"], form: "dozen", count: 12 }],
    ["Pete & Gerry's Organic Free Range Fresh Brown Large Eggs", "eggs-pg-organic-12", { brand: "Pete & Gerry's", sub: "large", type: ["organic", "free range", "brown"], form: "dozen", count: 12 }],
    ["Pete & Gerry's Organic Pasture Raised Eggs, Large", "eggs-pg-pasture-12", { brand: "Pete & Gerry's", sub: "large", type: ["organic", "pasture raised"], form: "dozen", count: 12 }],
    ["Vital Farms Pasture-Raised Large Grade A Eggs, 12 count", "eggs-vital-12", { brand: "Vital Farms", sub: "large", type: ["pasture raised", "grade a"], form: "dozen", count: 12 }],
    ["Happy Egg Free Range Large Brown Grade A Eggs", "eggs-happy-12", { brand: "Happy Egg", sub: "large", type: ["free range", "brown", "grade a"], form: "dozen", count: 12 }],
    ["Happy Egg Organic Free Range Large Brown Grade A Eggs", "eggs-happy-organic-12", { brand: "Happy Egg", sub: "large", type: ["organic", "free range", "brown"], form: "dozen", count: 12 }],
    ["Ben Roberts' Large Grade A Non-GMO Eggs", "eggs-benroberts-12", { brand: "Ben Roberts'", sub: "large", type: ["non gmo", "grade a"], form: "dozen", count: 12 }],
    ["Ben Roberts' Large Grade A Eggs", "eggs-benroberts-18", { brand: "Ben Roberts'", sub: "large", type: ["grade a", "18 pack"], form: "18 count", count: 18 }],
    ["Eggland's Best Cage Free Hard Cooked Eggs, 6 count", "eggs-eb-hardcooked", { brand: "Eggland's Best", sub: "hard cooked", type: ["cage free", "peeled", "ready to eat"], form: "6 count", count: 6 }]
  ],

  cheese: [
    ["Land O Lakes Cheese, Sharp Cheddar", "cheese-lol-sharp", { brand: "Land O Lakes", sub: "cheddar", type: ["sharp", "yellow"], form: "block" }],
    ["Land O Lakes Cheese, Extra Sharp White Cheddar", "cheese-lol-xsharp-white", { brand: "Land O Lakes", sub: "cheddar", type: ["extra sharp", "white"], form: "block" }],
    ["Land O Lakes Cheese, Sharp White Cheddar", "cheese-lol-sharp-white", { brand: "Land O Lakes", sub: "cheddar", type: ["sharp", "white"], form: "block" }],
    ["Land O Lakes Cheese, Medium Cheddar, Farmstyle Cut", "cheese-lol-medium", { brand: "Land O Lakes", sub: "cheddar", type: ["medium"], form: "block" }],
    ["Essential Everyday White Sharp Cheddar Cheese - 8 oz", "cheese-ee-sharp-white", { brand: "Essential Everyday", sub: "cheddar", type: ["sharp", "white", "store brand"], form: "block" }],
    ["Land O Lakes Shredded Cheese, Sharp Cheddar, Farmstyle Cut", "cheese-lol-shred-sharp", { brand: "Land O Lakes", sub: "cheddar", type: ["sharp", "farmstyle cut"], form: "shredded" }],
    ["Land O Lakes Shredded Cheese, Farmstyle Cut, Sharp White Cheddar", "cheese-lol-shred-white", { brand: "Land O Lakes", sub: "cheddar", type: ["sharp", "white"], form: "shredded" }],
    ["Borden Finely Shredded Cheese, White Sharp Cheddar", "cheese-borden-shred-white", { brand: "Borden", sub: "cheddar", type: ["sharp", "white", "finely shredded"], form: "shredded" }],
    ["Kraft Fat Free Cheddar Shredded Cheese", "cheese-kraft-shred-ff", { brand: "Kraft", sub: "cheddar", type: ["fat free"], form: "shredded" }],
    ["Kraft Natural Lactose Free Shredded Cheddar Cheese 7 oz Bag", "cheese-kraft-shred-lf", { brand: "Kraft", sub: "cheddar", type: ["lactose free"], form: "shredded" }],
    ["Tillamook Farmstyle Extra Sharp White Cheddar Cheese Slices, 7oz, 8ct", "cheese-tillamook-slice-xsharp", { brand: "Tillamook", sub: "cheddar", type: ["extra sharp", "white"], form: "sliced" }],
    ["Tillamook Medium White Cheddar Cheese Slices", "cheese-tillamook-slice-medium", { brand: "Tillamook", sub: "cheddar", type: ["medium", "white"], form: "sliced" }],
    ["Sargento Reserve Series™ Aged White Cheddar Sliced Cheese, 10 slices", "cheese-sargento-slice-aged", { brand: "Sargento", sub: "cheddar", type: ["aged", "white", "reserve"], form: "sliced" }],
    ["Sargento Smokehouse Cheddar™ Sliced Cheese, 11 slices", "cheese-sargento-slice-smoke", { brand: "Sargento", sub: "cheddar", type: ["smokehouse", "smoked"], form: "sliced" }],
    ["Tillamook Sharp White Cheddar Cheese", "cheese-tillamook-block-sharp", { brand: "Tillamook", sub: "cheddar", type: ["sharp", "white"], form: "block" }],
    ["Land O Lakes Cheese Cubes, Extra Sharp, White Cheddar", "cheese-lol-cubes", { brand: "Land O Lakes", sub: "cheddar", type: ["extra sharp", "white", "cubes"], form: "cubes" }]
  ]
};

/* Swiss, provolone and mozzarella came from a second, narrower harvest. */
CELLS.cheese.push(
  ["Essential Everyday Swiss Cheese - 8 oz", "cheese-ee-swiss", { brand: "Essential Everyday", sub: "swiss", type: ["store brand"], form: "block" }],
  ["Sargento Swiss Sliced Cheese, 11 slices", "cheese-sargento-swiss", { brand: "Sargento", sub: "swiss", type: ["slices"], form: "sliced" }],
  ["Cabot Swiss Cheese Slices, 7 oz", "cheese-cabot-swiss", { brand: "Cabot", sub: "swiss", type: ["slices"], form: "sliced" }],
  ["Dierbergs Baby Swiss Cheese - 1 ea", "cheese-db-baby-swiss", { brand: "Dierbergs", sub: "swiss", type: ["baby swiss", "deli", "store brand"], form: "deli" }],

  ["Essential Everyday Sliced Non-Smoked Provolone Cheese - 10 ea", "cheese-ee-provolone", { brand: "Essential Everyday", sub: "provolone", type: ["non smoked", "store brand"], form: "sliced" }],
  ["Sargento Provolone with Smoke Flavor Sliced Cheese, 12 slices", "cheese-sargento-provolone", { brand: "Sargento", sub: "provolone", type: ["smoked", "smoke flavor"], form: "sliced" }],
  ["Tillamook Farmstyle Provolone Cheese Slices, 7oz, 8ct", "cheese-tillamook-provolone", { brand: "Tillamook", sub: "provolone", type: ["farmstyle"], form: "sliced" }],

  ["Essential Everyday Low-Moisture Part Skim Mozzarella Cheese - 8 oz", "cheese-ee-mozzarella", { brand: "Essential Everyday", sub: "mozzarella", type: ["part skim", "low moisture"], form: "block" }],
  ["Essential Everyday Classic Cut Low-Moisture Part Skim Mozzarella Cheese - 32 oz", "cheese-ee-mozzarella-32", { brand: "Essential Everyday", sub: "mozzarella", type: ["part skim", "family size", "biggest"], form: "block" }],
  ["Sargento Natural Whole Milk Mozzarella Shredded Cheese, Traditional Cut", "cheese-sargento-mozz-shred", { brand: "Sargento", sub: "mozzarella", type: ["whole milk", "traditional cut"], form: "shredded" }],
  ["BelGioioso Fresh Mozzarella Cheese, Ball", "cheese-belgioioso-fresh", { brand: "BelGioioso", sub: "mozzarella", type: ["fresh", "ball"], form: "fresh" }],

  ["Essential Everyday Mild Cheddar Cheese - 8 oz", "cheese-ee-mild", { brand: "Essential Everyday", sub: "cheddar", type: ["mild", "store brand"], form: "block" }],
  ["Kraft Mild Cheddar Natural Cheese Block Vacuum Packed", "cheese-kraft-mild", { brand: "Kraft", sub: "cheddar", type: ["mild", "natural"], form: "block" }],
  ["Essential Everyday Classis Cut Mild Cheddar Cheese - 32 oz", "cheese-ee-mild-32", { brand: "Essential Everyday", sub: "cheddar", type: ["mild", "family size", "biggest"], form: "block" }],
  ["Sargento Mild Cheddar Shredded Cheese, Traditional Cut, 8 oz.", "cheese-sargento-mild-shred", { brand: "Sargento", sub: "cheddar", type: ["mild", "traditional cut"], form: "shredded" }]
);

/*
 * Products the demo already carries, hand-written from an earlier read of the
 * same storefront. They keep their existing ids and prices so the cart, the
 * tests and the recorded demos all still mean what they meant before.
 */
const ALREADY_STOCKED = new Set([
  "Bunny Bread Original Soft-Twist White Enriched Bread",
  "Essential Everyday White Enriched Bread - 20 oz",
  "Wonder Bread Classic White Sandwich Bread, Sliced White Bread",
  "Nature's Own White Bread, Thick Sliced Non-GMO Sandwich Bread",
  "Dierbergs Whole Milk - Gallon - 128 oz",
  "Dierbergs 2% Milk - Gallon - 128 oz",
  "Dierbergs 1% Milk - Gallon - 128 oz",
  "Dierbergs Skim Milk - Gallon - 128 oz",
  "Dierbergs Whole Milk - Half Gallon - 64 oz",
  "Dierbergs 2% Milk - Half Gallon - 64 oz",
  "Dierbergs 1% Milk - Half Gallon - 64 oz",
  "Dierbergs Skim Milk - Half Gallon - 64 oz",
  "Eggland's Best Classic Large White Eggs, 12 count",
  "Land O Lakes Cheese, Extra Sharp White Cheddar"
]);

/* ---- build ------------------------------------------------------------- */

/** A card shows the short name, so trim the size and count off the label. */
function shorten(name) {
  let s = name
    .replace(/\s*[-–]\s*[\d.]+\s?(oz|ct|ea|each|gal|lb|g)\b.*$/i, "")
    .replace(/,\s*[\d.]+\s?(oz|ct|count|slices|fl oz)\b.*$/i, "")
    .replace(/,\s*\d+\s?(ct|count)\b.*$/i, "")
    .replace(/\s*\u2122|\u00ae/g, "")
    .trim();
  if (s.length > 40) {
    const cut = s.slice(0, 40);
    s = cut.slice(0, Math.max(cut.lastIndexOf(" "), 24)).replace(/[,\s]+$/, "");
  }
  return s;
}

/*
 * Keywords are what the offline parser matches on when the model is
 * unreachable. They are only ever the product's own words: its brand, what it
 * is, how it is cut, and any badge the store gave it.
 */
function keywordsFor(p) {
  const words = new Set([
    p.brand.toLowerCase(),
    p.subcategory,
    p.form,
    ...p.type,
    ...p.dietary.map((d) => d.replace(/-/g, " "))
  ]);
  if (p.count) words.add(`${p.count} count`);
  if (p.count === 12) words.add("dozen");
  if (p.count === 18) words.add("18 pack");
  return [...words].filter(Boolean);
}

const AISLES = {
  bread: "Aisle 9 - C",
  milk: "Aisle 12 - A",
  eggs: "Aisle 12 - A",
  cheese: "Aisle 12 - B"
};

const missing = [];
const out = {};

for (const [cell, rows] of Object.entries(CELLS)) {
  out[cell] = [];
  for (const [name, id, attrs] of rows) {
    if (ALREADY_STOCKED.has(name)) continue;
    const found = pool.get(name);
    if (!found) {
      missing.push(`${cell}: ${name}`);
      continue;
    }
    const file = `${IMAGES}/${id}.png`;
    if (!existsSync(file)) {
      try {
        execFileSync("curl", ["-sfL", "--max-time", "40", "-o", file, found.image]);
      } catch {
        console.error(`  image failed for ${id}`);
      }
    }
    const product = {
      id,
      sku: id.toUpperCase().replace(/-/g, ""),
      name: found.name,
      shortName: shorten(found.name),
      brand: attrs.brand,
      category: cell,
      subcategory: attrs.sub,
      type: attrs.type,
      size: found.size || "",
      price: `$${(found.priceCents / 100).toFixed(2)}`,
      priceCents: found.priceCents,
      form: attrs.form,
      dietary: found.dietary,
      image: `/dierbergs/products/${id}.png`,
      aisle: AISLES[cell]
    };
    if (attrs.count) product.count = attrs.count;
    product.keywords = keywordsFor(product);
    out[cell].push(product);
  }
}

if (missing.length) {
  console.error(`\n${missing.length} curated products are no longer in the harvest:`);
  for (const m of missing) console.error(`  ${m}`);
  process.exitCode = 1;
}

/* ---- emit -------------------------------------------------------------- */

const q = (s) => JSON.stringify(s);
const arr = (a) => `[${a.map(q).join(", ")}]`;

function render(p) {
  const lines = [
    `    id: ${q(p.id)}`,
    `    sku: ${q(p.sku)}`,
    `    name: ${q(p.name)}`,
    `    shortName: ${q(p.shortName)}`,
    `    brand: ${q(p.brand)}`,
    `    category: ${q(p.category)}`,
    `    subcategory: ${q(p.subcategory)}`,
    `    type: ${arr(p.type)}`,
    `    size: ${q(p.size)}`,
    `    price: ${q(p.price)}`,
    `    priceCents: ${p.priceCents}`,
    `    form: ${q(p.form)}`,
    p.count ? `    count: ${p.count}` : null,
    `    dietary: ${arr(p.dietary)}`,
    `    image: asset(${q(p.image)})`,
    `    aisle: ${q(p.aisle)}`,
    `    keywords: ${arr(p.keywords)}`
  ].filter(Boolean);
  return `  {\n${lines.join(",\n")}\n  }`;
}

const EXPORTS = {
  bread: "breadCellExtras",
  milk: "milkCellExtras",
  eggs: "eggCellExtras",
  cheese: "cheeseCellExtras"
};

const body = Object.entries(out)
  .map(
    ([cell, list]) =>
      `export const ${EXPORTS[cell]}: DemoProduct[] = [\n${list.map(render).join(",\n")}\n];`
  )
  .join("\n\n");

writeFileSync(
  "data/dierbergs-cells.ts",
  `import { asset } from "@/lib/asset-base";
import type { DemoProduct } from "./dierbergs-demo-products";

/**
 * The depth behind each product cell.
 *
 * Generated by scripts/build-cells.mjs from a read of the live Dierbergs
 * storefront: names, sizes, prices and packshots are the store's. Dietary
 * attributes are only the badges the storefront itself puts on a tile, so the
 * conversation can answer "is that gluten free" without guessing. There are no
 * ratings and no nutrition figures here because the storefront does not give
 * us any, and the shopper is told as much rather than told a number.
 *
 * Edit the curation list in the script, not this file.
 */

${body}
`
);

for (const [cell, list] of Object.entries(out)) console.error(`${cell}: +${list.length} new`);
console.error("\nwrote data/dierbergs-cells.ts");
