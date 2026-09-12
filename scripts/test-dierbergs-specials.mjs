/**
 * This week's ad, and asking for more than one thing.
 *
 * Two complaints from a live trip: asking for a special had no answer, and
 * ordering two of something only ever bought one. The model is cut off here so
 * the parser answers, which is the floor: if this passes with no model at all,
 * a special is a fact of the store rather than something a model made up.
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:3001/dierbergs-demo";
const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// No microphone, no model: the parser has to carry this on its own.
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
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
    value: class { constructor(t) { this.text = t; this.onend = null; this.onerror = null; } }
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

const line = () => page.$eval(".axon-strip-prompt", (el) => el.textContent.trim());
const names = () => page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent.trim()));
const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
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

await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input");
await wait(800);

/* 1. A special on each cell, in his words. */
const cellChecks = [
  ["is there a special on eggs?", /18 count|eggland/i, /5\.49/],
  ["is there a special on bread?", /nature/i, /3\.99/],
  ["what about a special on milk?", /whole milk/i, /3\.49/],
  ["any specials on cheese?", /sargento|cheddar/i, /2\.99/]
];
for (const [said, who, price] of cellChecks) {
  await type(said);
  const spoken = await line();
  const shelf = await names();
  check(
    `“${said}”`,
    who.test(spoken) && price.test(spoken) && /through Saturday/i.test(spoken) && shelf.length === 1,
    `${spoken} · shelf: ${shelf.join(", ") || "(empty)"}`
  );
}

/* 2. The card says Special, with the old price struck through. */
await type("is there a special on eggs?");
const flag = await page.$eval(".db-deal-flag", (el) => el.textContent.trim()).catch(() => "");
const was = await page.$eval(".db-was", (el) => el.textContent.trim()).catch(() => "");
const now = await page.$eval(".db-deal", (el) => el.textContent.trim()).catch(() => "");
check("the card carries the ad price", flag === "Special" && now === "$5.49" && was === "$7.49", `${flag} ${now} was ${was}`);

/* 3. "Yes" after the offer buys that one thing. */
await type("yes please");
check("yes to a special adds it, at the ad price", /1 item \$5\.49/.test(await cart()), await cart());

/* 4. Two of the same thing. The plus is not a one-shot. */
await type("I need a half gallon of milk");
const before = await cart();
const plus = await page.$$(".db-card .db-add");
await plus[0].click();
await wait(2600);
const one = await cart();
const plusAgain = await page.$$(".db-card .db-add");
await plusAgain[0].click();
await wait(2600);
const two = await cart();
check("the same carton can go in twice", one !== two && /3 items \$10\.87/.test(two), `${before} -> ${one} -> ${two}`);
check(
  "the card counts them",
  /2 in cart/.test(await page.$eval(".db-card .db-add", (el) => el.textContent.trim())),
  await page.$eval(".db-card .db-add", (el) => el.textContent.trim())
);

/* 5. Nothing else claims to be on special. */
await type("show me the bread");
const flags = await page.$$eval(".db-deal-flag", (els) => els.length);
check("only the ad item is flagged", flags <= 1, `${flags} flagged of ${(await names()).length}`);

check("no page errors", errors.length === 0, errors.join(" | "));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
