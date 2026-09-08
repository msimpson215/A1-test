import puppeteer from "puppeteer-core";
const URL = process.argv[2] || "http://localhost:3001/dierbergs-demo";
const results = [];
const check = (n, p, d="") => { results.push(p); console.log(`${p?"PASS":"FAIL"}  ${n}${d?" — "+d:""}`); };

const harness = (mode) => {
  window.__spoken = [];
  window.__script = [];
  window.__mode = mode;
  class R {
    start() {
      window.__listening = true;
      window.__startedAt = Date.now();
      if (window.__mode === "network-error") {
        setTimeout(() => this.onerror?.({ error: "network" }), 120);
        return;
      }
      // Edge routinely opens the microphone and then never calls back at all.
      if (window.__mode === "dead-mic") return;
      const line = window.__script.shift();
      setTimeout(() => {
        if (!window.__listening) return;
        if (!line) return this.onend?.(new Event("end"));
        window.__listening = false;
        this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { length: 1, isFinal: true, 0: { transcript: line } } } });
      }, 200);
    }
    stop() { window.__listening = false; }
    abort() { window.__listening = false; }
  }
  window.webkitSpeechRecognition = R; window.SpeechRecognition = R;
  const voices = [{ name: "Google US English", lang: "en-US", localService: false }];
  // Mimic the common browser bug: a cancelled utterance never fires onend.
  const synth = {
    getVoices: () => voices,
    cancel() { window.__cancelled = true; },
    speak(u) { window.__spoken.push(u.text); window.__last = u; const d = window.__mode === 'slow-speech' ? 4000 : 80; setTimeout(() => { if (!window.__cancelled) u.onend?.(); }, d); },
    onvoiceschanged: null
  };
  // These suites exercise the conversation, not the voice pipe. Cut the neural
  // request so the run is deterministic and costs nothing to repeat.
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (url.includes("/api/tts") || url.includes("api.openai.com")) {
      return Promise.reject(new TypeError("neural voice disabled for this test"));
    }
    return realFetch(input, init);
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true, writable: true,
    value: class { constructor(t){ this.text=t; this.onend=null; this.onerror=null; window.__cancelled = false; } }
  });
};

const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: "new", args: ["--no-sandbox","--disable-dev-shm-usage"] });

/* 1. Microphone pressed while the greeting is still talking. */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(harness, "slow-speech");
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
  await page.click(".shopper-nav-pill");
  await page.waitForSelector(".axon-mic");
  await new Promise(r => setTimeout(r, 300));           // interrupt mid-greeting
  await page.evaluate(() => { window.__script = ["I need milk bread and cheese"]; });
  const t0 = Date.now();
  await page.click(".axon-mic");
  let started = 0;
  for (let i = 0; i < 100; i += 1) {
    if (await page.evaluate(() => !!window.__startedAt)) { started = Date.now() - t0; break; }
    await new Promise(r => setTimeout(r, 50));
  }
  check("mic pressed during greeting starts listening quickly", started > 0 && started < 1500, `${started}ms`);
  await new Promise(r => setTimeout(r, 2500));
  check("interrupted greeting still yields results", (await page.$$(".db-card")).length === 3);
  await page.close();
}

/* 2. Browser refuses speech recognition, the way Edge often does. */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(harness, "network-error");
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
  await page.click(".shopper-nav-pill");
  await page.waitForSelector(".axon-mic");
  await new Promise(r => setTimeout(r, 900));
  await page.click(".axon-mic");
  await new Promise(r => setTimeout(r, 900));
  const prompt = await page.$eval(".axon-strip-prompt", e => e.textContent);
  const hint = await page.$eval(".axon-strip-hint", e => e.textContent);
  check("recognition failure is stated on screen", /didn't connect|isn't working/i.test(prompt), prompt);
  check("failure tells the shopper what to do", /type below/i.test(hint), hint);
  check("mic no longer stuck in listening", !(await page.$eval(".axon-mic", e => e.className.includes("is-listening"))));
  check("input is focused for typing", await page.evaluate(() => document.activeElement?.className?.includes("axon-strip-input")));
  // Typing must still drive the whole demo after voice dies.
  await page.type(".axon-strip-input", "I need milk, bread and cheese.");
  await page.click(".axon-strip-send");
  await new Promise(r => setTimeout(r, 1500));
  check("typing still works after voice fails", (await page.$$(".db-card")).length === 3);
  await page.close();
}

/* 3. Red send button, not just the Enter key. */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(harness, "ok");
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
  await page.click(".shopper-nav-pill");
  await page.waitForSelector(".axon-strip-input");
  await new Promise(r => setTimeout(r, 900));
  await page.type(".axon-strip-input", "milk bread and cheese");
  await page.click(".axon-strip-send");
  await new Promise(r => setTimeout(r, 1500));
  check("send button submits", (await page.$$(".db-card")).length === 3);
  await page.close();
}

/* 4. Browser opens the microphone and then never answers. */
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(harness, "dead-mic");
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
  await page.click(".shopper-nav-pill");
  await page.waitForSelector(".axon-mic");
  await new Promise(r => setTimeout(r, 1200));
  check("mic opens on its own after the greeting", await page.$eval(".axon-mic", el => el.classList.contains("is-listening")));

  await new Promise(r => setTimeout(r, 10000));
  const after = await page.evaluate(() => ({
    listening: document.querySelector(".axon-mic")?.classList.contains("is-listening"),
    line: document.querySelector(".axon-strip-prompt")?.textContent?.trim() ?? "",
    hint: document.querySelector(".axon-strip-hint")?.textContent?.trim() ?? ""
  }));
  check("a silent microphone does not hang forever", after.listening === false, `listening=${after.listening}`);
  check("the shopper is told the browser never answered", /never sent anything back/i.test(after.line), after.line);
  check("and is told to type or switch to Chrome", /type below|Chrome/i.test(after.hint), after.hint);

  const diag = await page.evaluate(async () => {
    document.querySelector(".demo-diag-toggle").click();
    await new Promise(r => setTimeout(r, 250));
    return document.querySelector(".demo-diag-body")?.textContent ?? "";
  });
  check("status readout names the build and the error", /no-answer/.test(diag), diag.slice(0, 90));
  await page.close();
}

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
