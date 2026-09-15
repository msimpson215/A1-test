/**
 * Packshots come from the item number, and a missing one is not a broken store.
 *
 * The objection this answers: "you'll have to do it with SKUs, because the
 * images will never work." Across forty thousand items some pictures will be
 * missing, slow or wrong, and a store that shows a torn tile — or worse, cannot
 * sell the thing — is not a store. So: every picture is fetched by item number,
 * and with the pictures blocked entirely the shelf still reads and still sells.
 */
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

const open = async ({ blockPackshots }) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(parserOnly);
// The parser stands in for the model here. That is a fixture, not what a
// shopper gets: with no flag an unreachable model says so and touches nothing.
await page.evaluateOnNewDocument(() => {
  window.__parserAsBrain = true;
});
  if (blockPackshots) {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (/\/dierbergs\/products\//.test(req.url())) req.abort();
      else req.continue();
    });
  }
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
  await page.click(".shopper-nav-pill");
  await page.waitForSelector(".axon-strip-input");
  await wait(700);
  return page;
};

const type = async (page, q) => {
  await page.$eval(".axon-strip-input", (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type(".axon-strip-input", q);
  await page.keyboard.press("Enter");
  await wait(1600);
};

/* 1. Every picture on the shelf is addressed by its item number. */
let page = await open({ blockPackshots: false });
await type(page, "I need milk");
const sources = await page.$$eval(".db-card .db-card-media img", (els) =>
  els.map((e) => e.getAttribute("src"))
);
check(
  "every packshot is addressed by item number, not by a hand-named file",
  sources.length > 0 && sources.every((s) => /\/dierbergs\/products\/[A-Z0-9]+\.png$/.test(s)),
  sources.join(" ").slice(0, 150)
);
const loaded = await page.$$eval(".db-card .db-card-media img", (els) =>
  els.every((e) => e.complete && e.naturalWidth > 0)
);
check("and the pictures they name are really there", loaded, `${sources.length} on the shelf`);
await page.close();

/* 2. With every picture blocked, the shelf still reads and still sells. */
page = await open({ blockPackshots: true });
await type(page, "I need milk");
const blanks = await page.$$eval(".db-no-photo", (els) => els.length);
const cards = await page.$$eval(".db-card", (els) => els.length);
check("with the pictures gone, every tile says so instead of tearing", cards > 1 && blanks === cards, `${blanks} of ${cards}`);

const named = await page.$$eval(".db-card", (els) =>
  els.every((c) => (c.querySelector(".db-name")?.textContent || "").trim().length > 3)
);
const priced = await page.$$eval(".db-card", (els) =>
  els.every((c) => /\$\d/.test(c.querySelector(".db-price")?.textContent || ""))
);
check("and still says what it is", named);
check("and what it costs", priced);

const boxes = await page.$$eval(".db-card-media", (els) =>
  els.map((e) => Math.round(e.getBoundingClientRect().height))
);
check(
  "and the shelf keeps its shape",
  boxes.length > 1 && new Set(boxes).size === 1 && boxes[0] > 40,
  `${boxes.join(", ")}`
);

await type(page, "add the half gallon");
const bag = await page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
check("and a product with no picture still goes in the cart", /1 item/.test(bag), bag);
await page.close();

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
