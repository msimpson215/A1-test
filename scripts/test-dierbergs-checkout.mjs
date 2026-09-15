/**
 * The two ends of a shop: seeing the whole aisle, and finishing.
 *
 * The store stocks twenty-two milks and showed two of them. Two is the right
 * opening — nobody wants the cooler tipped over them — but there was no way
 * past it, so "show me all the milks" put the same two jugs up again and the
 * store looked like it stocked two. The first half of this suite is that way
 * out, in the words people actually use for it.
 *
 * The second half is the end. Until now there wasn't one: the cart was a number
 * in the corner and a conversation could only trail off. The yes is what a
 * grocer is actually buying, so it needs a total on screen, the ad saving shown
 * rather than silently applied, and both a sayable and a clickable way to agree
 * to it.
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
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    get: () => ({ getUserMedia: () => Promise.reject(new Error("no microphone here")) })
  });
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/tts") || url.includes("/api/understand") || url.includes("api.openai.com")) {
      return Promise.reject(new TypeError("network brain disabled for this test"));
    }
    return realFetch(input, init);
  };
  const synth = {
    getVoices: () => [{ name: "Google US English", lang: "en-US", localService: false }],
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
// The parser stands in for the model, so the run is deterministic and free.
// What it must prove is that the shelf and the till are right, not that a
// sentence was understood cleverly.
await page.evaluateOnNewDocument(() => {
  window.__parserAsBrain = true;
});
await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });

const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
const cards = () => page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent.trim()));
const spoken = () => page.evaluate(() => window.__spoken.join(" | "));
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
await wait(700);

/* ---------------------------------------------------------------- the aisle */

await type("I need milk");
await wait(1600);
const opening = await cards();
check(
  "milk still opens on the store's own two jugs, not the whole cooler",
  opening.length === 2 && opening.every((n) => /dierbergs/i.test(n)),
  `${opening.length}: ${opening.join(", ")}`
);
// The way out has to be on screen. A door nobody is shown is not a door, which
// is exactly how this shelf came to look like a store with two milks in it.
const hint = await page.$eval(".axon-strip-hint, .axon-strip-sub", (el) => el.innerText).catch(() => "");
check(
  "and the screen says how to see the rest",
  /all the milks|see them all|whole case/i.test(hint),
  hint.slice(0, 90)
);

await type("no, I want to see all the milks");
await wait(1800);
const everyMilk = await cards();
check(
  "asking for all the milks puts the whole cooler up",
  everyMilk.length >= 20,
  `${everyMilk.length} cartons`
);
check(
  "including the brands that were never on the opening shelf",
  /lactaid/i.test(everyMilk.join(" ")) &&
    /horizon/i.test(everyMilk.join(" ")) &&
    /fairlife/i.test(everyMilk.join(" ")),
  everyMilk.slice(0, 4).join(", ")
);
// Twenty-two cards in the four-wide grid is six rows of scrolling to find one
// carton, which is its own kind of unhelpful.
check(
  "a full aisle is laid out as a wall rather than a scroll",
  (await page.$(".merch-grid-wall")) !== null
);
// "Our Dierbergs milk" over all twenty-two is the same wrong answer in words.
check(
  "and the heading says it is all of them",
  /all the milk/i.test(await page.$eval(".merch-heading", (el) => el.innerText)),
  await page.$eval(".merch-heading", (el) => el.innerText)
);

/*
 * But "all" with a kind attached is all of that kind, not the cooler. Answering
 * "anything else that's lactose free" with twenty-two cartons would be a worse
 * failure than the two-carton shelf this replaced, and it is the same word doing
 * the asking, so the two readings have to be told apart.
 */
await type("show me all the lactose free ones");
await wait(1700);
const lactoseFree = await cards();
check(
  // Three rather than seven, because saying "lactose free" also brings in the
  // dietary shelf, which is choosier still. Either is a real answer; twenty-two
  // is not.
  "all of a kind is all of that kind, not the whole aisle",
  lactoseFree.length >= 3 &&
    lactoseFree.length <= 10 &&
    !lactoseFree.some((n) => /dierbergs (whole|2%|1%|skim)/i.test(n)),
  `${lactoseFree.length}: ${lactoseFree.slice(0, 3).join(", ")}`
);

/* And the same door in every other aisle, since the fault was never milk's. */
for (const [aisle, said, least] of [
  ["cheese", "show me all the cheeses", 20],
  ["bread", "every bread you have", 20],
  ["eggs", "what else have you got in eggs", 12]
]) {
  await type(said);
  await wait(1700);
  const all = await cards();
  check(`${aisle} opens up the same way`, all.length >= least, `${all.length} products`);
}

/* Plurals, which is how anybody asks for the lot, and which the catalogue's
   singular keywords used to miss entirely — widening to the whole case rather
   than to the kind that was named. */
await type("show me all the cheddars");
await wait(1700);
const cheddars = await cards();
check(
  "asking for a kind in the plural finds the kind, not the case",
  cheddars.length >= 10 && cheddars.length < 34 && /cheddar/i.test(cheddars[0] ?? ""),
  `${cheddars.length}: ${cheddars[0]}`
);

/* -------------------------------------------------------------- the ending */

await type("a half gallon of whole milk");
await wait(1500);
await type("add it to my cart");
await wait(1800);
const started = await cart();
check("something is in the cart to check out", /1 item/.test(started), started);

