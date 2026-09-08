/**
 * Fills gaps left by the bulk harvest.
 *
 * Driving the storefront's search box repeatedly on one page does not clear
 * it reliably, and a term can quietly return the previous term's results. A
 * fresh load per term is slower and does not have that problem, which is worth
 * it for the handful of subcategories the bulk run missed.
 *
 *   node scripts/harvest-gap.mjs "sourdough bread" "bagels" > /tmp/gap.json
 */
import puppeteer from "puppeteer-core";

const terms = process.argv.slice(2);
if (!terms.length) {
  console.error("usage: harvest-gap.mjs <term> [term...]");
  process.exit(2);
}

const BADGES = [
  "Organic", "Gluten-Free", "Gluten Free", "Vegan", "Plant-Based", "Keto",
  "Low Fat", "Fat Free", "Sugar Free", "Kosher", "Non-GMO", "Dairy-Free"
];

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

const out = {};

for (const term of terms) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1400 });
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
  );
  try {
    await page.goto("https://shop.dierbergs.com/store/dierbergs-markets/storefront", {
      waitUntil: "domcontentloaded",
      timeout: 90000
    });
    await new Promise((r) => setTimeout(r, 8000));
    await page.evaluate(() => {
      for (const b of document.querySelectorAll("button")) {
        if (/^confirm$/i.test(b.textContent?.trim() || "")) b.click();
      }
    });
    await new Promise((r) => setTimeout(r, 4000));

    const box = await page.$('input[type="search"], input[placeholder*="Search" i]');
    if (!box) throw new Error("no search box");
    await box.click();
    await box.type(term, { delay: 40 });
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 11000));
    await page.evaluate(() => window.scrollBy(0, 1600));
    await new Promise((r) => setTimeout(r, 2500));

    const tiles = await page.evaluate(() => {
      const found = [];
      for (const img of document.querySelectorAll("img")) {
        const src = img.currentSrc || img.src || "";
        if (!src.startsWith("http") || img.naturalWidth < 100) continue;
        let node = img.parentElement;
        let text = "";
        for (let up = 0; up < 8 && node; up += 1) {
          const t = (node.innerText || "").trim();
          if (/\$\s?\d/.test(t) && t.length < 260) { text = t; break; }
          node = node.parentElement;
        }
        if (!text) continue;
        found.push({ src, lines: text.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 8) });
      }
      return found;
    });

    out[term] = tiles
      .map((tile) => {
        const priceLine = tile.lines.find((l) => /^Current price: \$\d/.test(l));
        if (!priceLine) return null;
        const priceCents = Math.round(parseFloat(priceLine.replace(/[^\d.]/g, "")) * 100);
        if (!priceCents) return null;
        const candidates = tile.lines.filter(
          (l) => !/\$|current price|original price|% off|^\d+ (oz|ct|each|lb|fl oz|l|ml)$/i.test(l)
        );
        const name = candidates.sort((a, b) => b.length - a.length)[0];
        if (!name || name.length < 8) return null;
        const size = tile.lines.find((l) => /^[\d.]+ ?(oz|ct|each|lb|fl oz|gal|l|ml|g|pk)\b/i.test(l)) || "";
        const badgeLine = tile.lines.find((l) => BADGES.some((b) => l.includes(b))) || "";
        const dietary = [
          ...new Set(BADGES.filter((b) => badgeLine.includes(b)).map((b) => b.toLowerCase().replace(/[\s-]/g, "-")))
        ];
        return { name, size, priceCents, image: tile.src, dietary };
      })
      .filter(Boolean);
    console.error(`  "${term}": ${out[term].length} tiles`);
  } catch (error) {
    console.error(`  "${term}" failed: ${error.message}`);
    out[term] = [];
  }
  await page.close();
}

await browser.close();
process.stdout.write(JSON.stringify(out, null, 2));
