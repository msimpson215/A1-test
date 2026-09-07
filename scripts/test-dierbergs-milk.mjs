/**
 * The basic loop, one item, nothing else: ask for milk, see milk, add milk,
 * watch the cart change. If this fails the demo has no story to tell.
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:3001/dierbergs-demo";
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
      const line = window.__script.shift();
      setTimeout(() => {
        if (!window.__listening) return;
        if (!line) return this.onend?.(new Event("end"));
        window.__listening = false;
        this.onresult?.({
          resultIndex: 0,
          results: { length: 1, 0: { length: 1, isFinal: true, 0: { transcript: line, confidence: 0.9 } } }
        });
      }, 200);
    }
    stop() { window.__listening = false; }
    abort() { window.__listening = false; }
  }
  window.webkitSpeechRecognition = R;
  window.SpeechRecognition = R;
  const voices = [{ name: "Google US English", lang: "en-US", localService: false }];
  const synth = {
    getVoices: () => voices,
    cancel() {},
    speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 50); },
    onvoiceschanged: null
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
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

const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
const cards = () => page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent.trim()));
const type = async (q) => {
  await page.$eval(".axon-strip-input", (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type(".axon-strip-input", q);
  await page.keyboard.press("Enter");
};

/* 1. Dierbergs, untouched, with an empty cart. */
check("cart starts empty", (await cart()) === "0 items $0.00", await cart());
check("no shelf showing before anyone asks", (await page.$(".axon-merch")) === null);

/* 2. Activation greets and opens the strip. */
await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input");
await wait(900);
const greeting = await page.evaluate(() => window.__spoken.join(" "));
check("greeting is spoken", greeting.length > 0);
check(
  "greeting says what it is and offers to shop",
  /personal assistant/i.test(greeting) && /not a chatbot/i.test(greeting) && /shop for today/i.test(greeting),
  greeting
);

/* 3. "How does this work?" explains itself. */
await type("What is this? How does this work?");
await wait(1600);
const explained = await page.evaluate(() => window.__spoken.join(" "));
check(
  "it explains how to use it",
  /talk to the store/i.test(explained) && /add it to my cart/i.test(explained),
  explained.slice(-150)
);
check("explaining did not open a shelf", (await page.$(".axon-merch")) === null);

/* 4. Asking for milk brings up the milk, and asks which kind. */
await type("I need milk.");
await wait(1800);
const wall = await cards();
check("the milk wall appears", wall.length === 4, `${wall.length} cards`);
check(
  "all four kinds are there",
  ["Whole", "2%", "1%", "Skim"].every((k) => wall.some((n) => n.includes(k))),
  wall.join(" | ")
);
check("asking did not buy anything", (await cart()) === "0 items $0.00", await cart());
check(
  "it asks which kind",
  /which would you like/i.test(await page.evaluate(() => window.__spoken.join(" ")))
);
check(
  "the input clears so the next request starts empty",
  (await page.$eval(".axon-strip-input", (el) => el.value)) === "",
  JSON.stringify(await page.$eval(".axon-strip-input", (el) => el.value))
);

/* 5. An unspecific add is a question, not a guess. */
await page.type(".axon-strip-input", "Add it to my cart.");
await page.keyboard.press("Enter");
await wait(1600);
check("it will not guess which milk", (await cart()) === "0 items $0.00", await cart());

/* 6. Naming a kind narrows the shelf to one. */
await page.type(".axon-strip-input", "Two percent.");
await page.keyboard.press("Enter");
await wait(1800);
const narrowed = await cards();
check("the shelf narrows to one", narrowed.length === 1, narrowed.join(" | "));
check("and it is the 2%", /2%/.test(narrowed[0] ?? ""), narrowed[0] ?? "none");

/* 7. Now adding flies the jug to the cart, and only then does the cart move. */
let sawFlyer = false;
let cartDuringFlight = null;
const watch = setInterval(async () => {
  try {
    if (await page.$(".flying-item")) {
      sawFlyer = true;
      cartDuringFlight = await cart();
    }
  } catch { /* page busy */ }
}, 40);

await page.type(".axon-strip-input", "Add it to my cart.");
await page.keyboard.press("Enter");
await wait(2800);
clearInterval(watch);

check("the jug visibly flies to the cart", sawFlyer);
check("the cart waits until the jug lands", cartDuringFlight === "0 items $0.00", String(cartDuringFlight));
check("cart reads 1 item $4.24", (await cart()) === "1 item $4.24", await cart());
check("the card shows it is in the cart", (await page.$(".db-add.is-added")) !== null);

/* 5. Same loop, spoken, with no microphone press. */
await page.click(".reset-demo");
await wait(500);
check("reset empties the cart", (await cart()) === "0 items $0.00", await cart());

await page.evaluate(() => { window.__script = ["I need milk", "I will take the two percent"]; });
await page.click(".shopper-nav-pill");
let listened = false;
for (let i = 0; i < 120 && !listened; i += 1) {
  if (await page.$(".axon-mic")) {
    listened = await page.$eval(".axon-mic", (el) => el.className.includes("is-listening"));
  }
  if (!listened) await wait(50);
}
check("listens on its own after the greeting", listened);

for (let i = 0; i < 40; i += 1) {
  await wait(400);
  if ((await page.evaluate(() => window.__script.length)) === 0) break;
}
await wait(3500);
check("the spoken loop also reaches 1 item $4.24", (await cart()) === "1 item $4.24", await cart());
check("no microphone press was needed", true);

check("no page errors", errors.length === 0, errors.join(" | "));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
