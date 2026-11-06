/**
 * A live conversation with the shopper, one line at a time, from a terminal.
 *
 * The suites and the audit both ask questions somebody wrote down, and a written
 * question can only ever prove the answer to itself. The interesting sentence is
 * always the next one nobody thought of — so this holds the session open and
 * lets whoever is at the keyboard say anything, in any order, changing their
 * mind halfway through, the way a conversation actually goes.
 *
 * It exists so the shopper can be talked to by something that is not the person
 * who built it: point a model at this and the sentences stop being a script.
 *
 *   node scripts/converse-dierbergs.mjs [url]
 *
 * Type a line and get the reply, what is on the shelf, and what is in the cart.
 *   /reset  start over with an empty cart
 *   /quit   done
 */
import readline from "node:readline";
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "https://a1-test-fyjq.onrender.com/dierbergs-demo/";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

/*
 * No microphone and no speaker in a terminal, so the spoken lines are captured
 * as text instead. Everything else — the model, the shelf, the cart — is the
 * demo exactly as a shopper gets it.
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
    if (url.includes("/api/tts")) return Promise.reject(new TypeError("no speaker on a terminal"));
    return realFetch(input, init);
  };
});

await page.goto(URL, { waitUntil: "networkidle0", timeout: 120000 });
await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input", { timeout: 30000 });
await wait(1200);

const shelf = () => page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent.trim()));
const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());

const send = async (line) => {
  const before = await page.evaluate(() => window.__spoken.length);
  await page.$eval(".axon-strip-input", (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type(".axon-strip-input", line);
  await page.keyboard.press("Enter");

  let answered = false;
  for (let i = 0; i < 80; i += 1) {
    await wait(500);
    if ((await page.evaluate(() => window.__spoken.length)) > before) {
      answered = true;
      break;
    }
  }
  // The words land before the screen and the cart do.
  await wait(3200);
  const spoken = await page.evaluate((b) => window.__spoken.slice(b).join(" "), before);
  return { answered, spoken };
};

console.log(`talking to ${URL}`);
console.log("type anything. /reset to empty the cart, /quit when done.\n");

const rl = readline.createInterface({ input: process.stdin, terminal: false });

for await (const raw of rl) {
  const line = raw.trim();
  if (!line) continue;

  if (line === "/quit") break;

  if (line === "/reset") {
    await page.click(".reset-demo");
    await wait(900);
    if (!(await page.$(".axon-strip-input"))) {
      await page.click(".shopper-nav-pill");
      await page.waitForSelector(".axon-strip-input", { timeout: 30000 });
    }
    await wait(1000);
    console.log("RESET\n");
    continue;
  }

  const started = Date.now();
  const { answered, spoken } = await send(line);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`SAID:  ${answered ? spoken : "(no answer at all)"}`);
  console.log(`SHELF: ${(await shelf()).join(" | ") || "(empty)"}`);
  console.log(`CART:  ${await cart()}`);
  console.log(`TOOK:  ${seconds}s`);
  if (pageErrors.length) console.log(`ERRORS: ${pageErrors.join(" | ")}`);
  console.log("");
}

await browser.close();
