/**
 * The check to run before showing it to anyone.
 *
 * Every other suite runs against a local build, which proves the code is right
 * but not that the thing on the internet is. This one drives the hosted site
 * exactly as a shopper would: typing into the strip, with the real model
 * answering. It types rather than talks, so it costs a fraction of a cent
 * instead of a dollar, but everything behind the words is the live path.
 *
 * It asserts what a shopper would notice, never wording, because the model
 * chooses its own words and a demo that fails on phrasing is a demo nobody
 * trusts.
 *
 *   node scripts/preflight-dierbergs.mjs [url]
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "https://a1-test-fyjq.onrender.com/dierbergs-demo/";
const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

/*
 * No microphone and no speaker. The typed box is the same brain the voice
 * uses, and leaving the voice out keeps this cheap enough to run every time
 * without thinking about it.
 */
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    get: () => ({ getUserMedia: () => Promise.reject(new Error("no microphone here")) })
  });
  class R { start() {} stop() {} abort() {} }
  window.webkitSpeechRecognition = R;
  window.SpeechRecognition = R;
  window.__spoken = [];
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
    value: class {
      constructor(t) { this.text = t; this.onend = null; window.__spoken.push(String(t)); }
    }
  });
  // The neural voice is real money for audio nobody is listening to.
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/tts")) return Promise.reject(new TypeError("no speaker for preflight"));
    return realFetch(input, init);
  };
});

// Render sleeps its free instances, so the first load can be slow.
await page.goto(URL, { waitUntil: "networkidle0", timeout: 120000 });

const names = () => page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent.trim()));
const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
const said = () => page.evaluate(() => window.__spoken.join(" \u00b7 "));
const lastSaid = () => page.evaluate(() => window.__spoken[window.__spoken.length - 1] || "");

/**
 * Types a line and waits for the reply.
 *
 * It waits for a new line to be spoken rather than for the screen to look a
 * particular way. Waiting on the screen is how a harness fools itself: the
 * bread aisle already has a rye loaf in it, so waiting for "a rye on the
 * shelf" after asking for rye returns instantly, on the shelf from before, and
 * the assertion then fails on a bug that is not there. A new spoken line means
 * the turn is genuinely finished.
 */
