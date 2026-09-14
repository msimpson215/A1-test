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
import { expandRules, sourceWithRules } from "./lib/assembled-brief.mjs";

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
// The parser stands in for the model here. That is a fixture, not what a
// shopper gets: with no flag an unreachable model says so and touches nothing.
await page.evaluateOnNewDocument(() => {
  window.__parserAsBrain = true;
});
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
  "and hands the judgement back rather than giving dietary advice",
  /not a dietitian/i.test(await said()),
  (await lastSaid()).slice(0, 110)
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
  "and leads with what aging does to the cheese, not with a prediction about them",
  /aging breaks lactose down/i.test(await lastSaid()),
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
const brief = expandRules(realtime.split("const BRIEF = `")[1].split("`;")[0]);

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
/*
 * The budget went from 2200 to 2450 when the shop got an ending: a checkout, an
 * order, and the difference between "I'll take it" at a shelf and at the till.
 * That is new function rather than the same rules said again, which is the only
 * reason this number is ever allowed to move. Product knowledge still does not
 * live here — the check above is what holds that line.
 */
check(
  "the brief stays small enough to open every session with",
  brief.length / 4 < 2450,
  `~${Math.round(brief.length / 4)} tokens`
);
/*
 * Every aisle's knowledge, not just the one on screen.
 *
 * Per-aisle lookup is the right design at a hundred departments and the wrong one
 * at four. A shopper who says they cannot drink milk and then asks about cheese
 * has crossed two aisles in one sentence, and handing over one aisle's notes
 * meant answering that out of half the knowledge with nothing to say the other
 * half existed. The per-aisle helper stays for the store-sized version, and the
 * scaling arithmetic below still holds; the demo simply sends the lot.
 */
check(
  "the search hands over every aisle's knowledge, not just the one on screen",
  /allNotes\(\)/.test(fs.readFileSync("components/dierbergs/DierbergsDemo.tsx", "utf8"))
);
check(
  "and the model is told to trust it over what it thinks it knows",
  /prefer it over anything you think you already know/.test(brief)
);
check(
  "the typed path gets the same knowledge as the spoken one",
  /notes: allNotes\(\)/.test(fs.readFileSync("lib/dierbergs-understand.ts", "utf8")) &&
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

// ── Nothing here gives dietary advice ──────────────────────────────────────
console.log("\n— it describes the product, never the person —");

/*
 * A grocer is not a clinic. Telling a shopper how a food will treat them is a
 * liability the store never asked for, and worse, it can cut across what a
 * dietitian has actually told them. So everything said out loud is checked
 * against the language that would make it advice.
 *
 * This is a lint rather than a conversation, because the risk is not that today
 * fails — it is that a helpful sentence gets added in six months and nobody
 * notices it crossed the line.
 */
/*
 * Guidance has to name the thing it forbids — "never call anything good or bad
 * for them" is the rule, not a breach of it — so prohibitions are skipped and
 * everything else is held to the line.
 */
const isProhibition = (line) => /\b(never|not a dietitian|do not|don't|dont|stop there|rather than)\b/i.test(line);
const guidance = [
  fs.readFileSync("data/dierbergs-aisle-notes.ts", "utf8"),
  brief,
  sourceWithRules("server/server.js").split("AXON_SHOPPER_INSTRUCTIONS = `")[1].split("`;")[0]
]
  .join("\n")
  .split("\n")
  .filter((line) => !isProhibition(line))
  .join("\n");

/** The brief, unwrapped, since a rule can fall across a line break. */
const briefFlat = brief.replace(/\s+/g, " ");

/* The lines the shopper is actually read, straight out of the catalogue. */
const lines = fs.readFileSync("data/dierbergs-catalogue.ts", "utf8");
const spokenLines = ["LACTOSE_LINE", "GLUTEN_LINE", "CARB_LINE", "CHEESE_LACTOSE_LINE"]
  .map((name) => lines.split(`export const ${name} =`)[1]?.split(";\n")[0] ?? "")
  .join("\n");

const FORBIDDEN = [
  [/\bsits? fine\b/i, "predicting how it will sit with them"],
  [/\bagree with (you|them)\b/i, "predicting a reaction"],
  [/\b(safe|healthy|healthier|unhealthy|good|bad) for (you|them)\b/i, "calling food good or bad for someone"],
  [/\bI (recommend|suggest) (you|that you)\b/i, "prescribing"],
  [/\byou should (eat|drink|avoid|try|switch)\b/i, "telling them what to consume"],
  [/\b(will|should) help with\b/i, "claiming a benefit"],
  [/\b(cures?|treats?|prevents?)\b/i, "a medical claim"],
  [/\bwont bother (you|them)\b/i, "predicting a reaction"]
];

for (const [pattern, why] of FORBIDDEN) {
  const inLines = pattern.test(spokenLines.replace(/\s+/g, " "));
  const inGuidance = pattern.test(guidance.replace(/\s+/g, " "));
  check(
    `nothing ${why}`,
    !inLines && !inGuidance,
    inLines ? "found in a spoken line" : inGuidance ? "found in the guidance" : ""
  );
}

check(
  "every dietary answer says it is not a dietitian, or hands it back to the packet",
  ["LACTOSE_LINE", "GLUTEN_LINE", "CARB_LINE", "CHEESE_LACTOSE_LINE"].every((name) => {
    const body = lines.split(`export const ${name} =`)[1]?.split(";\n")[0] ?? "";
    return /not a dietitian|on the packet|printed on the packet/i.test(body);
  })
);
check(
  "a dietitian's advice is told to win outright, not to be improved on",
  /that advice wins outright/i.test(briefFlat) && /cuts? across it/i.test(briefFlat)
);
check(
  "an allergy is always sent back to the packet, because recipes change",
  /read the packet themselves/i.test(briefFlat) && /recipes change/i.test(briefFlat)
);
check(
  "and it never claims a product is free of something, only that the label says so",
  /never say a product is free of something/i.test(briefFlat)
);
check(
  "the shopper is shown the disclaimer alongside the answer",
  /DIET_DISCLAIMER/.test(lines) && /read the packet, and go by what your dietitian/i.test(lines)
);

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
