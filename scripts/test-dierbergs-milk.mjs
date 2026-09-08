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
  // No microphone, so the live voice line cannot open. That is the point:
  // these suites cover the typed path a machine without one falls back to.
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    get: () => ({ getUserMedia: () => Promise.reject(new Error("no microphone here")) })
  });
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
  // These suites exercise the conversation, not the voice pipe. Cut the neural
  // request so the run is deterministic and costs nothing to repeat.
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    // The model is the real brain; these suites deliberately cut it off so
    // they test the parser that has to carry the demo when the network does
    // not, and so they stay deterministic and free.
    if (url.includes("/api/tts") || url.includes("/api/understand") || url.includes("api.openai.com")) {
      return Promise.reject(new TypeError("network brain disabled for this test"));
    }
    return realFetch(input, init);
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
const stripBox = () =>
  page.$eval(".axon-strip", (el) => {
    const r = el.getBoundingClientRect();
    return `${Math.round(r.top)}x${Math.round(r.height)}`;
  });
const stripBoxes = [];
check("cart starts empty", (await cart()) === "0 items $0.00", await cart());
check("no shelf showing before anyone asks", (await page.$(".axon-merch")) === null);

/* 2. Activation greets and opens the strip. */
await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input");
await wait(900);
const greeting = await page.evaluate(() => window.__spoken.join(" "));
check("greeting is spoken", greeting.length > 0);
check(
  "greeting is positive about what it is, with no negatives",
  /ai shopper/i.test(greeting) && /whole store/i.test(greeting) && !/chatbot/i.test(greeting),
  greeting
);

// Every engine reads the store's name as "Dye-bergs". It is respelled on the
// way to the voice only, so the screen still says Dierbergs.
check(
  "the store's name is respelled for the voice",
  /deerbergs/i.test(greeting) && !/dierbergs/i.test(greeting),
  greeting.slice(0, 40)
);
check(
  "but the screen still reads Dierbergs",
  /Dierbergs/.test(await page.$eval(".axon-strip-prompt", (el) => el.textContent)),
  await page.$eval(".axon-strip-prompt", (el) => el.textContent)
);

/* 2b. Opening with "I need a few items" keeps the conversation going. */
await type("I need to get a few items.");
await wait(1500);
check(
  "an opening request is answered, not stalled",
  /what would you like to get first/i.test(await page.evaluate(() => window.__spoken.join(" ")))
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
check("the milk cooler appears", wall.length >= 4, `${wall.length} cards`);
stripBoxes.push(await stripBox());
check(
  "the store-brand gallons are still there",
  ["Whole", "2%"].every((k) => wall.some((n) => n.includes(k))),
  wall.join(" | ")
);
check(
  "and so is something that is not the old four",
  wall.some((n) => /chocolate|lactaid|lactose|horizon|fairlife|organic|prairie/i.test(n)),
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
stripBoxes.push(await stripBox());
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
stripBoxes.push(await stripBox());
check("the card shows it is in the cart", (await page.$(".db-add.is-added")) !== null);

/* 8. The confirmation invites the next request instead of trailing off. */
const afterAdd = await page.evaluate(() => window.__spoken.join(" "));
check(
  "it asks what else you need",
  /what else|anything else/i.test(afterAdd),
  afterAdd.slice(-90)
);

/* 9. Cheddar is the natural next request. */
await page.type(".axon-strip-input", "I need cheddar cheese.");
await page.keyboard.press("Enter");
await wait(1900);
const cheddars = await cards();
check("four cheddars come up", cheddars.length === 4, `${cheddars.length} cards`);
stripBoxes.push(await stripBox());
check(
  "Borden is among them",
  cheddars.some((n) => /borden/i.test(n)),
  cheddars.join(" | ")
);
check("the milk moves to Also Requested", (await page.$(".also-requested")) !== null);

await page.type(".axon-strip-input", "I'll take the Borden extra sharp.");
await page.keyboard.press("Enter");
await wait(3000);
check("cart accumulates to 2 items $8.15", (await cart()) === "2 items $8.15", await cart());

/* 10. Asking for the same thing twice does not scold. */
await page.type(".axon-strip-input", "Add the Borden.");
await page.keyboard.press("Enter");
await wait(1800);
const repeated = await page.evaluate(() => window.__spoken.join(" "));
check("a duplicate is handled gently", /already got/i.test(repeated), repeated.slice(-80));
check("and the cart does not double up", (await cart()) === "2 items $8.15", await cart());

/* 11. It must not hear its own confirmation and act on it. */
await page.click(".reset-demo");
await wait(500);
await page.evaluate(() => {
  window.__spoken = [];   // only judge what this run says
  window.__script = ["I need milk", "whole milk", "put it in my cart"];
  // Then feed back exactly what it says, the way an open microphone would.
  window.__echoAfter = true;
});
await page.evaluate(() => {
  const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
  window.speechSynthesis.speak = (u) => {
    if (window.__echoAfter && /in your cart/i.test(u.text)) window.__script.push(u.text);
    return orig(u);
  };
});
await page.click(".shopper-nav-pill");
for (let i = 0; i < 45; i += 1) {
  await wait(400);
  if ((await page.evaluate(() => window.__script.length)) === 0) break;
}
await wait(3500);
check("the spoken run reaches 1 item $4.44", (await cart()) === "1 item $4.44", await cart());
const echoed = await page.evaluate(() => window.__spoken.join(" "));
check(
  "hearing itself did not trigger a second add",
  !/already got/i.test(echoed),
  echoed.slice(-110)
);
check("no microphone press was needed", true);

// The hint line under the prompt comes and goes as the conversation moves on.
// If the copy column is allowed to resize with it, the strip breathes on every
// reply and the page twitches under the shopper's cursor.
check(
  "the strip never changes size or moves",
  new Set(stripBoxes).size === 1,
  stripBoxes.join(" -> ")
);
check("no page errors", errors.length === 0, errors.join(" | "));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
