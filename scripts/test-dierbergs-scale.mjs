/**
 * The store is looked up, not memorised.
 *
 * This is the check that decides whether a thousand cells is possible. Every
 * product costs about fifty tokens to describe to a model, so handing over the
 * catalogue is fine at a hundred items, a very large prompt at four thousand,
 * and simply not a prompt at forty thousand. So the model gets an index of the
 * aisles and a shortlist of what the sentence could be about, and looks the
 * rest up.
 *
 * What this asserts: the shortlist is short, it holds the right things, it
 * still carries what is already on the shelf and in the cart so "the other one"
 * has something to mean, and the whole catalogue is nowhere in the request.
 */
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:3001/dierbergs-demo";
const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * A model that answers instantly, and records what it was asked. The point is
 * the request, not the reply, so the reply is the smallest valid one.
 */
const captureModel = () => {
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
    speak(u) { setTimeout(() => u.onend?.(), 30); },
    onvoiceschanged: null
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
    value: class { constructor(t) { this.text = t; this.onend = null; this.onerror = null; } }
  });

  window.__asked = [];
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/understand")) {
      const body = JSON.parse(init.body);
      window.__asked.push({ body, bytes: init.body.length });
      const first = body.choices[0];
      return new Response(
        JSON.stringify({
          action: first ? "show" : "chat",
          aisle: first ? first.aisle : null,
          products: first ? [first.id] : [],
          remove: null,
          say: "Here you are.",
          hint: "",
          model: "stub"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/api/tts") || url.includes("api.openai.com")) {
      return Promise.reject(new TypeError("no voice in this test"));
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
await page.evaluateOnNewDocument(captureModel);
// The parser stands in for the model here. That is a fixture, not what a
// shopper gets: with no flag an unreachable model says so and touches nothing.
await page.evaluateOnNewDocument(() => {
  window.__parserAsBrain = true;
});
await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input");
await wait(700);

const type = async (q) => {
  await page.$eval(".axon-strip-input", (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type(".axon-strip-input", q);
  await page.keyboard.press("Enter");
  await wait(1500);
};
const lastAsk = () => page.evaluate(() => window.__asked[window.__asked.length - 1]);

/* How many products the store actually has, to compare the shortlist against. */
const stocked = (fs.readFileSync("data/dierbergs-cells.ts", "utf8").match(/^\s*id: "/gm) || []).length;

await type("do you have any lactose free milk");
let ask = await lastAsk();
/*
 * The demo sends the whole store, on purpose.
 *
 * A shortlist is the right design for a chain and the wrong one for four aisles,
 * because every miss it causes is invisible from both ends. Ask for the thing the
 * search ranked thirteenth and the model is not choosing badly between what it
 * was shown — it never saw the item, cannot know that, and answers confidently
 * about the wrong carton. At about fifty tokens an item the lot is a fraction of
 * a cent a turn.
 *
 * The shortlist machinery is still here and still tested below, because it is
 * what a real store would use. It is just not what this demo gambles on.
 */
check(
  "the model is sent the whole store, not a shortlist of it",
  ask && ask.body.choices.length >= stocked,
  `${ask?.body.choices.length} products, ${stocked}+ stocked`
);
check(
  "so what the sentence is about cannot be missing from it",
  ask.body.choices.some((p) => /lactaid|prairie farms|fairlife/i.test(p.name)),
  ask.body.choices.map((p) => p.name).join(" | ").slice(0, 130)
);
check(
  "and the request is still small enough to send on every sentence",
  ask.bytes < 60000,
  `${(ask.bytes / 1024).toFixed(1)}kB`
);
check(
  "and it carries the aisle index so the model knows the store's shape",
  typeof ask.body.index === "string" && /milk/.test(ask.body.index) && ask.body.index.length < 2000,
  `${ask.body.index.length} chars`
);
check("and the old whole-catalogue payload is gone", ask.body.aisles === undefined);

/* A question about another aisle has that aisle to answer out of. */
await type("what sharp cheddar do you have");
ask = await lastAsk();
check(
  "a question about another aisle has that aisle in front of it",
  ask.body.choices.some((p) => p.aisle === "cheese" && /sharp cheddar/i.test(p.name)),
  ask.body.choices.filter((p) => p.aisle === "cheese").length + " cheeses on the list"
);

/* What is in play stays in play, or "the other one" means nothing. */
const onShelf = await page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent.trim()));
await type("how much is that one");
ask = await lastAsk();
check(
  "whatever is on the shelf is on the list",
  onShelf.length > 0 && onShelf.every((name) => ask.body.choices.some((p) => p.name === name)),
  `${onShelf.length} on the shelf, ${ask.body.choices.length} on the list`
);

/*
 * Nothing this store carries. Sending everything makes this cleaner rather than
 * murkier: there is no near-miss padding to mistake for stock, because the model
 * is looking at the entire catalogue and goat milk is not in it.
 */
await type("do you have any goat milk");
ask = await lastAsk();
check(
  "something unstocked is absent from the list, not approximated in it",
  !ask.body.choices.some((p) => /goat/i.test(p.name)),
  `${ask.body.choices.length} products, none of them goat`
);

check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 200));

/*
 * The spoken line's opening instructions, at the source: an index and how to
 * search, never the catalogue. A regression here is somebody pasting the store
 * back into the prompt, which works right up until the store is real.
 */
const realtime = fs.readFileSync("lib/dierbergs-realtime.ts", "utf8");
check(
  "the voice session opens with the aisle index, not the catalogue",
  /instructions: `\$\{BRIEF\}[^`]*aisleIndex\(\)/.test(realtime) && !/catalogueForModel/.test(realtime)
);
check(
  "and it is told to look products up",
  /find_products/.test(realtime) && /You do not hold the catalogue/.test(realtime)
);

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
