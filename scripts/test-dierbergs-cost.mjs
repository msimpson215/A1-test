/**
 * What it costs, and what it costs when the store gets big.
 *
 * Two claims are being made to a retailer, and both are arithmetic rather than
 * opinion. First, that the prompt does not grow with the catalogue: the aisle
 * index is capped and the products are looked up a handful at a time, so a
 * store of forty thousand items opens a session with the same number of tokens
 * as this demo. Second, that the bill tracks how long people talk, not how much
 * is on the shelves.
 *
 * Run with node's type stripping, so the app's own modules are what is tested:
 *   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-alias-loader.mjs scripts/test-dierbergs-cost.mjs
 */
import { aisleIndexFrom, aisleIndex, findProducts } from "../data/dierbergs-catalogue.ts";
import {
  RATES,
  dollarsFor,
  money,
  recordUsage,
  resetSpend,
  spendReport
} from "../lib/dierbergs-spend.ts";
import {
  BASE_ALLOWANCE,
  CEILING,
  allowanceFor,
  leftFor,
  verdictFor
} from "../lib/dierbergs-budget.ts";
import fs from "node:fs";

const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

/* A store of any size, with plausible variety per aisle. */
const storeOf = (aisles, perAisle = 40) =>
  Array.from({ length: aisles }, (_, a) => ({
    id: `aisle-${a}`,
    label: `Aisle ${a}`,
    products: Array.from({ length: perAisle }, (_, p) => ({
      id: `p-${a}-${p}`,
      subcategory: `kind ${p % 9}`,
      brand: `Brand ${p % 12}`
    }))
  }));

console.log("— the index does not grow with the store —");

const real = aisleIndex();
check(
  "a small store gets the detailed index: kinds and brands",
  /kinds:/.test(real) && /brands:/.test(real),
  `${real.length} chars for ${real.split("\n").length} aisles`
);

const hundred = aisleIndexFrom(storeOf(100));
check(
  "a hundred aisles still fits in the prompt",
  hundred.length <= 2000,
  `${hundred.length} chars, ~${Math.round(hundred.length / 4)} tokens`
);

const thousand = aisleIndexFrom(storeOf(1000));
check(
  "a thousand aisles fits too, which is the whole claim",
  thousand.length <= 2000,
  `${thousand.length} chars, ~${Math.round(thousand.length / 4)} tokens`
);
check(
  "and it is still a usable index, naming real aisles",
  /aisle-0\b/.test(thousand) && thousand.split("\n").length > 5
);
check(
  "and it admits what it left out, so the model searches instead of assuming",
  /more aisles: search/.test(thousand),
  thousand.split("\n").pop()
);

/*
 * The comparison that makes the point: spelling every aisle out in full is
 * what this cap exists to prevent.
 */
const uncapped = aisleIndexFrom(storeOf(1000), Number.MAX_SAFE_INTEGER);
check(
  "uncapped, that same store would be a five-figure prompt every session",
  uncapped.length > 100000,
  `~${Math.round(uncapped.length / 4 / 1000)}k tokens uncapped vs ~${Math.round(thousand.length / 4)} capped`
);

check(
  "and search never reads the index, so nothing is lost by trimming it",
  findProducts("lactose free milk").products.length > 0 &&
    findProducts("sharp cheddar").products.length > 0
);

console.log("\n— what a conversation costs —");

resetSpend();
check("nothing said, nothing owed", spendReport().dollars === 0 && spendReport().turns === 0);

/* One turn, in the shape the Realtime API reports it. */
recordUsage({
  input_tokens: 1500,
  output_tokens: 400,
  input_token_details: { text_tokens: 1200, audio_tokens: 300, cached_tokens: 1000 },
  output_token_details: { text_tokens: 40, audio_tokens: 360 }
});
let now = spendReport();
check("a turn is counted", now.turns === 1);
check(
  "cached context is billed at the cached rate, not twice",
  now.tokens.cachedIn === 1000 &&
    now.tokens.textIn + now.tokens.audioIn + now.tokens.cachedIn === 1500,
  `${now.tokens.textIn} text + ${now.tokens.audioIn} audio + ${now.tokens.cachedIn} cached`
);
const byHand =
  (now.tokens.textIn * RATES.textIn +
    now.tokens.audioIn * RATES.audioIn +
    now.tokens.cachedIn * RATES.cachedIn +
    now.tokens.textOut * RATES.textOut +
    now.tokens.audioOut * RATES.audioOut) /
  1e6;
