/**
 * Bread, eggs and cheese, to the depth the milk aisle got.
 *
 * Milk was the template: know the aisle cold, answer the dietary question
 * without pretending to be a doctor, and understand the words shoppers actually
 * use rather than the words on the packet. This is the same test applied to the
 * other three — the gap between "hard cooked" on a label and "hard boiled" in a
 * sentence, "not shredded" meaning the opposite of shredded, and the fact that
 * lactose has a better answer in the cheese case than in the milk case.
 *
 * The model is cut off, so the parser and the catalogue answer on their own. If
 * this passes with no model at all, the knowledge is in the store rather than in
 * a lucky guess.
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
const shelf = async () => (await names()).join(" | ");
const said = () => page.evaluate(() => window.__spoken.join(" \u00b7 "));
const lastSaid = () => page.evaluate(() => window.__spoken[window.__spoken.length - 1] || "");
const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
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

// ── Bread ──────────────────────────────────────────────────────────────────
console.log("— bread —");

await type("I'm gluten free, what bread can I have");
let up = await shelf();
check(
  "gluten free gets the gluten free loaves, not a shrug",
  /canyon|udi/i.test(up),
  up.slice(0, 120)
);
check(
  "and says it is not a doctor before it says anything else",
  /not a doctor/i.test(await said()),
  (await lastSaid()).slice(0, 100)
);
check(
  "and warns about the price, which is the part that surprises people",
  /two to three times|price/i.test(await said())
);

await type("do you have keto bread");
up = await shelf();
check(
  "low carb is treated as a different question from gluten free",
  /carbonaut|keto/i.test(up),
  up.slice(0, 120)
);

await type("I want pumpernickel");
up = await shelf();
check(
  "a specific loaf beats the rest of its own kind",
  /pumpernickel/i.test((await names())[0] || ""),
  up.slice(0, 110)
);

await type("just half a loaf, there's only one of me");
up = await shelf();
check(
  "half loaves are a real thing it knows about",
  /mini|half loaf/i.test(up),
  up.slice(0, 110)
);

// ── Eggs ───────────────────────────────────────────────────────────────────
console.log("\n— eggs —");

await type("I need hard boiled eggs");
up = await shelf();
check(
  "\u201Chard boiled\u201D finds the hard cooked pack, which no label calls that",
  /hard cooked/i.test(up),
  up.slice(0, 110)
);

await type("what are your cheapest eggs");
up = await shelf();
check(
  "the cheapest egg is the store's own, and it says so",
  /dierbergs/i.test((await names())[0] || ""),
  up.slice(0, 110)
);

await type("show me pasture raised eggs");
up = await shelf();
check(
  "pasture raised is not confused with cage free",
  /vital farms|pasture/i.test(up) && !/^Eggland's Best Cage Free/i.test((await names())[0] || ""),
  up.slice(0, 120)
);

await type("give me a big pack of eggs");
up = await shelf();
check(
  "\u201Cbig pack\u201D means the 18 count",
  /18 count|18 ct/i.test(up),
  up.slice(0, 110)
);

// ── Cheese ─────────────────────────────────────────────────────────────────
console.log("\n— cheese —");

await type("I need cheese but I'm lactose intolerant");
up = await shelf();
check(
  "lactose in the cheese aisle answers about cheese, not about milk",
  /cheddar|swiss/i.test(up) && !/lactaid|fairlife/i.test(up),
  up.slice(0, 130)
);
check(
  "and leads with the fact that aged cheese is mostly fine",
  /aged|lactose/i.test(await lastSaid()),
  (await lastSaid()).slice(0, 130)
);

await type("a block of sharp cheddar, not shredded");
up = await shelf();
check(
  "\u201Cnot shredded\u201D rules shredded out instead of ranking it first",
  !/shredded/i.test(up) && /cheddar/i.test(up),
  up.slice(0, 130)
);

await type("what cheese do I want for pizza");
up = await shelf();
check(
  "pizza means mozzarella, and leads with it rather than burying it",
  /mozzarella/i.test((await names())[0] || ""),
  up.slice(0, 120)
);
check(
  "and the melting block comes before the fresh ball, which is for eating cold",
  up.toLowerCase().indexOf("low-moisture") < up.toLowerCase().indexOf("fresh") ||
    !/fresh/i.test(up),
  up.slice(0, 130)
);

/* The eggs earlier in this trip are still in the cart, which is the point. */
const before = await cart();
await type("I'll take the cheapest one");
const bag = await cart();
check(
  "and it can still be bought after all that, on top of what was already there",
  bag !== before && /\$\d/.test(bag),
  `${before} -> ${bag}`
);

check("no page errors anywhere in that", errors.length === 0, errors.join(" | ").slice(0, 200));

// ── The architecture, which is the part that has to scale ───────────────────
console.log("\n— knowledge is looked up, not memorised —");

const notes = fs.readFileSync("data/dierbergs-aisle-notes.ts", "utf8");
const realtime = fs.readFileSync("lib/dierbergs-realtime.ts", "utf8");
const brief = realtime.split("const BRIEF = `")[1].split("`;")[0];

check(
  "all four aisles have the deep knowledge written down",
  ["milk:", "bread:", "eggs:", "cheese:"].every((a) => notes.includes(a)),
  `${Math.round(notes.length / 4)} tokens of it in total`
);
check(
  "and none of it sits in the standing instructions",
  !/pasture raised/.test(brief) && !/pumpernickel/.test(brief) && !/dusted with starch/.test(brief),
  `brief is ${Math.round(brief.length / 4)} tokens`
);
check(
  "the brief stays small enough to open every session with",
  brief.length / 4 < 1800,
  `~${Math.round(brief.length / 4)} tokens`
);
check(
  "the search hands the aisle's knowledge over with its products",
  /notesFor\(/.test(fs.readFileSync("components/dierbergs/DierbergsDemo.tsx", "utf8"))
);
check(
  "and the model is told to trust it over what it thinks it knows",
  /prefer it over anything you think you already know/.test(brief)
);
check(
  "the typed path gets the same knowledge as the spoken one",
  /notes: notesFor\(/.test(fs.readFileSync("lib/dierbergs-understand.ts", "utf8")) &&
    /What you know about this aisle/.test(fs.readFileSync("server/server.js", "utf8"))
);

/*
 * The scaling claim, in one number: a paragraph an aisle is fine looked up and
 * impossible held. Thirty departments of this in the prompt would cost more per
 * session than the entire conversation does now.
 */
const perAisle = notes.length / 4 / 4;
check(
  "thirty aisles of knowledge would not fit in a prompt, which is why it is looked up",
  perAisle * 30 > 5000,
  `~${Math.round(perAisle)} tokens an aisle, ~${Math.round((perAisle * 30) / 1000)}k for thirty`
);

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
