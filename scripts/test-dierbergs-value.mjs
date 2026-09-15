/**
 * "What's the best deal on milk? I'm trying to save money."
 *
 * Two questions that sound like one and are not. The cheapest milk in this store
 * is a $2.69 half gallon. The best deal is a $3.49 gallon — nearly a penny and a
 * half less per ounce, and on the ad. Someone with three dollars in their pocket
 * wants the first answer; someone trying to spend less on milk this month wants
 * the second, and handing either of them the other one is a wrong answer to the
 * question they asked.
 *
 * The reason this cannot be left to the model to work out is the labels. This
 * store writes its sizes five ways — "128 oz", "1 gal", "0.5 gal", "96 fl oz",
 * "227 g" — and the same half gallon appears as "64 oz" on the Dierbergs carton
 * and "0.5 gal" on the Prairie Farms one. A model doing arithmetic on those gets
 * it right most times and confidently wrong the rest, and a wrong answer about
 * saving money is precisely the one a shopper checks.
 */
import fs from "node:fs";
import {
  byValue,
  findProducts,
  payCents,
  shelves,
  specials,
  specialsFor,
  unitPrice,
  wholeStore
} from "../data/dierbergs-catalogue.ts";
import { allNotes } from "../data/dierbergs-aisle-notes.ts";
import { expandRules } from "./lib/assembled-brief.mjs";

const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

// ── The ad ──────────────────────────────────────────────────────────────────
console.log("— this week's ad —");

/*
 * A special whose product id does not resolve is dropped in silence. That is not
 * hypothetical: the Prairie Farms deal was written against an id that did not
 * exist and simply never appeared, and nothing anywhere said so.
 */
const everyId = new Set(wholeStore().map((p) => p.id));
const orphans = Object.entries(specials).flatMap(([aisle, list]) =>
  list.filter((s) => !everyId.has(s.productId)).map((s) => `${aisle}:${s.productId}`)
);
check("every special names a product this store actually stocks", orphans.length === 0, orphans.join(", "));

const milkDeals = specialsFor("milk");
check(
  "an aisle can hold more than one deal, and milk does",
  milkDeals.length === 2,
  milkDeals.map(({ product, special }) => `${product.shortName} ${money(special.nowCents)}`).join(", ")
);
check(
  "the store's own leads it and a brand is on it too",
  /dierbergs/i.test(milkDeals[0].product.brand ?? milkDeals[0].product.name) &&
    milkDeals.some(({ product }) => /prairie farms/i.test(product.name)),
  milkDeals.map(({ product }) => product.name).join(" | ")
);

/* An ad price the cart ignores is a claim, not a special. */
for (const { product, special } of Object.values(specials).flat().map((special) => ({
  special,
  product: wholeStore().find((p) => p.id === special.productId)
}))) {
  if (!product) continue;
  check(
    `${product.shortName} rings up at its ad price`,
    payCents(product) === special.nowCents,
    `${money(payCents(product))} against ${money(special.nowCents)}`
  );
}

// ── Value ───────────────────────────────────────────────────────────────────
console.log("\n— per ounce, and per egg —");

const milk = shelves.find((s) => s.id === "milk").products;
const gallon = milk.find((p) => p.id === "dierbergs-whole-gal");
const half = milk.find((p) => p.id === "dierbergs-whole-half");

check(
  "a gallon and a half gallon are compared on the same footing",
  unitPrice(gallon) === "2.7¢/oz" && unitPrice(half) === "4.2¢/oz",
  `${unitPrice(gallon)} against ${unitPrice(half)}`
);

/*
 * The label trap, stated as a test. These two are the same volume written two
 * ways, and one of them is on the ad, so the unit prices must differ by exactly
 * the discount and not by an accident of parsing.
 */
const prairie = milk.find((p) => p.id === "milk-pf-lf-whole");
const prairieOther = milk.find((p) => p.id === "milk-pf-lf");
check(
  '"0.5 gal" is read as the same 64 ounces as "64 oz"',
  unitPrice(prairieOther) === "8.4¢/oz" && unitPrice(half) === "4.2¢/oz",
  `${prairieOther.size} at ${unitPrice(prairieOther)}, ${half.size} at ${unitPrice(half)}`
);
check(
  "and the ad price is what the unit price is worked out from",
  unitPrice(prairie) === "7.0¢/oz",
  `${prairie.shortName} ${money(payCents(prairie))} of ${prairie.price} → ${unitPrice(prairie)}`
);
check(
  "grams too, so a 227 g block is not priced as 227 ounces",
  (() => {
    const grams = wholeStore().find((p) => /\bg$/.test(p.size.trim()));
    if (!grams) return false;
    return Number.parseFloat(unitPrice(grams)) > 10;
  })(),
  (() => {
    const grams = wholeStore().find((p) => /\bg$/.test(p.size.trim()));
    return grams ? `${grams.size} at ${unitPrice(grams)}` : "no gram-sized product";
  })()
);
check(
  "eggs are priced per egg, not per carton",
  /each$/.test(unitPrice(milk.length ? shelves.find((s) => s.id === "eggs").products[0] : null) ?? ""),
  unitPrice(shelves.find((s) => s.id === "eggs").products[0])
);

/*
 * Bread is the mixed-unit aisle: a 20 oz loaf and a pack of 10 rolls. Cents per
 * ounce against cents per roll is not a comparison, so the odd one out sits the
 * question out rather than turning up at the top looking like a bargain.
 */
const bread = shelves.find((s) => s.id === "bread").products;
const rankedBread = byValue(bread);
check(
  "an aisle measured two ways is ranked in the one most of it uses",
  rankedBread.length > 0 && rankedBread.every((p) => /oz\b/.test(p.size)),
  `${rankedBread.length} of ${bread.length} bread products ranked`
);

