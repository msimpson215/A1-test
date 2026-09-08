/**
 * Films the milk run against whichever host is passed in, so the flow can be
 * watched rather than described.
 *
 * Uses the DevTools screencast rather than a screenshot loop. Sequential
 * screenshots block the page for roughly 200ms each, which is slow enough to
 * step straight over a 700ms animation and make a working flight look like a
 * jump cut. The screencast streams frames as the compositor produces them.
 */
import puppeteer from "puppeteer-core";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const URL = process.argv[2] || "http://localhost:4310/dierbergs-demo/";
const OUT = process.argv[3] || "/tmp/frames";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=1"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

// No audio device here, so speech would fall back and stretch the run out.
// The picture is the point. The recogniser is stubbed rather than left absent
// because a headless Chrome with no microphone puts a browser warning on the
// strip that a shopper with a microphone would never see.
await page.evaluateOnNewDocument(() => {
  window.__spoken = [];
  class R {
    start() { setTimeout(() => this.onend?.(new Event("end")), 200); }
    stop() {}
    abort() {}
  }
  window.webkitSpeechRecognition = R;
  window.SpeechRecognition = R;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/tts")) return Promise.reject(new TypeError("silent capture"));
    return realFetch(input, init);
  };
  const synth = {
    getVoices: () => [{ name: "Google US English", lang: "en-US", localService: false }],
    cancel() {},
    speak(u) {
      window.__spoken.push(u.text);
      setTimeout(() => u.onend?.(), Math.min(1200, 300 + u.text.length * 18));
    },
    onvoiceschanged: null
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true, writable: true,
    value: class { constructor(t) { this.text = t; this.onend = null; this.onerror = null; } }
  });
});

await page.goto(URL, { waitUntil: "networkidle0", timeout: 90000 });
await wait(600);

const cdp = await page.createCDPSession();
const stamps = [];
let n = 0;
cdp.on("Page.screencastFrame", async ({ data, sessionId, metadata }) => {
  writeFileSync(`${OUT}/f${String(n++).padStart(5, "0")}.png`, Buffer.from(data, "base64"));
  stamps.push(metadata.timestamp);
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });

// Waits for the turn to finish rather than guessing at it. A fixed pause is
// long enough until the model takes a beat longer, and then the next line is
// typed into a box the app is about to clear, and the step silently vanishes.
const type = async (text) => {
  await page.click(".axon-strip-input");
  await page.type(".axon-strip-input", text, { delay: 40 });
  await wait(300);
  await page.keyboard.press("Enter");
  // The answer being spoken is the reliable signal that the turn is over;
  // the busy flag alone flickers false before the work has started.
  for (let i = 0; i < 150; i += 1) {
    await wait(100);
    const done = await page.evaluate(
      () => window.__spoken.length > 0 &&
        document.querySelector(".axon-strip")?.dataset.busy !== "true"
    );
    if (done) return;
  }
};

// The trip as spoken, one line per turn. Overridable so a single aisle can be
// filmed on its own without editing this.
const SCRIPT = process.env.DEMO_SCRIPT
  ? JSON.parse(process.env.DEMO_SCRIPT)
  : [
      "I need milk",
      "put the whole milk in the cart",
      "what cheeses do you have",
      "the Cabot, put it in the cart",
      "I need eggs",
      "nope, not the 18. I need a dozen eggs",
      "the Eggland's",
      "put it in the cart"
    ];

await wait(900);
await page.click(".shopper-nav-pill");
await wait(2400);
for (const line of SCRIPT) {
  await page.evaluate(() => { window.__spoken = []; });
  await type(line);
  // The flight outlasts the turn, and a viewer needs a moment to read.
  await wait(1600);
}
await wait(1200);

await cdp.send("Page.stopScreencast");
await browser.close();

const span = stamps.length > 1 ? stamps.at(-1) - stamps[0] : 1;
console.log(`${n} frames over ${span.toFixed(1)}s — ${(n / span).toFixed(1)} fps`);