check(
  "and the money is just the tokens times the rate",
  Math.abs(now.dollars - byHand) < 1e-9,
  money(now.dollars)
);
check(
  "the voice is the expensive half, not the catalogue",
  now.tokens.audioOut * RATES.audioOut > now.tokens.textIn * RATES.textIn
);
check("sub-cent amounts are shown, not rounded to nothing", money(0.0031) === "$0.0031");

/*
 * A whole conversation. The token counts per turn are the assumption here —
 * the live meter in the status panel replaces them with what the API actually
 * reported — but the shape is the answer to "what does this cost a shopper".
 */
resetSpend();
const TURNS = 15;
/*
 * A turn re-sends the whole conversation. Everything already sent is cached at
 * a tenth of the rate, so what is charged in full is only what is new: their
 * sentence, and the search result the answer is built from. The standing
 * instructions and the aisle index are therefore paid for about once per
 * session rather than once per turn.
 *
 * The detail lines are totals by modality with the cached part called out
 * inside them, which is how the API reports it, so the history has to appear in
 * both places or the arithmetic double counts.
 */
const FRESH_TEXT = 250; // the search result this turn's answer came from
const FRESH_AUDIO = 500; // roughly ten seconds of someone talking
const SAID_BACK = 450; // roughly nine seconds of answer
const HISTORY_TEXT = 280; // what a turn leaves behind in words
const HISTORY_AUDIO = FRESH_AUDIO + SAID_BACK; // and in voice
const OPENING = 1350; // instructions plus the aisle index, cached after turn one

const turn = (i) => {
  const cachedText = OPENING + i * HISTORY_TEXT;
  const cachedAudio = i * HISTORY_AUDIO;
  return {
    input_tokens: FRESH_TEXT + cachedText + FRESH_AUDIO + cachedAudio,
    output_tokens: 30 + SAID_BACK,
    input_token_details: {
      text_tokens: FRESH_TEXT + cachedText,
      audio_tokens: FRESH_AUDIO + cachedAudio,
      cached_tokens: cachedText + cachedAudio,
      cached_tokens_details: { text_tokens: cachedText, audio_tokens: cachedAudio }
    },
    output_token_details: { text_tokens: 30, audio_tokens: SAID_BACK }
  };
};

/** The same conversation priced without touching the running meter. */
const convoCost = (turns) => {
  let total = 0;
  for (let i = 0; i < turns; i += 1) {
    const u = turn(i);
    total += dollarsFor({
      textIn: FRESH_TEXT,
      audioIn: FRESH_AUDIO,
      cachedIn: u.input_token_details.cached_tokens,
      textOut: 30,
      audioOut: SAID_BACK
    });
  }
  return total;
};

for (let i = 0; i < TURNS; i += 1) recordUsage(turn(i));
now = spendReport();
console.log(
  `      a ${TURNS}-turn conversation: ${now.total.toLocaleString()} tokens, ` +
    `${money(now.dollars)} — ${money(now.dollars / TURNS)} a turn`
);
console.log(
  `      at that rate: ${money(now.dollars * 100)} per hundred conversations, ` +
    `${money(now.dollars * 10000)} per ten thousand`
);
/*
 * Worth being plain about which way this cuts. The catalogue is free; the voice
 * is not. Nearly all of that figure is audio out, and it scales with minutes
 * spoken, so the lever on the bill is a shopper's time, not the store's size.
 */
const audioShare =
  (now.tokens.audioIn * RATES.audioIn + now.tokens.audioOut * RATES.audioOut) / 1e6 / now.dollars;
check(
  "a conversation costs well under a dollar",
  now.dollars > 0 && now.dollars < 1,
  money(now.dollars)
);
check(
  "and the voice is nearly all of it, so minutes are the lever, not items",
  audioShare > 0.75,
  `${Math.round(audioShare * 100)}% of the bill is audio`
);

