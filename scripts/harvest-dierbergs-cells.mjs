/**
 * Harvests real Dierbergs product data for the demo's product cells.
 *
 * Everything written here comes off the live storefront: names, sizes, prices,
 * packshots, and the dietary badges the site itself puts on a tile. Nothing is
 * inferred. If Dierbergs does not say a loaf is gluten free, this does not say
 * it either, because the demo has to be able to answer "is it gluten free"
 * honestly in front of a buyer.
 *
 *   node scripts/harvest-dierbergs-cells.mjs > /tmp/cells.json
 *
 * One browser, one storefront load, many searches: reloading the storefront
 * per term costs half a minute each and there are thirty of them.
 */
import puppeteer from "puppeteer-core";

const CELLS = {
  bread: {
    // Broad enough to cover the questions asked of the cell, and no broader:
    // a search for "bread" alone returns doughnuts and vodka.
    terms: [
      "white bread",
      "wheat bread",
      "sourdough bread",
      "rye bread",
      "bagels",
      "gluten free bread",
      "whole grain bread",
      "brioche bread"
    ],
    keep: /\b(bread|loaf|bagel|muffin|bun|roll|brioche|challah|baguette|ciabatta)\b/i,
    drop: /\b(doughnut|donut|vodka|soda|crumb|stuffing|pudding|mix|dog|crouton|cake)\b/i
  },
  milk: {
    terms: [
      "whole milk gallon",
      "2% milk",
      "1% milk",
      "skim milk",
      "lactose free milk",
      "organic milk",
      "half gallon milk"
    ],
    keep: /\bmilk\b/i,
    drop: /\b(almond|oat|soy|coconut|cashew|shake|chocolate drink|creamer|condensed|evaporated|powder|formula|goat)\b/i
  },
  eggs: {
    terms: [
      "large eggs",
      "18 count eggs",
      "jumbo eggs",
      "cage free eggs",
      "organic eggs",
      "brown eggs",
      "extra large eggs"
    ],
    keep: /\begg/i,
    drop: /\b(eggo|nog|substitute|salad|roll|noodle|plant based|beater)\b/i
  },
  cheese: {
    terms: [
      "cheddar cheese",
      "sharp cheddar cheese",
      "shredded cheddar cheese",
      "sliced cheddar cheese",
      "swiss cheese",
      "provolone cheese",
      "mozzarella cheese"
    ],
    keep: /\b(cheddar|swiss|provolone|mozzarella|colby|monterey)\b/i,
    drop: /\b(cracker|popcorn|puff|sauce|dip|soup|cake|pizza|mac|snack|stick pretzel)\b/i
  }
};

// Badges the storefront puts on a tile. These are the only dietary claims the
// demo is allowed to repeat.
const BADGES = [
  "Organic",
  "Gluten-Free",
  "Gluten Free",
  "Vegan",
  "Plant-Based",
  "Keto",
  "Low Fat",
  "Fat Free",
  "Sugar Free",
  "Kosher",
  "Non-GMO",
  "Dairy-Free"
];

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1400 });
await page.setUserAgent(
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
);

await page.goto("https://shop.dierbergs.com/store/dierbergs-markets/storefront", {
  waitUntil: "domcontentloaded",
  timeout: 90000
});
await new Promise((r) => setTimeout(r, 8000));

// The store picker sits over everything until it is confirmed.
await page.evaluate(() => {
  for (const b of document.querySelectorAll("button")) {
    if (/^confirm$/i.test(b.textContent?.trim() || "")) b.click();
  }
});
await new Promise((r) => setTimeout(r, 4000));

const scrape = () =>
  page.evaluate(() => {
    const out = [];
    for (const img of document.querySelectorAll("img")) {
      const src = img.currentSrc || img.src || "";
      if (!src.startsWith("http") || img.naturalWidth < 100) continue;
      let node = img.parentElement;
      let text = "";
      for (let up = 0; up < 8 && node; up += 1) {
        const t = (node.innerText || "").trim();
        if (/\$\s?\d/.test(t) && t.length < 260) {
          text = t;
          break;
        }
        node = node.parentElement;
      }
      if (!text) continue;
      out.push({
        src,
        lines: text.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8)
      });
    }
    return out;
  });

async function search(term) {
  const box = await page.$('input[type="search"], input[placeholder*="Search" i]');
  if (!box) throw new Error("no search box");
  await box.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await box.type(term, { delay: 30 });
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 9000));
  // Pull the lazy grid in so the whole first page of results renders.
  await page.evaluate(() => window.scrollBy(0, 1600));
  await new Promise((r) => setTimeout(r, 2500));
  return scrape();
}

function parse(tile) {
  const { lines, src } = tile;
  const priceLine = lines.find((l) => /^Current price: \$\d/.test(l));
  if (!priceLine) return null;
  const priceCents = Math.round(parseFloat(priceLine.replace(/[^\d.]/g, "")) * 100);
  if (!priceCents) return null;

  // The name is the longest line that is not a price or a badge.
  const candidates = lines.filter(
    (l) => !/\$|current price|original price|% off|^\d+ (oz|ct|each|lb|fl oz|l|ml)$/i.test(l)
  );
  const name = candidates.sort((a, b) => b.length - a.length)[0];
  if (!name || name.length < 8) return null;

  const size = lines.find((l) => /^[\d.]+ ?(oz|ct|each|lb|fl oz|gal|l|ml|g|pk)\b/i.test(l)) || "";

  const badgeLine = lines.find((l) => BADGES.some((b) => l.includes(b))) || "";
  const dietary = BADGES.filter((b) => badgeLine.includes(b)).map((b) =>
    b.toLowerCase().replace(/[\s-]/g, "-")
  );

  return { name, size, priceCents, image: src, dietary: [...new Set(dietary)] };
}

const harvested = {};

for (const [cell, spec] of Object.entries(CELLS)) {
  const byName = new Map();
  for (const term of spec.terms) {
    let tiles = [];
    try {
      tiles = await search(term);
    } catch (error) {
      console.error(`  "${term}" failed: ${error.message}`);
      continue;
    }
    let kept = 0;
    for (const tile of tiles) {
      const product = parse(tile);
      if (!product) continue;
      if (!spec.keep.test(product.name) || spec.drop.test(product.name)) continue;
      if (byName.has(product.name)) continue;
      byName.set(product.name, { ...product, foundVia: term });
      kept += 1;
    }
    console.error(`  ${cell} / "${term}": ${kept} new (${byName.size} total)`);
  }
  harvested[cell] = [...byName.values()];
}

await browser.close();
process.stdout.write(JSON.stringify(harvested, null, 2));