await type("that's everything, check me out");
await wait(1800);
check("checking out puts the order on screen", (await page.$(".db-checkout")) !== null);
const lines = await page.$$eval(".db-checkout-line", (els) =>
  els.map((e) => e.innerText.replace(/\s+/g, " ").trim())
);
check("with a line for what they chose", lines.length === 1, lines.join(" / "));
const total = await page
  .$eval(".db-checkout-grand", (el) => el.innerText.replace(/\s+/g, " ").trim())
  .catch(() => "");
check("and a total", /Total \$\d+\.\d\d/.test(total), total);
const said = await spoken();
check(
  "the total is read out, and it asks before placing anything",
  /\$\d+\.\d\d/.test(said) && /place it|shall i/i.test(said),
  said.split(" | ").slice(-1)[0]
);
check("nothing is placed until they say so", (await page.$(".db-checkout-placed")) === null);

/* The ad price was always applied and never shown, which is a discount the
   shopper has not been given as far as they can tell. */
await type("add the gallon of whole milk too");
await wait(1900);
await type("what's my total");
await wait(1800);
const saved = await page
  .$eval(".db-checkout-saved", (el) => el.innerText.replace(/\s+/g, " ").trim())
  .catch(() => "");
check("the week's ad saving is shown, not just quietly applied", /\$\d+\.\d\d/.test(saved), saved);

/* Sayable. */
await type("okay, we'll take it");
await wait(1900);
const placed = await page.$eval(".db-checkout-title", (el) => el.innerText).catch(() => "");
check("saying yes places the order", /order placed/i.test(placed), placed);
const number = await page.$eval(".db-checkout-placed", (el) => el.innerText).catch(() => "");
check("and gives back an order number", /Order D\d{4}/.test(number), number);
check(
  "which is read out too",
  /order D\d{4}/i.test(await spoken()),
  (await spoken()).split(" | ").slice(-1)[0]
);

/* Carrying on after yes must not leave a confirmed order that isn't theirs. */
await type("I need a dozen large eggs");
await wait(1800);
await page.click(".db-card .db-add");
await wait(1800);
const grown = await cart();
check("shopping carries on after an order is placed", /3 items/.test(grown), grown);
await type("check me out");
await wait(1700);
const reopened = await page.$eval(".db-checkout-title", (el) => el.innerText).catch(() => "");
check(
  "shopping on after placing re-opens the order rather than lying about it",
  /your order/i.test(reopened),
  reopened
);

/* Clickable, because the first person shown this reaches for the mouse. */
await page.click(".db-checkout-place");
await wait(1500);
const clicked = await page.$eval(".db-checkout-title", (el) => el.innerText).catch(() => "");
check("and the button on the receipt places it as well", /order placed/i.test(clicked), clicked);

/* ------------------------------------------------- and when GPT is the brain */

/*
 * Everything above ran with the parser standing in, which proves the shelf and
 * the till but not the path a live shopper is actually on. On the live line the
 * model decides, and it reaches the same two places by returning "checkout" and
 * "order" from /api/understand. There is no key in this sandbox to ask a real
 * model with, so what is checked here is the wiring this change owns: a
 * model-shaped reply naming those actions has to move the screen and the order,
 * with no help from the parser.
 */
await page.evaluate(() => {
  window.__parserAsBrain = false;
  window.__asModel = [];
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/understand")) {
      const action = window.__asModel.shift();
      // Nothing queued means this turn is not the one being examined, so the
      // brain is "unreachable" and the parser fixture handles it as before.
      if (!action) return Promise.reject(new TypeError("no scripted model turn"));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            action,
            aisle: null,
            products: [],
            quantity: null,
            remove: null,
            say: "",
            hint: "",
            model: "gpt-test"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }
    if (url.includes("/api/tts") || url.includes("api.openai.com")) {
      return Promise.reject(new TypeError("no neural voice in this test"));
    }
    return realFetch(input, init);
  };
});

/* From a clean cart, so neither of the next two checks can pass on the strength
   of an order that was already sitting there from the click above. */
await page.click(".reset-demo");
await wait(900);
await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input");
await wait(600);
// Nothing queued, so this turn falls to the parser fixture and fills the shelf.
await page.evaluate(() => {
  window.__parserAsBrain = true;
});
await type("a half gallon of whole milk");
await wait(1600);
await page.click(".db-card .db-add");
await wait(1600);
await page.evaluate(() => {
  window.__parserAsBrain = false;
});
check("a fresh cart to finish from", /1 item/.test(await cart()), await cart());
check("and no order on it yet", (await page.$(".db-checkout-placed")) === null);

await page.evaluate(() => {
  window.__asModel = ["checkout"];
});
await type("right, that's me done");
await wait(1800);
check(
  "a model asking for checkout puts the till up",
  (await page.$(".db-checkout")) !== null
);
const modelSaid = await spoken();
check(
  "and the total is spoken by the shell, not left to the model",
  /\$\d+\.\d\d/.test(modelSaid.split(" | ").slice(-1)[0] ?? ""),
  modelSaid.split(" | ").slice(-1)[0]
);
check(
  "with the brain badge showing a model rather than no GPT",
  /gpt-test/i.test(await page.$eval(".axon-brain", (el) => el.innerText).catch(() => "")),
  await page.$eval(".axon-brain", (el) => el.innerText).catch(() => "none")
);

await page.evaluate(() => {
  window.__asModel = ["order"];
});
await type("go on then");
await wait(1800);
const modelPlaced = await page.$eval(".db-checkout-title", (el) => el.innerText).catch(() => "");
check("and a model placing the order places it", /order placed/i.test(modelPlaced), modelPlaced);
check(
  "with the number read back",
  /order D\d{4}/i.test((await spoken()).split(" | ").slice(-1)[0] ?? ""),
  (await spoken()).split(" | ").slice(-1)[0]
);

check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
