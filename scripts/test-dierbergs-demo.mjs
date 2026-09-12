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
  // No microphone, so the live voice line cannot open. That is the point:
  // this suite covers the typed path a machine without one falls back to.
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    get: () => ({ getUserMedia: () => Promise.reject(new Error("no microphone here")) })
  });
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
  // These suites exercise the conversation, not the voice pipe. Cut the neural
  // request so the run is deterministic and costs nothing to repeat.
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    // The model is the real brain; these suites deliberately cut it off so
    // they test the parser that has to carry the demo when the network does
    // not, and so they stay deterministic and free.
    if (url.includes("/api/tts") || url.includes("/api/understand") || url.includes("api.openai.com")) {
      return Promise.reject(new TypeError("network brain disabled for this test"));
    }
    return realFetch(input, init);
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
if (process.env.TRACE) page.on("console", (m) => console.log("   [app]", m.text()));
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
  return { text: el.innerText.trim(), left: Math.round(r.left), top: Math.round(r.top), height: Math.round(r.height) };
});
check("nav entry reads 'Your Shopper'", pill.text === "Your Shopper", pill.text);
// Measured off the storefront capture: the nav links end at x 476 and sit
// 16-26px apart, and Dierbergs' own "Weekly Ad" chip occupies y 14-36.
const WEEKLY_AD = { top: 14, bottom: 36, height: 23 };
check(
  "nav entry keeps the gap the other links use",
  pill.left - 476 >= 16 && pill.left - 476 <= 26,
  `${pill.left - 476}px after the last link`
);
check(
  "nav entry shares the Weekly Ad chip's top edge",
  pill.top === WEEKLY_AD.top,
  `top ${pill.top}, chip is at ${WEEKLY_AD.top}`
);
check(
  "nav entry is the same height as the Weekly Ad chip",
  Math.abs(pill.height - WEEKLY_AD.height) <= 1,
  `${pill.height}px tall, chip is ${WEEKLY_AD.height}px`
);
check(
  "nav entry clears the red header below it",
  pill.top + pill.height <= 44,
  `bottom ${pill.top + pill.height}, header starts at 45`
);
// Built like the chip, not like an overlay: square-ish corner, no outline.
const skin = await page.$eval(".shopper-nav-pill", (el) => {
  const s = getComputedStyle(el);
  return { radius: s.borderRadius, border: s.borderTopWidth };
});
check("nav entry uses the nav's corner, not a capsule", parseFloat(skin.radius) <= 6, skin.radius);
check("nav entry has no pasted-on outline", parseFloat(skin.border) === 0, `${skin.border} border`);
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
  "asks how it can help with shopping",
  /how can I help you with your shopping/i.test(
    await page.evaluate(() => window.__spoken.map((s) => s.text || s).join(" "))
  ),
  await page.evaluate(() => window.__spoken.map((s) => s.text || s).join(" "))
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
check("second item accumulates to 2 items $8.15", (await cart()) === "2 items $8.15", await cart());

/* Same conversation again, spoken, and with no microphone press at all. */
await page.click(".reset-demo");
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
  window.__script = [
    "I need milk bread and cheese",
    "what different cheddar cheeses do you have",
    "put the cheese in my cart",
    "I would like the milk now"
  ];
});
await page.click(".shopper-nav-pill");
// It has to start listening off the back of the greeting. Waiting on a
// microphone press reads as being greeted and then ignored.
let sawListening = false;
for (let i = 0; i < 120 && !sawListening; i += 1) {
  if (await page.$(".axon-mic")) {
    sawListening = await page.$eval(".axon-mic", (el) => el.className.includes("is-listening"));
  }
  if (!sawListening) await new Promise((r) => setTimeout(r, 50));
}
check("listens on its own after the greeting, with no mic press", sawListening);
for (let i = 0; i < 50; i += 1) {
  await new Promise((r) => setTimeout(r, 400));
  if ((await page.evaluate(() => window.__script.length)) === 0) break;
}
await new Promise((r) => setTimeout(r, 4000));
check("hands-free voice run reaches 2 items $8.15", (await cart()) === "2 items $8.15", await cart());
check(
  "voice run needed no microphone press at all",
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
