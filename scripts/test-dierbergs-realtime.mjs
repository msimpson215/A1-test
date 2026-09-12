/**
 * The live voice line, end to end.
 *
 * Chrome is given a fake microphone, which is enough to open the WebRTC line
 * but not to say anything into it. So the words go down the same data channel
 * the microphone would feed, which is what the typed box does anyway while a
 * line is open. Everything after that point — the model hearing it, choosing
 * a tool, the shelf changing, the package flying into the cart — is the real
 * path, running against the real model.
 *
 * This suite costs money to run and is not deterministic. It asserts what a
 * shopper would notice, never wording.
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "https://a1-test-fyjq.onrender.com/dierbergs-demo/";
const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    // A fake capture device, so getUserMedia resolves and the line can open.
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required"
  ]
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
if (process.env.TRACE) page.on("console", (m) => console.log("   [app]", m.text()));

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

await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });

const cards = () => page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent.trim()));
const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
const strip = () => page.$eval(".axon-strip-prompt", (el) => el.textContent.trim());
const isLive = () =>
  page.$eval(".axon-strip", (el) => el.dataset.live === "true").catch(() => false);

await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input");

// Opening the line means a handshake with OpenAI, so give it room.
let live = false;
for (let i = 0; i < 60; i += 1) {
  await wait(500);
  if (await isLive()) { live = true; break; }
}
check("the live voice line opens", live, await strip());
if (!live) {
  console.log("\nno line, nothing further to test");
  await browser.close();
  process.exit(1);
}

check("an audio element is receiving the model's voice", await page.$eval("audio", (el) => Boolean(el.srcObject)).catch(() => false));

// The model greets on its own. Its transcript lands on the strip.
let greeted = "";
for (let i = 0; i < 40; i += 1) {
  await wait(500);
  const text = await strip();
  if (text && !/connecting/i.test(text) && /dierbergs|shopper|help/i.test(text)) { greeted = text; break; }
}
check("it opens the conversation itself", Boolean(greeted), greeted || (await strip()));

// From here the words go down the line the microphone feeds.
const say = async (text) => {
  await page.click(".axon-strip-input");
  await page.type(".axon-strip-input", text);
  await page.keyboard.press("Enter");
};

const settle = async (predicate, ms = 25000) => {
  for (let i = 0; i < ms / 250; i += 1) {
    await wait(250);
    if (await predicate()) return true;
  }
  return false;
};

await say("I need milk");
const shelved = await settle(async () => (await cards()).length > 0);
check("asking for milk changes the shelf", shelved, (await cards()).join(" | "));
check("  and it is milk", (await cards()).every((n) => /milk/i.test(n)), (await cards()).join(" | "));
check("  and nothing was bought", (await cart()) === "0 items $0.00", await cart());

let flew = false;
const watch = setInterval(async () => {
  try { if (await page.$(".flying-item")) flew = true; } catch { /* mid-render */ }
}, 40);

await say("put a gallon of whole milk in the cart");
const bought = await settle(async () => /1 item/.test(await cart()));
clearInterval(watch);
check("asking for it puts it in the cart", bought, await cart());
check("  and the package flies there", flew);
check("  and it is the whole milk at $4.44", /1 item \$4\.44/.test(await cart()), await cart());

// Plurals, in the place they used to fail.
await say("what cheeses do you have");
const cheese = await settle(async () => (await cards()).some((n) => /cheddar|cheese/i.test(n)));
check("a plural reaches the cheddar", cheese, (await cards()).join(" | "));

await say("the Cabot, put it in the cart");
const two = await settle(async () => /2 items/.test(await cart()));
check("naming a brand buys it", two, await cart());

check("no page errors", errors.length === 0, errors.join(" | "));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
