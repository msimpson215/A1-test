/**
 * The milk aisle, talked to the way people actually talk.
 *
 * Straight from a live trip: "I'll take the half gallon. Oh no, replace that
 * with the full gallon. Well, no, I didn't want the full gallon, I wanted the
 * half gallon. No, I want chocolate milk. Well, no, just add chocolate milk."
 * The thing that must never happen is two cartons in the cart because they said
 * two sizes. Also here: lactose, taking something back out, and turning around
 * so many times that the right answer is to stop and ask.
 *
 * The cart badge only carries a count and a total, so the total is how this
 * knows which carton is in there. They are all different: the store's half
 * gallon is $2.69, the gallon is $3.49 on this week's ad, chocolate is $3.57.
 *
 * The model is cut off, so the parser answers on its own. If this passes with
 * no model at all, the structure is in the store rather than in a good guess.
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:3001/dierbergs-demo";
const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const parserOnly = () => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    get: () => ({ getUserMedia: () => Promise.reject(new Error("no microphone here")) })
  });
  class R { start() {} stop() {} abort() {} }
  window.webkitSpeechRecognition = R;
  window.SpeechRecognition = R;
  const synth = {
    getVoices: () => [{ name: "Google US English", lang: "en-US", localService: false }],
    cancel() {},
    speak(u) { setTimeout(() => u.onend?.(), 40); },
    onvoiceschanged: null
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  // Every line spoken aloud, in order, which is the only honest record of what
  // the shopper was told.
  window.__spoken = [];
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
    value: class {
      constructor(t) {
        this.text = t;
        this.onend = null;
        this.onerror = null;
        window.__spoken.push(String(t));
      }
    }
  });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/understand") || url.includes("/api/tts") || url.includes("api.openai.com")) {
      return Promise.reject(new TypeError("model off for this test"));
    }
    return realFetch(input, init);
  };
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
await page.evaluateOnNewDocument(parserOnly);
await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });

const names = () => page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent.trim()));
const spoken = () => page.evaluate(() => window.__spoken.join(" \u00b7 "));
const lastSpoken = () => page.evaluate(() => window.__spoken[window.__spoken.length - 1] || "");
const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
/** Which cards say they are in the cart, so the swap is visible as well as counted. */
const inCart = () =>
  page.$$eval(".db-card", (cards) =>
    cards
      .filter((c) => /in cart/i.test(c.querySelector(".db-add")?.textContent || ""))
      .map((c) => c.querySelector(".db-name")?.textContent.trim())
  );
const type = async (q) => {
  await page.$eval(".axon-strip-input", (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type(".axon-strip-input", q);
  await page.keyboard.press("Enter");
  await wait(1700);
};

await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input");
await wait(800);

// ── The conversation he actually had ───────────────────────────────────────
await type("I need milk");
await type("I'll take the half gallon");
let bag = await cart();
check(
  "\u201CI'll take the half gallon\u201D buys the half gallon, without asking again",
  bag === "1 item $2.69",
  bag
);

await type("oh no, replace that with the full gallon");
bag = await cart();
let flagged = await inCart();
check(
  "\u201Creplace that with the full gallon\u201D swaps it: one carton, the gallon",
  bag === "1 item $3.49",
  bag
);
check(
  "and only the gallon's card says it is in the cart",
  flagged.length === 1 && /gallon|whole milk/i.test(flagged[0] || ""),
  flagged.join(", ") || "(none)"
);

await type("well no, I didn't want the full gallon, I wanted the half gallon");
bag = await cart();
check(
  "\u201CI wanted the half gallon\u201D swaps back, still one carton",
  bag === "1 item $2.69",
  bag
);

// Third turnaround on the same carton: stop moving it and ask.
await type("no, I want chocolate milk");
let said = await lastSpoken();
bag = await cart();
check(
  "a third change of mind stops and asks instead of swapping again",
  /sorry/i.test(said) && /(which one|take your time)/i.test(said),
  said.slice(0, 130)
);
check("and it leaves the cart exactly as it was", bag === "1 item $2.69", bag);

// "Just add" is a second carton, not another swap.
await type("well no, just add chocolate milk");
bag = await cart();
check(
  "\u201Cjust add chocolate milk\u201D adds a second carton and keeps the first",
  bag === "2 items $6.26",
  bag
);

// ── Lactose ────────────────────────────────────────────────────────────────
await type("I'm lactose intolerant");
said = await lastSpoken();
let shelf = await names();
check(
  "lactose intolerance gets an answer, and not a diagnosis",
  /not a doctor/i.test(said) && /lactose/i.test(said),
  said.slice(0, 120)
);
check(
  "and it shows one of each kind, a2 included",
  shelf.some((n) => /lactaid/i.test(n)) &&
    shelf.some((n) => /prairie farms/i.test(n)) &&
    shelf.some((n) => /fairlife/i.test(n)) &&
    shelf.some((n) => /a2/i.test(n)),
  shelf.join(" | ").slice(0, 140)
);
check(
  "and it says plainly that a2 is not lactose free",
  /a2 isn.t lactose free/i.test(said),
  said.slice(0, 200)
);

// ── Taking something back out, without losing the cart ──────────────────────
await type("take the chocolate milk out");
bag = await cart();
check(
  "\u201Ctake the chocolate milk out\u201D takes out that one, not the cart",
  bag === "1 item $2.69",
  bag
);

// ── The aisle can still change with a full cart ─────────────────────────────
await type("what kind of cheeses do you have");
shelf = await names();
check("switching to cheese with a full cart still puts cheese up", shelf.length > 1, `${shelf.length} cards`);
bag = await cart();
check("and the milk is still in the cart", bag === "1 item $2.69", bag);

const everything = await spoken();
check(
  "nothing anywhere told the shopper a shelf was loading, or to refresh",
  !/(still loading|still in progress|page to finish|refresh)/i.test(everything),
  (everything.match(/[^\u00b7]*(loading|refresh)[^\u00b7]*/i) || ["clean"])[0].slice(0, 120)
);

check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 200));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
