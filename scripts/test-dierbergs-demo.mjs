import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:3001/dierbergs-demo";
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

// Stands in for Chrome's speech engine so the spoken path is exercised too.
const fakeSpeech = () => {
  window.__spoken = [];
  window.__script = [];
  class FakeRecognition {
    start() {
      window.__listening = true;
      const line = window.__script.shift();
      setTimeout(() => {
        if (!window.__listening) return;
        if (!line) return this.onend?.(new Event("end"));
        window.__listening = false;
        this.onresult?.({
          resultIndex: 0,
          results: { length: 1, 0: { length: 1, isFinal: true, 0: { transcript: line, confidence: 0.9 } } }
        });
      }, 200);
    }
    stop() { window.__listening = false; }
    abort() { window.__listening = false; }
  }
  window.webkitSpeechRecognition = FakeRecognition;
  window.SpeechRecognition = FakeRecognition;
  const voices = [
    { name: "eSpeak compact", lang: "en-US", localService: true },
    { name: "Google US English", lang: "en-US", localService: false }
  ];
  const synth = {
    getVoices: () => voices,
    cancel() {},
    speak(u) { window.__spoken.push({ text: u.text, voice: u.voice?.name }); setTimeout(() => u.onend?.(), 50); },
    onvoiceschanged: null
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    writable: true,
    value: class { constructor(t) { this.text = t; this.onend = null; this.onerror = null; } }
  });
};

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,900"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.evaluateOnNewDocument(fakeSpeech);
await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });

const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
const type = async (q) => {
  await page.$eval(".axon-strip-input", (el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type(".axon-strip-input", q);
  await page.keyboard.press("Enter");
};
const names = () => page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent));

check("route loads", true, page.url());
check(
  "storefront image present",
  await page.$eval(".dierbergs-static-page", (el) => el.complete && el.naturalWidth > 800)
);
const pageH = await page.$eval(".demo-page", (el) => el.scrollHeight);
check("page is taller than viewport (scrolls)", pageH > 900, `height ${pageH}`);

/* Nav entry sits inside the nav row, immediately after Flowers & Gifts. */
const pill = await page.$eval(".shopper-nav-pill", (el) => {
  const r = el.getBoundingClientRect();
  return { text: el.innerText.trim(), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) };
});
check("nav entry reads 'Your Shopper'", pill.text === "Your Shopper", pill.text);
check("nav entry follows Flowers & Gifts", pill.left > 476 && pill.left < 560, `left ${pill.left}`);
check("nav entry sits in the nav row", pill.top < 40, `top ${pill.top}`);
check("no chatbot bubble", (await page.$(".bubble, .chatbot, .chat-window")) === null);
check("cart starts empty", (await cart()) === "0 items $0.00", await cart());
check("no interaction strip before activation", (await page.$(".axon-strip")) === null);

await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip");
await new Promise((r) => setTimeout(r, 700));
check("strip appears on activation", true);
check(
  "welcome copy present",
  /Welcome to Dierbergs/.test(await page.$eval(".axon-strip-prompt", (el) => el.textContent || ""))
);
check(
  "explains it is conversational AI, not a chatbot",
  /conversational ai, not a chatbot/i.test(await page.$eval(".axon-strip-hint", (el) => el.textContent || ""))
);
check("orb carries no face or text", (await page.$eval(".axon-orb", (el) => el.textContent.trim())) === "");
check(
  "speaks with a natural voice, not the robotic default",
  (await page.evaluate(() => window.__spoken[0]?.voice)) === "Google US English",
  await page.evaluate(() => window.__spoken[0]?.voice)
);

await type("I need milk, bread and cheese.");
await new Promise((r) => setTimeout(r, 1400));
const staples = await names();
check("three staple cards", staples.length === 3, staples.join(" | "));
check("milk card", staples.some((n) => /Dierbergs 1% Milk/.test(n)));
check("bread card", staples.some((n) => /Bunny Bread/.test(n)));
check("borden card", staples.some((n) => /Borden/.test(n)));

await type("What different cheddar cheeses do you have?");
await new Promise((r) => setTimeout(r, 1600));
const cheddars = await names();
check("four cheddar cards", cheddars.length === 4, cheddars.join(" | "));
check("also requested holds milk and bread", (await page.$$(".db-mini")).length === 2);

/* The cart must not move until the package lands in it. */
let sawFlyer = false;
let cartDuringFlight = null;
const watch = setInterval(async () => {
  try {
    if (!sawFlyer && (await page.$(".flying-item"))) {
      sawFlyer = true;
      cartDuringFlight = await cart();
    }
  } catch {}
}, 40);

await type("Put the cheese in my cart.");
await new Promise((r) => setTimeout(r, 2600));
clearInterval(watch);
check("package image flies to the cart", sawFlyer);
check("cart holds until the package arrives", cartDuringFlight === "0 items $0.00", String(cartDuringFlight));
check("cart reads 1 item $3.91", (await cart()) === "1 item $3.91", await cart());
check("added card shows an in-cart state", (await page.$(".db-add.is-added")) !== null);

await type("I would like the milk now.");
await new Promise((r) => setTimeout(r, 3000));
check("second item accumulates to 2 items $8.30", (await cart()) === "2 items $8.30", await cart());

/* Same conversation again, spoken rather than typed. */
await page.click(".reset-demo");
await new Promise((r) => setTimeout(r, 400));
await page.click(".shopper-nav-pill");
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  window.__script = [
    "I need milk bread and cheese",
    "what different cheddar cheeses do you have",
    "put the cheese in my cart",
    "I would like the milk now"
  ];
});
await page.click(".axon-mic");
// The stand-in recogniser answers in 200ms, far faster than a person speaking,
// so catch the listening state on the way past rather than after a fixed wait.
let sawListening = false;
for (let i = 0; i < 12 && !sawListening; i += 1) {
  sawListening = await page.$eval(".axon-mic", (el) => el.className.includes("is-listening"));
  if (!sawListening) await new Promise((r) => setTimeout(r, 15));
}
check("microphone shows a listening state", sawListening);
for (let i = 0; i < 50; i += 1) {
  await new Promise((r) => setTimeout(r, 400));
  if ((await page.evaluate(() => window.__script.length)) === 0) break;
}
await new Promise((r) => setTimeout(r, 4000));
check("hands-free voice run reaches 2 items $8.30", (await cart()) === "2 items $8.30", await cart());
check(
  "voice run needed only the one microphone press",
  (await page.evaluate(() => window.__spoken.length)) >= 6,
  `${await page.evaluate(() => window.__spoken.length)} spoken lines`
);

await page.click(".reset-demo");
await new Promise((r) => setTimeout(r, 500));
check("reset restores the nav entry", (await page.$eval(".shopper-nav-pill", (el) => el.innerText.trim())) === "Your Shopper");
check("reset empties the cart", (await cart()) === "0 items $0.00", await cart());
check("no chatbot appeared at any point", (await page.$(".bubble, .chatbot, .chat-window")) === null);
check("no page errors", errors.length === 0, errors.join(" | ").slice(0, 200));

await browser.close();
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
