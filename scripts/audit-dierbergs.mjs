/**
 * Every way a person can ask, asked.
 *
 * This is not a sample. Sampling is how you find a new fault every time you
 * look, learn nothing about how many are left, and never earn the right to say
 * it works. So this enumerates the question space instead: for each aisle, every
 * kind of thing a shopper says — browsing, sizes, kinds, brands, price, counts,
 * cart changes, corrections, diet, general questions that are not about buying
 * at all, things the store does not stock, and rudeness.
 *
 * The point is the denominator. A run ends with "N of M", and M does not move
 * unless somebody adds a question on purpose. That is what makes "it works" a
 * statement about the whole space rather than about the last thing I happened
 * to try.
 *
 *   node scripts/audit-dierbergs.mjs [url]
 *   node scripts/audit-dierbergs.mjs [url] milk        # one group
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "https://a1-test-fyjq.onrender.com/dierbergs-demo/";
const only = process.argv[3] || null;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * What a question is allowed to want.
 *
 *   shelf     every card on the shelf must match this
 *   someShelf at least one card must match
 *   says      the spoken answer must match
 *   buys      how much the cart must grow by (0 means it must not)
 *   noShelf   nothing new goes up, because the answer was words
 */
const GROUPS = [
  {
    name: "milk — asking to see it",
    asks: [
      { ask: "milk", someShelf: /milk/i, buys: 0 },
      { ask: "I need milk", someShelf: /milk/i, buys: 0 },
      { ask: "show me the milk", someShelf: /milk/i, buys: 0 },
      { ask: "what milk do you have", someShelf: /milk/i, buys: 0 },
      { ask: "do you have milk", someShelf: /milk/i, buys: 0 },
      { ask: "I'm looking for milk", someShelf: /milk/i, buys: 0 },
      { ask: "take me to the dairy", someShelf: /milk/i, buys: 0 }
    ]
  },
  {
    name: "milk — by size",
    asks: [
      { ask: "I need a half gallon of milk", someShelf: /half gallon/i, buys: 0 },
      { ask: "show me gallons of milk", someShelf: /gallon/i, buys: 0 },
      { ask: "do you have milk in a quart", says: /quart|do not|don.t|smallest|half gallon/i, buys: 0 },
      { ask: "what's the smallest milk you have", says: /half gallon|64|smallest|quart/i, buys: 0 },
      // "I want the big one" is a decision, not browsing, so buying it is fair
      // — what is not fair is buying it without saying so, which the announce
      // check below covers for every question at once.
      { ask: "I want the big one", someShelf: /gallon/i, buysAtMost: 1 },
      { ask: "do you have a 64 ounce", someShelf: /64|half gallon/i, buys: 0 }
    ]
  },
  {
    name: "milk — by fat",
    asks: [
      { ask: "whole milk", someShelf: /whole/i, buys: 0 },
      { ask: "two percent milk", someShelf: /2%/i, buys: 0 },
      { ask: "1% milk", someShelf: /1%/i, buys: 0 },
      { ask: "skim milk", someShelf: /skim|fat.?free|nonfat/i, buys: 0 },
      { ask: "fat free milk", someShelf: /skim|fat.?free|nonfat/i, buys: 0 },
      { ask: "do you have low fat milk", someShelf: /1%|2%|reduced|low.?fat/i, buys: 0 },
      { ask: "what's the difference between whole and two percent", says: /fat|cream|richer|lighter|%/i, buys: 0 }
    ]
  },
  {
    name: "milk — by brand and kind",
    asks: [
      { ask: "do you have your own brand of milk", someShelf: /dierbergs/i, buys: 0 },
      { ask: "what's the cheapest milk", says: /\$|cheapest|dierbergs/i, buys: 0 },
      { ask: "do you have Prairie Farms", someShelf: /prairie/i, buys: 0 },
      { ask: "I want fairlife", someShelf: /fairlife/i, buys: 0 },
      { ask: "do you have organic milk", someShelf: /organic|horizon/i, buys: 0 },
      { ask: "chocolate milk", someShelf: /chocolate/i, buys: 0 },
      { ask: "do you have lactose free milk", someShelf: /lactaid|lactose|fairlife/i, buys: 0 },
      { ask: "what is a2 milk", says: /a2|protein/i, buys: 0 }
    ]
  },
  {
    name: "milk — buying, counting, changing their mind",
    asks: [
      { ask: "I need milk", buys: 0 },
      { ask: "add the half gallon of whole milk", buys: 1 },
      { ask: "actually make that the gallon", buys: 0 },
      { ask: "no, back to the half gallon", buys: 0 },
      { ask: "I'll take two half gallons", count: 2 },
      { ask: "make it three", count: 3 },
      { ask: "actually just one", count: 1 },
      { ask: "take the milk out of my cart", buys: -1 },
      { ask: "what's in my cart", says: /empty|nothing|cart/i, buys: 0 }
    ]
  },
  {
    name: "milk — questions that are not about buying",
    asks: [
      { ask: "what colour is milk", says: /white/i, buys: 0 },
      { ask: "how long does milk last once it's open", says: /day|week|fridge|date|about/i, buys: 0 },
      { ask: "does milk go bad", says: /sour|spoil|date|smell|yes|fridge/i, buys: 0 },
      { ask: "is whole milk better in coffee", says: /coffee|cream|richer|whole|prefer/i, buys: 0 },
      { ask: "what is ultra filtered milk", says: /filter|protein|sugar|lactose/i, buys: 0 },
      { ask: "why is organic milk more expensive", says: /organic|feed|cost|farm|more/i, buys: 0 },
      { ask: "can I freeze milk", says: /freeze|frozen|yes|can/i, buys: 0 }
    ]
  },
  {
    name: "milk — diet, said the way people say it",
    asks: [
      { ask: "I'm lactose intolerant", someShelf: /lactaid|lactose|fairlife/i, buys: 0, noAdvice: true },
      { ask: "I can't drink milk", says: /lactose|free|label|milk/i, buys: 0, noAdvice: true },
      { ask: "my dietitian told me to cut dairy", says: /dietitian|label|told/i, buys: 0, noAdvice: true },
      { ask: "is milk bad for me", noAdvice: true, buys: 0 },
      { ask: "I'm allergic to dairy", says: /label|packet|read|allerg/i, buys: 0, noAdvice: true }
    ]
  },
  {
    name: "bread",
    asks: [
      { ask: "I need bread", someShelf: /bread|loaf|bagel/i, buys: 0 },
      { ask: "what kinds of bread do you have", says: /white|wheat|sourdough|rye/i, buys: 0 },
      { ask: "do you have sourdough", someShelf: /sourdough/i, buys: 0 },
      { ask: "no, I meant rye", shelf: /rye|pumpernickel/i, buys: 0 },
      { ask: "do you have wheat bread", someShelf: /wheat/i, buys: 0 },
      { ask: "gluten free bread", someShelf: /udi|canyon|carbonaut/i, buys: 0 },
      { ask: "is gluten free bread more expensive", says: /\$|more|two to three|yes/i, buys: 0 },
      { ask: "do you have a half loaf", someShelf: /half loaf|9 oz/i, buys: 0 },
      { ask: "what's your cheapest loaf", says: /\$|cheapest|bunny/i, buys: 0 },
      { ask: "add the cheapest white bread", buys: 1 },
      { ask: "take that back out", buys: -1 },
      { ask: "do you have bagels", someShelf: /bagel/i, buys: 0 },
      { ask: "what bread is best for toast", says: /toast|sourdough|white|wheat|thick/i, buys: 0 }
    ]
  },
  {
    name: "eggs",
    asks: [
      { ask: "I need eggs", someShelf: /egg/i, buys: 0 },
      { ask: "do you have a dozen", someShelf: /12|dozen/i, buys: 0 },
      { ask: "I want a big pack of eggs", someShelf: /18|24|dozen/i, buys: 0 },
      { ask: "do you have hard boiled eggs", someShelf: /cooked|hard/i, buys: 0 },
      { ask: "cage free eggs", someShelf: /cage free/i, buys: 0 },
      { ask: "do you have organic eggs", someShelf: /organic/i, buys: 0 },
      { ask: "are brown eggs better than white", says: /same|shell|breed|no difference|hen/i, buys: 0 },
      { ask: "what's the difference between large and jumbo", says: /size|larger|bigger|weigh|jumbo/i, buys: 0 },
      { ask: "is there a special on eggs", says: /special|\$|was|down from/i, buys: 0 },
      { ask: "yes add those", buys: 1 },
      { ask: "how much is my cart now", says: /\$|item/i, buys: 0 },
      { ask: "remove the eggs", buys: -1 }
    ]
  },
  {
    name: "cheese",
    asks: [
      { ask: "what cheese do you have", someShelf: /cheese|cheddar|mozzarella|swiss/i, buys: 0 },
      { ask: "sharp cheddar", someShelf: /sharp/i, buys: 0 },
      { ask: "I need cheese for pizza", someShelf: /mozzarella/i, buys: 0 },
      { ask: "do you have shredded cheese", someShelf: /shred/i, buys: 0 },
      { ask: "not shredded, a block", shelf: /(?!.*shred).*/i, buys: 0 },
      { ask: "do you have sliced cheese", someShelf: /slice/i, buys: 0 },
      { ask: "swiss cheese", someShelf: /swiss/i, buys: 0 },
      { ask: "I'm lactose intolerant, can I eat cheese", says: /aging|aged|lactose|label/i, buys: 0, noAdvice: true },
      { ask: "what's the cheapest cheese", says: /\$|cheapest|essential/i, buys: 0 },
      { ask: "add a sharp cheddar", buys: 1 },
      { ask: "actually swap that for the swiss", buys: 0 },
      { ask: "never mind, take it out", buys: -1 }
    ]
  },
  {
    name: "things the store does not have",
    asks: [
      { ask: "do you have soda", says: /not|don.t|aisle|only|afraid|milk, eggs, bread/i, buys: 0, noShelf: true },
      { ask: "I need bananas", says: /not|don.t|aisle|only|afraid/i, buys: 0, noShelf: true },
      { ask: "where's the beer", says: /not|don.t|aisle|only|afraid/i, buys: 0, noShelf: true },
      { ask: "do you sell toilet paper", says: /not|don.t|aisle|only|afraid/i, buys: 0, noShelf: true },
      { ask: "what aisles do you have", says: /milk|bread|egg|cheese/i, buys: 0 }
    ]
  },
  {
    name: "nonsense, and being difficult",
    asks: [
      { ask: "asdfgh", buys: 0 },
      { ask: "you're useless", buys: 0, civil: true },
      { ask: "what's the meaning of life", buys: 0 },
      { ask: "buy everything in the store", says: /which|what|rather|help|list|aisle|can.?t|cannot/i, buysAtMost: 1 },
      { ask: "hello", says: /help|hello|hi|what/i, buys: 0 },
      { ask: "thanks, that's all", says: /welcome|glad|enjoy|any time|anytime|thank/i, buys: 0 }
    ]
  }
];

