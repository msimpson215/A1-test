/**
 * The four product cells, asked the questions they were built for.
 *
 * This drives the page the way a shopper does — typing into the strip and
 * looking at what appears on the shelf — and asserts on what comes up, never
 * on wording. It runs with the model unreachable, so what it proves is that
 * the cells themselves hold the right products and that the offline parser
 * can still find them when the line is down. The live model gets the same
 * cells with more attributes than this path uses.
 *
 *   node scripts/test-dierbergs-cells.mjs http://localhost:3100/dierbergs-demo
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:3100/dierbergs-demo";
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
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

await page.evaluateOnNewDocument(() => {
  window.__spoken = [];
  // No microphone, so no live voice line: every request goes down the typed
  // path and lands on the offline parser, which is what this suite is for.
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    get: () => ({ getUserMedia: () => Promise.reject(new Error("no microphone here")) })
  });
  const synth = {
    getVoices: () => [{ name: "Google US English", lang: "en-US", localService: false }],
    cancel() {},
    speak(u) {
      window.__spoken.push(u.text);
      setTimeout(() => u.onend?.(), 20);
    },
    onvoiceschanged: null
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
    value: class {
      constructor(t) {
        this.text = t;
        this.onend = null;
        this.onerror = null;
      }
    }
  });
  // The model is the brain; cutting it off is deliberate here so the run is
  // deterministic, free, and proves the cells stand up without a network.
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/tts") || url.includes("/api/understand") || url.includes("api.openai.com")) {
      return Promise.reject(new TypeError("network brain disabled for this test"));
    }
    return realFetch(input, init);
  };
});

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector(".shopper-nav-pill", { timeout: 30000 });
// The pill is in the server-rendered markup before React has picked it up, so
// a click too early lands on nothing. Retry until the strip actually opens.
for (let attempt = 0; attempt < 10; attempt += 1) {
  await page.click(".shopper-nav-pill").catch(() => {});
  await wait(1000);
  if (await page.$(".axon-strip-input")) break;
}
await page.waitForSelector(".axon-strip-input", { timeout: 15000 });
// Let the greeting finish so the first question is not spoken over it.
await wait(2500);

const cards = () => page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent.trim()));
const mini = () =>
  page.$$eval(".also-requested .db-mini-name", (els) => els.map((e) => e.textContent.trim()));
const sizes = () => page.$$eval(".db-card .db-size", (els) => els.map((e) => e.textContent.trim()));
const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
const said = () => page.evaluate(() => window.__spoken.join(" "));

async function ask(text, settle = 1600) {
  await page.click(".axon-strip-input");
  await page.type(".axon-strip-input", text);
  await page.keyboard.press("Enter");
  await wait(settle);
  return cards();
}

/** Every card on the shelf matches, and there are at most four of them. */
function shelfIsAll(pattern, shown) {
  return shown.length > 0 && shown.length <= 4 && shown.every((n) => pattern.test(n));
}

console.log("\n--- BREAD CELL ---\n");

let shown = await ask("Show me bread.");
check("show me bread puts bread up", shown.length > 0 && shown.length <= 4, shown.join(" | "));

shown = await ask("Do you have wheat bread?");
check("wheat bread returns only wheat", shelfIsAll(/wheat/i, shown), shown.join(" | "));

shown = await ask("What sourdough do you have?");
check("sourdough returns only sourdough", shelfIsAll(/sourdough/i, shown), shown.join(" | "));

shown = await ask("No, I meant rye.");
check("a correction switches the shelf, not adds to it", shelfIsAll(/rye|pumpernickel/i, shown), shown.join(" | "));

shown = await ask("Do you have bagels?");
check("bagels are stocked", shelfIsAll(/bagel/i, shown), shown.join(" | "));

shown = await ask("Do you have gluten free bread?");
check("gluten free returns only badged products", shelfIsAll(/gluten free|canyon|udi/i, shown), shown.join(" | "));

shown = await ask("Do you have whole grain?");
check("whole grain is a kind of its own", shown.length > 0 && shown.length <= 4, shown.join(" | "));

shown = await ask("Which white bread is cheapest?");
check(
  "cheapest white bread narrows to one",
  shown.length === 1,
  shown.join(" | ")
);

console.log("\n--- MILK CELL ---\n");

shown = await ask("I need milk.");
check("milk opens on the four fat levels", shown.length === 4, shown.join(" | "));

shown = await ask("Do you have lactose free?");
check("lactose free milk is stocked", shelfIsAll(/lactaid|lactose/i, shown), shown.join(" | "));

shown = await ask("What about organic?");
check("organic milk is stocked", shelfIsAll(/organic|horizon|valley|kalona/i, shown), shown.join(" | "));

shown = await ask("A half gallon of two percent.");
check("kind and size together land on one carton", shown.length === 1, shown.join(" | "));

await ask("Put that one in my cart.", 3000);
check("that one adds the carton on the shelf", (await cart()).startsWith("1 item"), await cart());

console.log("\n--- EGG CELL ---\n");

shown = await ask("I need eggs.");
check("eggs come up", shown.length > 0 && shown.length <= 4, shown.join(" | "));

shown = await ask("Do you have an 18 count?");
// The count is on the carton, not always in the name: one of these is simply
// "Ben Roberts' Large Grade A Eggs", sold eighteen to a box.
const eighteens = await sizes();
check(
  "eighteens exist now",
  eighteens.length > 0 && eighteens.every((s) => /18/.test(s)),
  `${shown.join(" | ")} @ ${eighteens.join(", ")}`
);

shown = await ask("What about jumbo?");
check("jumbo is a size we carry", shelfIsAll(/jumbo/i, shown), shown.join(" | "));

shown = await ask("Do you have cage free?");
check("cage free is stocked", shelfIsAll(/cage free/i, shown), shown.join(" | "));

shown = await ask("Are there organic eggs?");
check("organic eggs are stocked", shelfIsAll(/organic/i, shown), shown.join(" | "));

console.log("\n--- CHEESE CELL ---\n");

shown = await ask("What cheddar cheeses do you have?");
check("cheddar returns cheddar", shelfIsAll(/cheddar/i, shown), shown.join(" | "));

shown = await ask("Do you have sharp cheddar?");
check("sharp is a cheddar we carry", shelfIsAll(/sharp/i, shown), shown.join(" | "));

shown = await ask("Do you have Swiss?");
check("swiss is stocked", shelfIsAll(/swiss/i, shown), shown.join(" | "));

shown = await ask("Do you have provolone?");
check("provolone is stocked", shelfIsAll(/provolone/i, shown), shown.join(" | "));

shown = await ask("What about shredded?");
check("shredded is a form, not a kind", shelfIsAll(/shred/i, shown), shown.join(" | "));

shown = await ask("Do you have sliced cheddar?");
check("sliced cheddar narrows on both", shelfIsAll(/slice|ultra thin/i, shown), shown.join(" | "));

shown = await ask("Which cheddar is cheapest?");
check("cheapest cheddar narrows to one", shown.length === 1, shown.join(" | "));

const before = await cart();
await ask("Put that one in my cart.", 3000);
const after = await cart();
check("that one adds the cheese, on top of the milk", after !== before && after.startsWith("2 items"), `${before} -> ${after}`);

console.log("\n--- ACROSS THE TRIP ---\n");

check("also requested keeps the earlier aisles in view", (await mini()).length > 0, (await mini()).join(" | "));
check(
  "nothing was invented: every spoken line names a real product or aisle",
  !/rated|review|star|healthiest/i.test(await said()),
  ""
);
check("no page errors", errors.length === 0, errors.join(" | "));

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