// ── The two questions ───────────────────────────────────────────────────────
console.log("\n— the cheapest, and the best deal —");

const cheapest = findProducts("what's the cheapest milk", "milk").products;
check(
  "the cheapest milk is the lowest price on the shelf",
  cheapest.length === 1 && payCents(cheapest[0]) === 269,
  `${cheapest.map((p) => `${p.shortName} ${money(payCents(p))}`).join(", ")}`
);

for (const said of [
  "what's the best deal on milk",
  "I'm trying to save money",
  "which milk is the best value",
  "what gives me the most for my money"
]) {
  const best = findProducts(said, "milk").products;
  check(
    `“${said}” answers with value, not with the smallest price tag`,
    best.length > 1 && best[0].id === "dierbergs-whole-gal",
    best.map((p) => `${p.shortName} ${unitPrice(p)}`).join(", ")
  );
}
check(
  // Three, so the answer carries its own reason rather than asserting a card.
  "and it shows enough of them to see why",
  findProducts("what's the best deal on milk", "milk").products.length === 3
);

/*
 * The eggs case is the one that proves this is not just repeating the ad back.
 * The advertised eggs are an 18 count at $5.49, which is 30 cents an egg; the
 * store's own dozen at $1.79 is 15. The honest answer to "best deal on eggs" is
 * the one that is not on the ad.
 */
const bestEggs = findProducts("best deal on eggs", "eggs").products;
check(
  "the best deal is the best deal, even when the advertised one is dearer",
  bestEggs[0].id !== "eggs-eb-large-18" && unitPrice(bestEggs[0]) === "15¢ each",
  bestEggs.map((p) => `${p.shortName} ${unitPrice(p)}`).join(", ")
);

// ── What the model is told ──────────────────────────────────────────────────
console.log("\n— and the model is told all of it —");

const realtime = fs.readFileSync("lib/dierbergs-realtime.ts", "utf8");
const understand = fs.readFileSync("lib/dierbergs-understand.ts", "utf8");
const server = fs.readFileSync("server/server.js", "utf8");
// Briefs are hard-wrapped prose, so a sentence to look for is as likely as not to
// have a line break in the middle of it. Match on the words, not the wrapping.
const flat = (text) => text.replace(/\s+/g, " ");
const brief = flat(expandRules(realtime.split("const BRIEF = `")[1].split("`;")[0]));
const typed = flat(server);

check(
  "both paths hand the model the unit price rather than the arithmetic",
  /unit: unitPrice\(p\)/.test(realtime) && /unit: unitPrice\(p\)/.test(understand)
);
check(
  "and both are told not to recalculate it",
  /arithmetic on them goes wrong/.test(brief) && /arithmetic on them goes wrong/.test(typed)
);
check(
  "both know an aisle can have more than one deal",
  /more than one in some aisles/.test(brief) && /Some aisles have more than one/.test(typed)
);
check(
  "neither still claims there is exactly one per aisle",
  !/One product in each aisle is on this week's ad/.test(brief) &&
    !/One product per aisle is on this week's ad/.test(typed)
);

/*
 * The brand question, which is where the money and the honesty meet. Asked what
 * they would recommend, the answer is the store's own, with the reason said out
 * loud — the store owns that margin and can defend the sentence. What must never
 * happen is a supplier buying it.
 */
check(
  "asked which brand, it recommends the store's own and says why",
  /the Dierbergs one leads/.test(brief) &&
    /nearly always the cheaper per ounce/.test(brief) &&
    /the answer is the store's own, with the reason attached/.test(brief)
);
check(
  "it will not oversell it or talk anyone out of what they came for",
  /Never dress it up as the better product when it is not/.test(brief) &&
    /never argue anyone out of the brand they came in for/.test(brief)
);
check(
  "and no supplier's money is in the recommendation",
  /no supplier's money is in any of this/.test(brief) &&
    /advice can be bought it is worth nothing/.test(brief)
);

/*
 * What replaced the brief's token budget.
 *
 * That budget was written when a session opened with the brief and a 192-token
 * index of the aisles, so the brief was nearly the whole cost of starting a
 * conversation. It now opens with the whole store and every aisle's notes,
 * deliberately, and the brief's absolute size stopped being the number worth
 * watching — it had been raised twice for real features, and a limit that moves
 * every time it binds is not a limit.
 *
 * The figure that is worth watching is the share. Instructions should be the small
 * part of what opens a conversation and the store should be the large part; a
 * brief growing to rival the catalogue means rules are being restated, which is
 * the failure the old cap was really guarding against.
 */
/*
 * The store payload, measured on the same fields productsForModel sends. It is
 * rebuilt here rather than imported because that module imports the shared rules
 * as JSON, which plain node will not load without an import attribute — and the
 * field list is asserted below, so this cannot drift away from it in silence.
 */
const storeBytes = JSON.stringify(
  wholeStore().map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    kind: p.subcategory,
    also: p.type,
    form: p.form,
    size: p.size,
    price: p.price,
    unit: unitPrice(p),
    deal: undefined,
    dealThrough: undefined,
    diet: p.dietary
  }))
).length;
check(
  "the store is still described to the model on the fields measured here",
  ["id:", "name:", "brand:", "kind:", "also:", "form:", "size:", "price:", "unit:", "deal:", "diet:"].every(
    (field) => realtime.includes(field)
  )
);
const opening = brief.length + storeBytes + allNotes().length;
check(
  "instructions are the small part of what opens a session, and the store the large",
  brief.length / opening < 0.4,
  `brief ~${Math.round(brief.length / 4)} of ~${Math.round(opening / 4)} tokens, ${Math.round(
    (brief.length / opening) * 100
  )}%`
);

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
