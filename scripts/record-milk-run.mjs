/**
 * Films the milk run against whichever host is passed in, so the flow can be
 * watched rather than described. Frames are grabbed at a steady rate and left
 * in a folder for ffmpeg to assemble.
 */
import puppeteer from "puppeteer-core";
import { mkdirSync, rmSync } from "node:fs";

const URL = process.argv[2] || "http://localhost:4310/dierbergs-demo/";
const OUT = process.argv[3] || "/tmp/frames";
const FPS = 20;

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

// No audio device here, so the speech would fall back and slow the run down.
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
    speak(u) { setTimeout(() => u.onend?.(), Math.min(1400, 400 + u.text.length * 22)); },
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

let n = 0;
let filming = true;
const roll = (async () => {
  while (filming) {
    await page.screenshot({ path: `${OUT}/f${String(n++).padStart(5, "0")}.png` }).catch(() => {});
    await wait(1000 / FPS);
  }
})();

const type = async (text) => {
  await page.click(".axon-strip-input");
  await page.type(".axon-strip-input", text, { delay: 45 });
  await wait(400);
  await page.keyboard.press("Enter");
};

await wait(1200);
await page.click(".shopper-nav-pill");
await wait(2600);
await type("I need milk");
await wait(3200);
await type("whole milk, a gallon");
await wait(3000);
await type("add it to my cart");
await wait(3600);

filming = false;
await roll;
await browser.close();
console.log(`${n} frames in ${OUT}`);
