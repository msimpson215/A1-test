import puppeteer from "puppeteer-core";
const URL = "https://a1-test-fyjq.onrender.com/dierbergs-demo/";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", args: ["--no-sandbox","--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, get: () => ({ getUserMedia: () => Promise.reject(new Error("none")) }) });
  class R { start(){} stop(){} abort(){} }
  window.webkitSpeechRecognition = R; window.SpeechRecognition = R;
  window.__spoken = [];
  const synth = { getVoices: () => [{ name: "Google US English", lang: "en-US" }], cancel(){}, speak(u){ setTimeout(()=>u.onend?.(),25); }, onvoiceschanged: null };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, writable: true, value: class { constructor(t){ this.text=t; this.onend=null; window.__spoken.push(String(t)); } } });
  const rf = window.fetch.bind(window);
  window.fetch = async (i, init) => { const u = typeof i === "string" ? i : i?.url || ""; if (u.includes("/api/tts")) return Promise.reject(new TypeError("no speaker")); return rf(i, init); };
});
await page.goto(URL, { waitUntil: "networkidle0", timeout: 120000 });
const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g," ").trim());
await page.click(".shopper-nav-pill");
await page.waitForSelector(".axon-strip-input", { timeout: 30000 });
await wait(1200);
const say = async (q) => {
  const b = await page.evaluate(() => window.__spoken.length);
  await page.$eval(".axon-strip-input", (el) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set; s.call(el,""); el.dispatchEvent(new Event("input",{bubbles:true})); });
  await page.type(".axon-strip-input", q);
  await page.keyboard.press("Enter");
  for (let i=0;i<60;i++){ await wait(500); if ((await page.evaluate(() => window.__spoken.length)) > b) break; }
  await wait(3600);
  const lines = await page.evaluate((b) => window.__spoken.slice(b), b);
  console.log(`\n> ${q}`);
  for (const l of lines) console.log(`  FULL: ${l}`);
  console.log(`  cart: ${await cart()}`);
};
for (const q of process.argv.slice(2)) await say(q);
await browser.close();
