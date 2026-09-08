/**
 * The same conversation, run against every aisle in the catalogue.
 *
 * Milk was built first and by hand; eggs, bread and cheddar came afterwards
 * as data. This suite exists to prove that is true: nothing here knows what
 * an aisle contains, it just walks the catalogue and expects each one to
 * behave the way milk does.
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:4310/dierbergs-demo/";
const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const fakeSpeech = () => {
  window.__spoken = [];
  window.__script = [];
  class R {
    start() {
      window.__listening = true;
      setTimeout(() => this.onend?.(new Event("end")), 150);
    }
    stop() { window.__listening = false; }
    abort() { window.__listening = false; }
  }
  window.webkitSpeechRecognition = R;
  window.SpeechRecognition = R;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/tts") || url.includes("api.openai.com")) {
      return Promise.reject(new TypeError("neural voice disabled for this test"));
    }
    return realFetch(input, init);
  };
  const synth = {
    getVoices: () => [{ name: "Google US English", lang: "en-US", localService: false }],
    cancel() {},
    speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 30); },
    onvoiceschanged: null
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true, writable: true,
    value: class { constructor(t) { this.text = t; this.onend = null; this.onerror = null; } }
  });
};

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.evaluateOnNewDocument(fakeSpeech);
await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });

const cards = () => page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent.trim()));
const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
const spoken = () => page.evaluate(() => window.__spoken.join(" "));
const type = async (q) => {
  await page.click(".axon-strip-input");
  await page.type(".axon-strip-input", q);
  await page.keyboard.press("Enter");
};
const restart = async () => {
  await page.click(".reset-demo");
  await wait(400);
  await page.evaluate(() => { window.__spoken = []; });
  await page.click(".shopper-nav-pill");
  await page.waitForSelector(".axon-strip-input");
  await wait(700);
};

/*
 * Each aisle: what to ask for, the word that narrows it to one, and what that
 * one costs. Only this table changes when the catalogue grows.
 */
const aisles = [
  { ask: "I need milk",   narrow: "whole milk",          expect: /Whole Milk/i,        price: "$4.44" },
  { ask: "I need eggs",   narrow: "the jumbo ones",      expect: /Jumbo Eggs/i,        price: "$2.04" },
  { ask: "I need bread",  narrow: "the Wonder bread",    expect: /Wonder/i,            price: "$3.68" },
  { ask: "I need cheddar", narrow: "the Cabot",          expect: /Cabot/i,             price: "$4.80" }
];

for (const aisle of aisles) {
  await restart();

  await type(aisle.ask);
  await wait(1500);
  const shelf = await cards();
  check(`"${aisle.ask}" fills the shelf`, shelf.length === 4, `${shelf.length} cards: ${shelf.join(" | ")}`);
  check(`"${aisle.ask}" asks which one`, /which would you like/i.test(await spoken()));
  check(`"${aisle.ask}" buys nothing on its own`, (await cart()) === "0 items $0.00", await cart());

  await type(aisle.narrow);
  await wait(1500);
  const one = await cards();
  check(`"${aisle.narrow}" narrows to one`, one.length === 1, one.join(" | "));
  check(`  and it is the right one`, aisle.expect.test(one[0] ?? ""), one[0] ?? "none");

  let flew = false;
  const watch = setInterval(async () => {
    try { if (await page.$(".flying-item")) flew = true; } catch { /* busy */ }
  }, 40);
  await type("add it to my cart");
  await wait(2800);
  clearInterval(watch);
  check(`  it flies into the cart`, flew);
  check(`  cart reads 1 item ${aisle.price}`, (await cart()) === `1 item ${aisle.price}`, await cart());
}

/* Plurals. "What other milks do you have" is how people actually ask, and a
   word-boundary match on the singular quietly fails on every one of them. */
await restart();
for (const phrase of ["what other milks do you have", "what cheeses do you have", "show me your breads"]) {
  await type(phrase);
  await wait(1500);
  const shelf = await cards();
  check(`plural: "${phrase}"`, shelf.length === 4, `${shelf.length} cards`);
}

/* Superlatives, which are the same question for every aisle. */
await restart();
await type("I need bread");
await wait(1400);
await type("give me the cheapest one");
await wait(2600);
check("cheapest bread is the Bunny at $2.09", (await cart()) === "1 item $2.09", await cart());

await restart();
await type("I need eggs");
await wait(1400);
// A bare superlative narrows the shelf the way "whole milk" does; buying it
// still takes an explicit add, so the shopper is never bought for.
await type("the cheapest");
await wait(1600);
check("a bare superlative narrows without buying", (await cart()) === "0 items $0.00", await cart());
check("and leaves the cheapest showing", /Large Eggs - 12 ct/.test((await cards())[0] ?? ""), (await cards()).join(" | "));
await type("I'll take it");
await wait(2600);
check("cheapest eggs are the Dierbergs large at $1.79", (await cart()) === "1 item $1.79", await cart());

/* An aisle we do not stock should offer the ones we do, not report a failure. */
await restart();
await type("I need pomegranate juice");
await wait(1500);
const miss = await spoken();
check(
  "an item we do not carry offers what we do",
  /milk/i.test(miss) && /eggs/i.test(miss) && !/didnt catch|did not catch|sorry/i.test(miss),
  miss.slice(-110)
);

/* Several aisles at once is still one request. */
await restart();
await type("I need milk, bread and cheese");
await wait(1600);
check("a three-item request shows three", (await cards()).length === 3, (await cards()).join(" | "));

check("no page errors", errors.length === 0, errors.join(" | "));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
