/**
 * The shopping trip, spoken the way a person speaks, through the real model.
 *
 * Every other suite cuts the network and tests the parser underneath. This one
 * does the opposite: it is the only proof that a stranger can walk up and talk
 * normally. So nothing here matches on wording — the model writes its own
 * replies and they will differ run to run. It checks what a shopper would
 * check: the right things on the shelf, the right thing in the cart, and
 * nothing bought that was not asked for.
 *
 * These are the sentences from the walkthrough, including the ones that used
 * to break it: plurals, and correcting a size mid-sentence.
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "https://a1-test-fyjq.onrender.com/dierbergs-demo/";
const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Voice is muted, not the brain: /api/understand is the thing under test.
const mute = () => {
  window.__spoken = [];
  window.__turns = [];
  // No microphone, so the live voice line cannot open. That is the point:
  // these suites cover the typed path a machine without one falls back to.
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    get: () => ({ getUserMedia: () => Promise.reject(new Error("no microphone here")) })
  });
  class R {
    start() { setTimeout(() => this.onend?.(new Event("end")), 150); }
    stop() {}
    abort() {}
  }
  window.webkitSpeechRecognition = R;
  window.SpeechRecognition = R;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/tts")) return Promise.reject(new TypeError("audio muted"));
    if (url.includes("/api/understand")) {
      return realFetch(input, init).then(async (r) => {
        window.__turns.push(await r.clone().json());
        return r;
      });
    }
    return realFetch(input, init);
  };
  const synth = {
    getVoices: () => [{ name: "Google US English", lang: "en-US", localService: false }],
    cancel() {},
    speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 20); },
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
if (process.env.TRACE) page.on("console", (m) => console.log("   [app]", m.text()));
await page.evaluateOnNewDocument(mute);
await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });

const cards = () => page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent.trim()));
const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
const spoken = () => page.evaluate(() => window.__spoken.join(" "));
const turns = () => page.evaluate(() => window.__turns);

// The model takes a beat, so every turn waits on the shopper being asked
// again rather than on a fixed sleep.
const say = async (q) => {
  await page.evaluate(() => { window.__spoken = []; });
  await page.click(".axon-strip-input");
  await page.type(".axon-strip-input", q);
  await page.keyboard.press("Enter");
  for (let i = 0; i < 100; i += 1) {
    await wait(200);
    const busy = await page.$eval(".axon-strip", (el) => el.dataset.busy === "true").catch(() => true);
    if (!busy && (await spoken())) return;
  }
  throw new Error(`no answer to "${q}"`);
};

const restart = async () => {
  await page.click(".reset-demo");
  await wait(400);
  await page.click(".shopper-nav-pill");
  await page.waitForSelector(".axon-strip-input");
  await wait(900);
};

await restart();

/* --- the trip ------------------------------------------------------------ */

await say("I need milk");
check("asking for milk fills the milk shelf", (await cards()).length > 1, (await cards()).join(" | "));
check("  and buys nothing yet", (await cart()) === "0 items $0.00", await cart());

let flew = false;
const watch = setInterval(async () => {
  try { if (await page.$(".flying-item")) flew = true; } catch { /* mid-render */ }
}, 40);

await say("put the whole milk in the cart");
await wait(1200);
check("whole milk goes in the cart", /1 item \$4\.44/.test(await cart()), await cart());
check("  and it flies there", flew);

/* "Cheeses" is the plural that used to need teaching. It is also a question
   about the store rather than a request for a product. */
await say("what cheeses do you have");
check("plural 'cheeses' reaches the cheddar", (await cards()).length > 1, (await cards()).join(" | "));
check("  and buys nothing on a question", /1 item/.test(await cart()), await cart());

await say("the Cabot, put it in the cart");
await wait(1200);
const afterCheese = await cart();
check("a cheddar joins the milk", /2 items/.test(afterCheese), afterCheese);

/* The correction. Nothing in the catalogue is an 18 count, so this is the
   model being asked to rule out a thing that is not there and still land on
   the dozen — exactly the kind of sentence a parser cannot survive. */
await say("I need eggs");
check("asking for eggs fills the egg shelf", (await cards()).length > 1, (await cards()).join(" | "));

await say("nope, not the 18. I need a dozen eggs");
const eggs = await cards();
check("a mid-sentence correction still lands on eggs", eggs.length >= 1, eggs.join(" | "));
check("  and every one left is a dozen", eggs.every((n) => /12 (ct|count)/i.test(n)), eggs.join(" | "));

/* Four dozens all fit "a dozen eggs", so being asked which is the right
   answer, not a failure. Naming one has to finish the job. */
await say("the Eggland's");
await wait(600);
await say("put it in the cart");
await wait(1200);
const finalCart = await cart();
check("eggs join the cart", /3 items/.test(finalCart), finalCart);

/* Something the store does not stock. It must say so rather than invent it. */
await say("do you have any pomegranate juice");
const miss = await spoken();
check(
  "an item we do not carry is admitted, not invented",
  !/pomegranate juice.*\$/i.test(miss),
  miss.slice(0, 140)
);
check("  and the cart is untouched", /3 items/.test(await cart()), await cart());

clearInterval(watch);

const seen = await turns();
const models = [...new Set(seen.map((t) => t.model))];
check("every turn was answered by the model, not the parser", seen.length >= 8, `${seen.length} turns`);
check("  and it is the best one on the account", models.length === 1 && /^gpt-5/.test(models[0]), models.join(", "));

check("no page errors", errors.length === 0, errors.join(" | "));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
