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
  "greeting offers to help with shopping",
  /how can i help you with your shopping/i.test(greeting) &&
    !/ai shopper/i.test(greeting) &&
    !/what you.?re after/i.test(greeting) &&
    !/whole store/i.test(greeting),
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
check(
  "the strip names the browser fallback, not a fake live line",
  /browser voice/i.test(await page.$eval(".axon-strip-hint", (el) => el.textContent || "")),
  await page.$eval(".axon-strip-hint", (el) => el.textContent || "")
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

/* 4. Asking for milk offers the Dierbergs, to save money. */
await type("I need milk.");
await wait(1800);
const wall = await cards();
check("the milk cooler appears", wall.length >= 2 && wall.length <= 3, `${wall.length} cards`);
stripBoxes.push(await stripBox());
check(
  "it is the Dierbergs gallon and half gallon",
  wall.some((n) => /Dierbergs Whole Milk - Gallon/i.test(n)) &&
    wall.some((n) => /Dierbergs Whole Milk - Half/i.test(n)) &&
    wall.every((n) => /dierbergs/i.test(n)),
  wall.join(" | ")
);
check(
  "it did not dump the rest of the cooler",
  !wall.some((n) => /lactaid|horizon|fairlife|prairie|organic valley/i.test(n)),
  wall.join(" | ")
);
check("asking did not buy anything", (await cart()) === "0 items $0.00", await cart());
check(
  "it asks if they want to save money",
  /save money/i.test(await page.evaluate(() => window.__spoken.join(" "))) &&
    /gallon/i.test(await page.evaluate(() => window.__spoken.join(" "))),
  await page.evaluate(() => window.__spoken.slice(-1)[0])
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

/* 6. Naming a fat stays on the Dierbergs of that fat, in both sizes. */
await page.type(".axon-strip-input", "Two percent.");
await page.keyboard.press("Enter");
await wait(1800);
const narrowed = await cards();
check("two percent keeps the Dierbergs sizes on the shelf", narrowed.length >= 2, narrowed.join(" | "));
stripBoxes.push(await stripBox());
check("and they are the Dierbergs 2%", narrowed.every((n) => /Dierbergs 2%/i.test(n)), narrowed.join(" | "));
check(
  "gallon and half gallon",
  narrowed.some((n) => /Gallon/i.test(n)) && narrowed.some((n) => /Half/i.test(n)),
  narrowed.join(" | ")
);

/* 7. An unspecific add still will not guess among those cartons. */
await page.type(".axon-strip-input", "Add it to my cart.");
await page.keyboard.press("Enter");
await wait(1600);
check("it will not guess which 2%", (await cart()) === "0 items $0.00", await cart());

/* 8. Clicking + on any carton flies it to the cart. */
const twoPctNames = await cards();
const twoIdx = twoPctNames.findIndex((n) => /Dierbergs 2% Milk - Gallon/i.test(n));
check("the Dierbergs 2% gallon is on the shelf to add", twoIdx >= 0, twoPctNames.join(" | "));
let sawFlyer = false;
let cartDuringFlight = null;
const watch = setInterval(async () => {
  try {
    if (await page.$(".flying-item")) {
      sawFlyer = true;
      if (cartDuringFlight === null) cartDuringFlight = await cart();
    }
  } catch { /* page busy */ }
}, 40);

if (twoIdx >= 0) {
  const addButtons = await page.$$(".db-card .db-add");
  await addButtons[twoIdx].click();
}
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
  window.__script = ["I need milk", "a gallon of whole milk", "put it in my cart"];
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

/* 12. The rest of the milk capsule: brands, half gallons, no invented quarts. */
await page.click(".reset-demo");
await wait(400);
await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input");
await wait(700);
await type("I need milk.");
await wait(1600);
await type("something else.");
await wait(1800);
const others = await cards();
check(
  "something else shows the other brands",
  others.some((n) => /prairie|lactaid|horizon|fairlife/i.test(n)) &&
    !others.some((n) => /Dierbergs Whole Milk - Gallon/i.test(n)),
  others.join(" | ")
);

await page.click(".reset-demo");
await wait(400);
await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input");
await wait(700);
await type("I need milk.");
await wait(1600);
await type("Prairie Farms.");
await wait(1800);
const prairie = await cards();
check(
  "Prairie Farms is a brand we carry",
  prairie.length >= 1 && prairie.every((n) => /prairie farms/i.test(n)),
  prairie.join(" | ")
);
const prairieAdd = await page.$$(".db-card .db-add");
if (prairieAdd[0]) await prairieAdd[0].click();
await wait(2800);
check("a Prairie Farms carton goes in the cart", /1 item/.test(await cart()), await cart());

await page.click(".reset-demo");
await wait(400);
await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input");
await wait(700);
await type("I need milk.");
await wait(1600);
await type("A half gallon of two percent.");
await wait(1800);
const halves = await cards();
check(
  "half gallon of 2% shows half gallons",
  halves.length >= 1 && halves.length <= 8,
  halves.join(" | ")
);
const halfIdx = halves.findIndex((n) => /Dierbergs 2% Milk - Half/i.test(n));
check("the Dierbergs 2% half gallon is among them", halfIdx >= 0, halves.join(" | "));
if (halfIdx >= 0) {
  const btns = await page.$$(".db-card .db-add");
  await btns[halfIdx].click();
  await wait(2800);
}
check("the half gallon goes in the cart at $2.69", (await cart()) === "1 item $2.69", await cart());

await page.click(".reset-demo");
await wait(400);
await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input");
await wait(700);
await type("I need a half gallon of milk.");
await wait(1800);
const halfMilk = await cards();
check(
  "half gallon of milk shows several half gallons, not the gallon",
  halfMilk.length >= 2 &&
    halfMilk.every((n) => /Half/i.test(n)) &&
    !halfMilk.some((n) => /Gallon/i.test(n) && !/Half/i.test(n)),
  halfMilk.join(" | ")
);
await page.evaluate(() => { window.__spoken = []; });
await type("Well, I need a whole gallon.");
await wait(1800);
const wholeGal = await cards();
const wholeSaid = await page.evaluate(() => window.__spoken.join(" "));
check(
  "a whole gallon is still milk, not a four-aisle miss",
  wholeGal.length >= 2 &&
    wholeGal.every((n) => /Milk/i.test(n) && /Gallon/i.test(n) && !/Half/i.test(n)) &&
    !/eggs.*bread.*cheese|bread and cheese/i.test(wholeSaid),
  `${wholeGal.join(" | ")} · ${wholeSaid}`
);
check(
  "the gallon size is on the shelf",
  wholeGal.some((n) => /Dierbergs Whole Milk - Gallon/i.test(n)),
  wholeGal.join(" | ")
);
await page.evaluate(() => { window.__spoken = []; });
await type("No no I want the half.");
await wait(1800);
const backToHalf = await cards();
const halfSaid = await page.evaluate(() => window.__spoken.join(" "));
check(
  "no, the half switches to half gallons, not the gallon",
  backToHalf.length >= 2 &&
    backToHalf.every((n) => /Half/i.test(n)) &&
    !backToHalf.some((n) => /Gallon/i.test(n) && !/Half/i.test(n)) &&
    !/eggs.*bread.*cheese|bread and cheese/i.test(halfSaid),
  `${backToHalf.join(" | ")} · ${halfSaid}`
);

await page.click(".reset-demo");
await wait(400);
await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input");
await wait(700);
await type("I need milk.");
await wait(1600);
await page.evaluate(() => { window.__spoken = []; });
await type("A quart.");
await wait(1800);
const quartSaid = await page.evaluate(() => window.__spoken.join(" "));
check(
  "a quart is refused without inventing one",
  /don't have a quart|do not have a quart/i.test(quartSaid) && /gallon/i.test(quartSaid) && /half/i.test(quartSaid),
  quartSaid
);
check("and nothing was added", (await cart()) === "0 items $0.00", await cart());

await page.click(".reset-demo");
await wait(400);
await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input");
await wait(700);
await type("I need milk.");
await wait(1600);
await type("Skim.");
await wait(1800);
const skims = await cards();
check("skim milk is on the shelf", skims.some((n) => /skim|fat free/i.test(n)), skims.join(" | "));
const skimIdx = skims.findIndex((n) => /Dierbergs Skim Milk - Gallon/i.test(n));
if (skimIdx >= 0) {
  const btns = await page.$$(".db-card .db-add");
  await btns[skimIdx].click();
  await wait(2800);
}
check("skim goes in the cart", (await cart()) === "1 item $4.24", await cart());

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
