/**
 * Films a shopping trip over the live voice line.
 *
 * Chrome gets a fake microphone, which opens the line but cannot speak into
 * it, so the words go down the same data channel the microphone feeds. What
 * you see is the real thing: the model greets on its own, decides what to put
 * on the shelf, and decides what goes in the cart.
 */
import puppeteer from "puppeteer-core";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const URL = process.argv[2] || "https://a1-test-fyjq.onrender.com/dierbergs-demo/";
const OUT = process.argv[3] || "/tmp/rt-frames";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--force-device-scale-factor=1",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required"
  ]
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => {
  // Chrome's fake capture device emits a test tone, and the model's voice
  // detection rightly hears that as someone talking, so it interrupts itself
  // to say it did not catch anything. A silent track opens the line without
  // putting noise down it. The words go in over the data channel instead.
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext();
    const out = ctx.createMediaStreamDestination();
    return out.stream;
  };
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

await page.click(".shopper-nav-pill");

// The line takes a handshake to open and the model greets itself.
for (let i = 0; i < 60; i += 1) {
  await wait(500);
  const live = await page
    .$eval(".axon-strip", (el) => el.dataset.live === "true")
    .catch(() => false);
  if (live) break;
}
await wait(5000);

const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
const cardCount = () => page.$$eval(".db-card", (els) => els.length);

const say = async (text, until) => {
  await page.click(".axon-strip-input");
  await page.type(".axon-strip-input", text, { delay: 45 });
  await wait(300);
  await page.keyboard.press("Enter");
  for (let i = 0; i < 120; i += 1) {
    await wait(250);
    if (await until()) break;
  }
  // Let the answer finish being spoken before the next line goes in.
  await wait(2600);
};

await say("I need milk", async () => (await cardCount()) > 0);
await say("put a gallon of whole milk in the cart", async () => /1 item/.test(await cart()));
await say("what cheeses do you have", async () => (await cardCount()) > 1);
await say("the Cabot, put it in the cart", async () => /2 items/.test(await cart()));

await wait(1200);
await cdp.send("Page.stopScreencast");
console.log("final cart:", await cart());
await browser.close();

const span = stamps.length > 1 ? stamps.at(-1) - stamps[0] : 1;
console.log(`${n} frames over ${span.toFixed(1)}s — ${(n / span).toFixed(1)} fps`);
