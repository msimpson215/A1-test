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
// The picture is the point.
await page.evaluateOnNewDocument(() => {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/tts")) return Promise.reject(new TypeError("silent capture"));
    return realFetch(input, init);
  };
  const synth = {
    getVoices: () => [{ name: "Google US English", lang: "en-US", localService: false }],
    cancel() {},
    speak(u) { setTimeout(() => u.onend?.(), Math.min(1200, 300 + u.text.length * 18)); },
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

const type = async (text) => {
  await page.click(".axon-strip-input");
  await page.type(".axon-strip-input", text, { delay: 40 });
  await wait(300);
  await page.keyboard.press("Enter");
};

await wait(900);
await page.click(".shopper-nav-pill");
await wait(2400);
await type(process.env.DEMO_ASK || "I need milk");
await wait(2600);
await type(process.env.DEMO_NARROW || "whole milk, a gallon");
await wait(2400);
await type("add it to my cart");
await wait(3000);

await cdp.send("Page.stopScreencast");
await browser.close();

const span = stamps.length > 1 ? stamps.at(-1) - stamps[0] : 1;
console.log(`${n} frames over ${span.toFixed(1)}s — ${(n / span).toFixed(1)} fps`);