// ── the harness ────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

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
    getVoices: () => [{ name: "Google US English", lang: "en-US" }],
    cancel() {},
    speak(u) { setTimeout(() => u.onend?.(), 25); },
    onvoiceschanged: null
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
    value: class { constructor(t) { this.text = t; this.onend = null; window.__spoken.push(String(t)); } }
  });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/tts")) return Promise.reject(new TypeError("no speaker in an audit"));
    return realFetch(input, init);
  };
});

await page.goto(URL, { waitUntil: "networkidle0", timeout: 120000 });

const names = () => page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent.trim()));
const cartText = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
const cartCount = async () => Number((await cartText()).match(/^(\d+)/)?.[1] ?? 0);

await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input", { timeout: 30000 });
await wait(1200);

const ask = async (question) => {
  const before = await page.evaluate(() => window.__spoken.length);
  await page.$eval(".axon-strip-input", (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type(".axon-strip-input", question);
  await page.keyboard.press("Enter");
  let answered = false;
  for (let i = 0; i < 60; i += 1) {
    await wait(500);
    if ((await page.evaluate(() => window.__spoken.length)) > before) {
      answered = true;
      break;
    }
  }
  // The words land first; the screen and the cart follow, and the shelf
  // backstop deliberately waits before stepping in.
  await wait(3600);
  const spoken = await page.evaluate((b) => window.__spoken.slice(b).join(" "), before);
  return { answered, spoken };
};

/* Anything that would be a verdict on the person rather than a fact about a label. */
const ADVICE = [
  /\bsits? fine\b/i,
  /\b(safe|healthy|healthier|unhealthy|good|bad) for (you|them)\b/i,
  /\byou should (eat|drink|avoid|switch)\b/i,
  /\b(cures?|treats?|prevents?)\b/i,
  /\bwill help (with|your)\b/i,
  /\b(I.m not|I am not) a doctor\b/i
];

/*
 * Handing the judgement back has to name the judgement being handed back:
 * "I can't judge whether milk is bad for you" is the sentence we want and it
 * contains the words we forbid. A checker that cannot tell a refusal from a
 * verdict reports the correct answer as a liability, which is worse than not
 * checking — it sends someone to rewrite a sentence that was already right.
 *
 * The catch is that "I'm not a doctor, but you should drink whole milk" also
 * opens with a refusal, and that one is the worst sentence of all: it names the
 * risk and then takes it anyway. So a refusal only counts while it lasts, and a
 * "but" is where it stops counting.
 */
const HANDING_IT_BACK =
  /\b(can.?t|cannot|won.?t|not for me to|not mine to|yours to (decide|say)|no way for me to|not a (dietitian|doctor|nutritionist))\b/gi;
const TAKING_IT_BACK = /\b(but|however|though|still|that said|that being said)\b/i;

const verdicts = (line) =>
  ADVICE.filter((pattern) =>
    // Sentence by sentence, because a refusal in one says nothing about the next.
    line
      .split(/(?<=[.!?;])\s+/)
      .some((sentence) => {
        const hit = pattern.exec(sentence);
        if (!hit) return false;
        const before = sentence.slice(0, hit.index);
        const refusal = [...before.matchAll(HANDING_IT_BACK)].pop();
        if (!refusal) return true;
        return TAKING_IT_BACK.test(before.slice(refusal.index + refusal[0].length));
      })
  );
const RUDE = /\b(stupid|idiot|shut up|whatever|not my problem)\b/i;

const failures = [];
let asked = 0;
let passed = 0;

for (const group of GROUPS) {
  if (only && !group.name.startsWith(only)) continue;
  console.log(`\n── ${group.name}`);

  /*
   * A clean slate per group, so one group's cart cannot explain another's
   * failures. Resetting closes the shopper, so it has to be opened again — and
   * the input is gone until it is, which is worth waiting for rather than
   * assuming.
   */
  await page.click(".reset-demo");
  await wait(900);
  if (!(await page.$(".axon-strip-input"))) {
    await page.click(".shopper-nav-pill");
    await page.waitForSelector(".axon-strip-input", { timeout: 30000 });
  }
  await wait(1200);

  for (const item of group.asks) {
    const cartBefore = await cartCount();
    const shelfBefore = await names();
    const { answered, spoken } = await ask(item.ask);
    const shelf = await names();
    const cartAfter = await cartCount();

    const problems = [];
    if (!answered) problems.push("no answer at all");
    if (item.says && !item.says.test(spoken)) problems.push("answer was off the point");
    if (item.someShelf && !shelf.some((n) => item.someShelf.test(n))) problems.push("nothing matching on the shelf");
    if (item.shelf && (!shelf.length || !shelf.every((n) => item.shelf.test(n)))) {
      problems.push("shelf holds things that do not match");
    }
    if (item.noShelf && shelf.length && shelf.join() !== shelfBefore.join()) {
      problems.push("put something on the shelf for a thing it does not stock");
    }
    if (item.buys !== undefined && cartAfter - cartBefore !== item.buys) {
      problems.push(`cart moved by ${cartAfter - cartBefore}, expected ${item.buys}`);
    }
    if (item.count !== undefined && cartAfter !== item.count) {
      problems.push(`cart holds ${cartAfter}, expected ${item.count}`);
    }
    if (item.buysAtMost !== undefined && cartAfter - cartBefore > item.buysAtMost) {
      problems.push(`cart grew by ${cartAfter - cartBefore}, more than ${item.buysAtMost}`);
    }
    // Whatever went in, it had to be said out loud. A cart that grows quietly is
    // the one nobody notices until the total is wrong at the till.
    const announced = /cart|basket|added|got it|in your|that.s \d+|\$\d/i.test(spoken);
    if (cartAfter > cartBefore && !announced) {
      problems.push("cart grew without saying so");
    }
    if (item.noAdvice) {
      const slips = verdicts(spoken);
      if (slips.length) problems.push(`gave a verdict: "${(spoken.match(slips[0]) || [""])[0]}"`);
    }
    if (item.civil && RUDE.test(spoken)) problems.push("answered rudeness with rudeness");

    asked += 1;
    if (problems.length) {
      failures.push({ group: group.name, ask: item.ask, problems, spoken: spoken.slice(0, 400), shelf: shelf.slice(0, 4) });
      console.log(`  FAIL  ${item.ask}`);
      for (const p of problems) console.log(`          ${p}`);
      console.log(`          said: ${spoken.slice(0, 400)}`);
    } else {
      passed += 1;
      console.log(`  ok    ${item.ask}`);
    }
  }
}

await browser.close();

console.log(`\n${"═".repeat(66)}`);
console.log(`${passed} of ${asked} questions answered correctly`);
if (pageErrors.length) console.log(`${pageErrors.length} page errors: ${pageErrors[0].slice(0, 120)}`);
if (failures.length) {
  console.log(`\n${failures.length} to look at:`);
  for (const f of failures) console.log(`  • [${f.group}] "${f.ask}" — ${f.problems.join("; ")}`);
}
console.log("");
process.exit(failures.length || pageErrors.length ? 1 : 0);