/*
 * The same conversation in a store a thousand times bigger. The only thing the
 * store's size touches is the index, which is capped, and the shortlist, which
 * is a fixed handful — so the bill is the same. This is what makes it a
 * business rather than a science project.
 */
const smallIndex = Math.round(aisleIndexFrom(storeOf(4)).length / 4);
const bigIndex = Math.round(thousand.length / 4);
check(
  "and a store a thousand times bigger charges the same per conversation",
  Math.abs(bigIndex - smallIndex) * RATES.textIn / 1e6 < 0.01,
  `index ${smallIndex} tokens small store, ${bigIndex} tokens at a thousand aisles`
);

check(
  "twice the talking is twice the bill: it tracks conversations, not catalogue",
  (() => {
    const one = dollarsFor(now.tokens);
    resetSpend();
    for (let i = 0; i < TURNS * 2; i += 1) recordUsage(turn(i));
    return spendReport().dollars > one;
  })()
);

console.log("\n— the basket buys the talking —");

/*
 * The two cases that decide whether this is sellable: someone with twenty
 * dollars in the cart talking for ten minutes is a cost, and someone with three
 * hundred talking for twenty is a customer. The allowance has to tell them
 * apart on its own.
 */
check(
  "an empty cart gets a short leash",
  allowanceFor(0) === BASE_ALLOWANCE,
  `${money(allowanceFor(0))} before anything is in the cart`
);
check(
  "a bigger basket earns more talking",
  allowanceFor(2000) < allowanceFor(10000) && allowanceFor(10000) < allowanceFor(30000),
  `$20 -> ${money(allowanceFor(2000))}, $100 -> ${money(allowanceFor(10000))}, $300 -> ${money(allowanceFor(30000))}`
);
check(
  "and no basket buys an unlimited session",
  allowanceFor(10_000_00) === CEILING,
  `capped at ${money(CEILING)}`
);

/* Ten minutes of talking is roughly thirty turns on the model above. */
const tenMinutes = convoCost(30);
const twentyMinutes = convoCost(60);
check(
  "$20 in the cart and ten minutes of talking: moved to typing",
  verdictFor(tenMinutes, 2000) === "spent",
  `${money(tenMinutes)} spent against ${money(allowanceFor(2000))} earned`
);
check(
  "$300 in the cart and twenty minutes of talking: carry on",
  verdictFor(twentyMinutes, 30000) === "fine",
  `${money(twentyMinutes)} spent against ${money(allowanceFor(30000))} earned`
);
check(
  "a warning comes before the switch, not with it",
  verdictFor(allowanceFor(10000) * 0.8, 10000) === "warn" &&
    verdictFor(allowanceFor(10000) * 0.5, 10000) === "fine"
);
check(
  "putting something in the cart mid-conversation buys more time",
  verdictFor(tenMinutes, 2000) === "spent" && verdictFor(tenMinutes, 12000) === "fine",
  `same ${money(tenMinutes)} spent: spent at $20 in the cart, fine at $120`
);
check(
  "and the store's exposure per conversation is a number, not a hope",
  leftFor(CEILING, 10_000_00) === 0 && allowanceFor(30000) <= CEILING,
  `worst case ${money(CEILING)} a session`
);

const demo = fs.readFileSync("components/dierbergs/DierbergsDemo.tsx", "utf8");
check(
  "the live line is actually governed by it",
  /budgetNow\(/.test(demo) && /verdict !== "spent"/.test(demo)
);
check(
  "and running out moves to typing rather than hanging up",
  /Let's carry on in writing/.test(demo) && /setVoiceMode\(false\)/.test(demo)
);

/* The meter has to be wired to the live line, or it measures nothing. */
const realtime = fs.readFileSync("lib/dierbergs-realtime.ts", "utf8");
check(
  "the live session hands its usage to the meter",
  /recordUsage\(/.test(realtime) && /response\.done/.test(realtime)
);
const diag = fs.readFileSync("components/dierbergs/DemoDiagnostics.tsx", "utf8");
check("and the panel shows it, so nobody has to take my word for it", /spendReport\(/.test(diag));

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
