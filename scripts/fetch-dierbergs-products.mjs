/**
 * Reads product tiles off the live Dierbergs storefront for a search term and
 * prints name, size, price and packshot URL. The storefront renders client
 * side, so this has to be a real browser rather than a fetch.
 *
 *   node scripts/fetch-dierbergs-products.mjs "large eggs"
 */
import puppeteer from "puppeteer-core";

const term = process.argv[2];
if (!term) {
  console.error("usage: fetch-dierbergs-products.mjs <search term>");
  process.exit(2);
}

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200 });
await page.setUserAgent(
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
);

await page.goto("https://shop.dierbergs.com/store/dierbergs-markets/storefront", {
  waitUntil: "domcontentloaded",
  timeout: 90000
});
await new Promise((r) => setTimeout(r, 8000));

// The storefront opens behind a "How would you like to shop?" dialog, and
// nothing renders a price until it is answered.
await page.evaluate(() => {
  for (const b of document.querySelectorAll("button")) {
    if (/^confirm$/i.test(b.textContent?.trim() || "")) b.click();
  }
});
await new Promise((r) => setTimeout(r, 4000));

// Drive the real search field; the q parameter on its own is ignored.
const box = await page.$('input[type="search"], input[placeholder*="Search" i]');
if (!box) throw new Error("no search box found");
await box.click();
await box.type(term, { delay: 45 });
await page.keyboard.press("Enter");
await new Promise((r) => setTimeout(r, 12000));
await page.screenshot({ path: "/tmp/store-search.png" });

const items = await page.evaluate(() => {
  const out = [];
  for (const img of document.querySelectorAll("img")) {
    const src = img.currentSrc || img.src || "";
    if (!src.startsWith("http") || img.naturalWidth < 100) continue;
    // The tile markup carries no stable class or role, so climb until the
    // element around the packshot also holds a price, and no further.
    let node = img.parentElement;
    let text = "";
    for (let up = 0; up < 8 && node; up += 1) {
      const t = (node.innerText || "").trim();
      if (/\$\s?\d/.test(t) && t.length < 220) { text = t; break; }
      node = node.parentElement;
    }
    if (!text) continue;
    out.push({ src, text: text.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 7) });
  }
  return out;
});

const seen = new Set();
for (const it of items) {
  const key = it.text.join("|");
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(JSON.stringify(it));
}
console.log(`\n${seen.size} distinct tiles for "${term}"`);
await browser.close();
