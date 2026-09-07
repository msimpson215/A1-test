import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:3001/dierbergs-demo";
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,900"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });

check("route loads", true, page.url());
check(
  "storefront image present",
  await page.$eval(".dierbergs-static-page", (el) => el.complete && el.naturalWidth > 800)
);
const pageH = await page.$eval(".demo-page", (el) => el.scrollHeight);
check("page is taller than viewport (scrolls)", pageH > 900, `height ${pageH}`);
check("AXON AI label present", (await page.$(".axon-nav-label")) !== null);
check("no chatbot bubble class", (await page.$(".bubble, .chatbot, .chat-window")) === null);
check(
  "cart starts at 0 / $0.00",
  (await page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " "))).includes("0 items") &&
    (await page.$eval(".db-cart", (el) => el.innerText)).includes("$0.00")
);

await page.click(".axon-nav-label");
await page.waitForSelector(".axon-strip-slot");
check("strip appears after click", true);
const welcome = await page.$eval(".axon-strip-prompt", (el) => el.textContent || "");
check("welcome copy present", /Welcome to Dierbergs/.test(welcome), welcome);
check("orb has no face text", (await page.$eval(".axon-orb", (el) => el.textContent.trim())) === "");

await page.type(".axon-strip-input", "I need milk, bread and cheese.");
await page.click(".axon-strip-send");
await page.waitForFunction(() => document.querySelectorAll(".db-card").length === 3, { timeout: 5000 });
const names = await page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent));
check("three staple cards", names.length === 3, names.join(" | "));
check("milk card", names.some((n) => /Milk/i.test(n)));
check("bread card", names.some((n) => /Bunny Bread/i.test(n)));
check("borden card", names.some((n) => /Borden/i.test(n)));
check(
  "AXON staple reply",
  /few good matches/i.test(await page.$eval(".axon-strip-prompt", (el) => el.textContent || ""))
);

await page.click(".axon-strip-input", { clickCount: 3 });
await page.type(".axon-strip-input", "What different cheddar cheeses do you have?");
await page.click(".axon-strip-send");
await page.waitForFunction(() => document.querySelectorAll(".db-card").length === 4, { timeout: 5000 });
check("also requested present", (await page.$(".also-requested")) !== null);
const cheddarNames = await page.$$eval(".db-card .db-name", (els) => els.map((e) => e.textContent));
check(
  "four cheddars",
  cheddarNames.length === 4 &&
    cheddarNames.some((n) => /Borden/i.test(n)) &&
    cheddarNames.some((n) => /Sargento/i.test(n)) &&
    cheddarNames.some((n) => /Land O Lakes/i.test(n)) &&
    cheddarNames.some((n) => /Cabot/i.test(n)),
  cheddarNames.join(" | ")
);

const cartBox = await page.$eval(".db-cart", (el) => {
  const r = el.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
});
await page.click(".axon-strip-input", { clickCount: 3 });
await page.type(".axon-strip-input", "I'll take the Borden extra sharp.");
await page.click(".axon-strip-send");

const before = await page.$eval(".db-cart", (el) => el.innerText);
const trace = [];
const t0 = Date.now();
while (Date.now() - t0 < 1200) {
  const p = await page.evaluate(() => {
    const f = document.querySelector(".flying-item");
    if (!f) return null;
    const r = f.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, op: Number(getComputedStyle(f).opacity) };
  });
  if (p) trace.push(p);
  const cartNow = await page.$eval(".db-cart", (el) => el.innerText);
  if (trace.length && cartNow.includes("1 item")) {
    check("cart did not update before flyer existed", true);
    break;
  }
  await new Promise((r) => setTimeout(r, 20));
}
check("flyer created", trace.length > 0, `${trace.length} samples`);
if (trace.length) {
  const last = trace[trace.length - 1];
  const closest = Math.min(...trace.map((p) => Math.hypot(cartBox.cx - p.cx, cartBox.cy - p.cy)));
  check("flyer travels toward cart", closest < 140, `closest ${closest.toFixed(0)}px`);
}
await page.waitForFunction(() => document.querySelector(".db-cart-count")?.textContent === "1 item", { timeout: 4000 });
const after = await page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " "));
check("cart is 1 item $3.91", after.includes("1 item") && after.includes("$3.91"), after);
check("no chatbot after add", (await page.$(".bubble, .chatbot, .chat-window")) === null);

await page.click(".reset-demo");
await page.waitForSelector(".axon-nav-label");
check("reset restores AXON AI label", true);
check(
  "reset cart is empty",
  (await page.$eval(".db-cart", (el) => el.innerText)).includes("0 items")
);

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