const replies = [];
const type = async (q) => {
  const before = await page.evaluate(() => window.__spoken.length);
  await page.$eval(".axon-strip-input", (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type(".axon-strip-input", q);
  const started = Date.now();
  await page.keyboard.press("Enter");
  let took = null;
  for (let i = 0; i < 60; i += 1) {
    await wait(500);
    if ((await page.evaluate(() => window.__spoken.length)) > before) {
      took = Date.now() - started;
      break;
    }
  }
  /*
   * The words come first and the screen follows. The shelf backstop waits to
   * see whether Axon moves the shelf itself before stepping in, so anything
   * shorter than that check-and-fill reads the screen mid-thought and fails on
   * a bug that is not there.
   */
  await wait(3600);
  replies.push({ said: q, took });
};

console.log(`\nchecking ${URL}\n`);

// ── It opens, and it opens saying the right thing ───────────────────────────
const pill = await page.$eval(".shopper-nav-pill", (el) => el.textContent.trim());
check("the pill says Your AI Shopper", /your ai shopper/i.test(pill), pill);

await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input", { timeout: 30000 });
await wait(1500);

const greeting = await said();
check(
  "it opens by asking how it can help, not telling them what to do",
  /how can i help/i.test(greeting) && !/tell me what you.re after/i.test(greeting),
  greeting.slice(0, 90)
);

// ── Milk, which is the part he has watched fail most ────────────────────────
await type("I need milk");
const opening = await names();
check("asking for milk shows a spread of cartons, not one", opening.length > 1, `${opening.length} cartons`);

await type("I'll take the half gallon");
check(
  "\u201CI'll take the half gallon\u201D buys a half gallon first time",
  /1 item \$2\.69/.test(await cart()),
  await cart()
);

await type("no, replace that with the gallon");
check(
  "changing to the gallon swaps it rather than adding a second carton",
  /1 item/.test(await cart()) && /3\.49/.test(await cart()),
  await cart()
);
check("and the gallon is charged at the ad price, not the shelf price", /3\.49/.test(await cart()), await cart());

/*
 * The third turn of mind on one carton. Axon is allowed either to swap again
 * or to stop and ask which they actually want — being talked in circles is a
 * thing it is meant to push back on. What it must never do is end up holding
 * both cartons.
 */
await type("actually I wanted the half gallon after all");
const afterThird = await cart();
check(
  "a third change of mind either swaps or asks, but never leaves two cartons",
  /^1 item \$(2\.69|3\.49)$/.test(afterThird),
  afterThird
);

// ── Two of something, which used to be impossible ───────────────────────────
await type("make it two half gallons");
check(
  "it can be talked into two of the same thing",
  /2 items \$5\.38/.test(await cart()),
  await cart()
);

// ── The ad ─────────────────────────────────────────────────────────────────
await type("is there a special on eggs");
check(
  "asking about a special gets an actual deal",
  /saturday|special|sale|\$/i.test(await lastSaid()),
  (await lastSaid()).slice(0, 110)
);

// ── Dietary, which is the change made today ────────────────────────────────
await type("I'm lactose intolerant");
const lactoseShelf = await names();
check(
  "saying lactose intolerant puts the lactose free cartons up",
  lactoseShelf.some((n) => /lactaid|lactose free/i.test(n)),
  lactoseShelf.join(" | ")
);
check(
  "and a2 is not among them, because a2 is not lactose free",
  lactoseShelf.length > 0 && !lactoseShelf.some((n) => /a2/i.test(n)),
  lactoseShelf.join(" | ")
);
/*
 * The shelf has to follow the words. It once answered a question about milk
 * perfectly while leaving a box of eggs on screen, which reads as broken even
 * though every sentence was right.
 */
check(
  "and the screen followed the answer instead of staying on the eggs",
  !lactoseShelf.some((n) => /egg/i.test(n)),
  lactoseShelf.join(" | ")
);

/*
 * The liability line, checked against what was actually said out loud on the
 * live site rather than against the source. This is the one that matters: the
 * model writes its own words, so the rule has to hold when it does.
 */
const ADVICE = [
  [/\bsits? fine\b/i, "promising how it will sit with them"],
  [/\b(safe|healthy|healthier|unhealthy|good|bad) for (you|them)\b/i, "calling food good or bad for them"],
  [/\byou should (eat|drink|avoid|switch)\b/i, "telling them what to consume"],
  [/\b(cures?|treats?|prevents?)\b/i, "a medical claim"],
  [/\bwill help (with|your)\b/i, "promising a benefit"],
  // The shape that names the risk and takes it anyway. Worse than either half.
  [/\b(I.m not|I am not) a doctor\b/i, "disclaiming as a doctor and advising regardless"],
  [/\bsome people say\b/i, "hearsay about how food affects people"]
];
const everything = await said();
for (const [pattern, why] of ADVICE) {
  check(`nothing ${why}`, !pattern.test(everything), (everything.match(pattern) || [""])[0]);
}

// ── Changing your mind before buying anything ──────────────────────────────
await type("show me bread");
await type("what sourdough do you have");
await type("no, I meant rye");
const ryeShelf = await names();
check(
  "\u201Cno, I meant rye\u201D narrows to the rye instead of dumping them back in the aisle",
  ryeShelf.length > 0 && ryeShelf.every((n) => /rye|pumpernickel/i.test(n)),
  ryeShelf.join(" | ")
);

// ── Something the store does not stock ─────────────────────────────────────
const cartBefore = await cart();
await type("do you have any soda");
check(
  "asking for soda gets an honest no, not an invention",
  !/soda/i.test((await names()).join(" ")),
  (await lastSaid()).slice(0, 120)
);
check("and asking for it buys nothing", (await cart()) === cartBefore, `${cartBefore} -> ${await cart()}`);

// ── The other three aisles, to the same depth as the milk ───────────────────
console.log("\n  the rest of the store");

await type("what cheese do you have");
const cheeses = await names();
check("the cheese aisle opens on a spread", cheeses.length > 1, `${cheeses.length} cheeses`);

await type("what do I want for pizza");
check(
  "pizza leads to mozzarella, not to a shrug",
  (await names()).some((n) => /mozzarella/i.test(n)),
  (await names()).join(" | ").slice(0, 110)
);

await type("do you have gluten free bread");
const gf = await names();
check(
  "gluten free bread is found",
  gf.some((n) => /udi|canyon|carbonaut/i.test(n)),
  gf.join(" | ").slice(0, 130)
);
check(
  "and it warns what it costs rather than just selling it",
  /two to three times|more than|pricier|costs more|freezer/i.test(await lastSaid()),
  (await lastSaid()).slice(0, 130)
);

/*
 * Asking is not buying. Saying "I need" something must show it and stop: a cart
 * that grows because a sentence sounded keen is a cart nobody trusts, and it is
 * the model's instinct to be helpful that has to be held back here.
 */
const beforeAsking = await cart();
await type("I need hard boiled eggs");
check(
  "shopper words reach the right box, whatever the label calls it",
  (await names()).some((n) => /cooked|hard/i.test(n)),
  (await names()).join(" | ").slice(0, 110)
);
check(
  "and asking for them does not quietly buy them",
  (await cart()) === beforeAsking,
  `${beforeAsking} -> ${await cart()}`
);

// ── Taking something back out ───────────────────────────────────────────────
console.log("\n  changing their mind about the cart");

const items = async () => Number((await cart()).match(/^(\d+)/)?.[1] ?? 0);
const beforeCheese = await items();
await type("add the cheapest cheddar");
const withCheese = await items();
check(
  "a cheddar can be bought, and adds exactly one thing",
  withCheese === beforeCheese + 1,
  `${beforeCheese} items -> ${withCheese} items`
);

await type("actually take the cheese back out");
check(
  "and taken back out again without touching the milk",
  (await items()) === beforeCheese,
  `${withCheese} items -> ${await items()} items`
);

// ── The refresh that used to lose everything ────────────────────────────────
const beforeReload = await cart();
await page.reload({ waitUntil: "networkidle0", timeout: 120000 });
await wait(2500);
const afterReload = await cart();
check(
  "a refresh no longer throws the cart away",
  afterReload === beforeReload && /item/.test(afterReload),
  `${beforeReload} -> ${afterReload}`
);

// ── Nothing broke while all that happened ──────────────────────────────────
check("no page errors through any of it", errors.length === 0, errors.slice(0, 2).join(" | "));

/*
 * How slow it feels, which is the complaint that comes before any other. A
 * missing reply counts as the full wait, so a turn that never answers cannot
 * flatter the average.
 */
const waits = replies.map((r) => r.took ?? 30000);
const worst = Math.max(...waits);
const average = waits.reduce((a, b) => a + b, 0) / waits.length;
check(
  "every line got an answer",
  replies.every((r) => r.took !== null),
  replies.filter((r) => r.took === null).map((r) => r.said).join(" | ")
);
check(
  "and none of them left the shopper waiting more than eight seconds",
  worst <= 8000,
  `worst ${(worst / 1000).toFixed(1)}s, average ${(average / 1000).toFixed(1)}s`
);
console.log(`\n      replies averaged ${(average / 1000).toFixed(1)}s, slowest ${(worst / 1000).toFixed(1)}s`);

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
