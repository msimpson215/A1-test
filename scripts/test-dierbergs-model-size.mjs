/**
 * The size the shopper says beats the size the model picks.
 *
 * Every other suite cuts the model off and exercises the parser. This one does
 * the opposite: it answers as a model that got it wrong — a half-gallon request
 * handed back the gallon — because that is what a live Realtime session was
 * actually doing, and no amount of parser testing catches it. Whichever brain
 * chooses the cartons, the shelf has to hold the size that was asked for.
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:3001/dierbergs-demo";
const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const GALLONS = ["dierbergs-whole-gal", "dierbergs-2pct-gal", "dierbergs-1pct-gal", "dierbergs-skim-gal"];

// Answers as a model that ignored the size, which is the bug being fixed.
const wrongSizeModel = () => {
  window.__spoken = [];
  window.__script = [];
  window.__asked = [];
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    get: () => ({ getUserMedia: () => Promise.reject(new Error("no microphone here")) })
  });
  class R {
    start() { window.__listening = true; }
    stop() { window.__listening = false; }
    abort() { window.__listening = false; }
  }
  window.webkitSpeechRecognition = R;
  window.SpeechRecognition = R;
  const voices = [{ name: "Google US English", lang: "en-US", localService: false }];
  const synth = {
    getVoices: () => voices,
    cancel() {},
    speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 40); },
    onvoiceschanged: null
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
    value: class { constructor(t) { this.text = t; this.onend = null; this.onerror = null; } }
  });

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/tts") || url.includes("api.openai.com")) {
      return Promise.reject(new TypeError("voice pipe disabled for this test"));
    }
    if (url.includes("/api/understand")) {
      const said = JSON.parse(init.body).said;
      window.__asked.push(said);
      // The whole point: it names the gallons no matter what was asked for.
      return new Response(
        JSON.stringify({
          action: "show",
          aisle: "milk",
          products: window.__wrongIds,
          say: "Here are the whole gallons.",
          hint: "Pick one.",
          model: "pretend-model"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
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
await page.evaluateOnNewDocument(wrongSizeModel);
await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
await page.evaluate((ids) => { window.__wrongIds = ids; }, GALLONS);

const cards = () => page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent.trim()));
const sizes = () => page.$$eval(".db-card .db-size", (els) => els.map((e) => e.textContent.trim()));
const type = async (q) => {
  await page.$eval(".axon-strip-input", (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type(".axon-strip-input", q);
  await page.keyboard.press("Enter");
};

await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input");
await wait(800);

/* The strip has to say which voice is answering without being asked. */
const badge = await page.$eval(".axon-engine", (el) => el.textContent.trim()).catch(() => "");
check("the strip names the voice that is answering", /browser voice|realtime gpt/i.test(badge), badge);

/* 1. "A half gallon" against a model that answers with gallons. */
await type("I need a half gallon of milk.");
await wait(1600);
const half = await cards();
const halfSizes = await sizes();
check(
  "the model was actually asked",
  (await page.evaluate(() => window.__asked.length)) === 1,
  JSON.stringify(await page.evaluate(() => window.__asked))
);
check(
  "a half-gallon request never shows a gallon",
  halfSizes.length > 0 && halfSizes.every((s) => /64 ?oz|0\.5 ?gal/i.test(s)),
  `${half.join(" | ")} · ${halfSizes.join(", ")}`
);

/* 2. "No, I want the half" after it put gallons up. */
await type("Actually make it a gallon.");
await wait(1600);
const gal = await sizes();
check(
  "a gallon request shows gallons",
  gal.length > 0 && gal.every((s) => /128 ?oz|1 ?gal/i.test(s)),
  gal.join(", ")
);

await type("No no I want the half.");
await wait(1600);
const backSizes = await sizes();
const backNames = await cards();
check(
  "\u201Cno, I want the half\u201D switches to half gallons",
  backSizes.length > 0 && backSizes.every((s) => /64 ?oz|0\.5 ?gal/i.test(s)),
  `${backNames.join(" | ")} · ${backSizes.join(", ")}`
);

/* 3. The cart cannot end up with the size that was refused. */
const addable = await page.$$(".db-card .db-add");
if (addable[0]) await addable[0].click();
await wait(2800);
const cart = await page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
check("adding from that shelf buys a half gallon", /1 item \$2\.69|1 item \$3\.57/.test(cart), cart);

check("no page errors", errors.length === 0, errors.join(" | "));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
