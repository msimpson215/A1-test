/**
 * The optional neural voice. The demo must sound better when a key is present
 * and must never go silent when one is absent, wrong, or the network is down.
 */
import puppeteer from "puppeteer-core";

const URL = process.argv[2] || "http://localhost:3001/dierbergs-demo";
const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Stands in for the browser's own speech engine and for OpenAI.
 * `mode` decides how the TTS endpoint behaves.
 */
const harness = (mode) => {
  window.__spoken = [];       // browser-voice lines
  window.__played = [];       // neural audio played
  window.__ttsCalls = [];     // requests that reached the API
  window.__script = [];

  class R {
    start() {
      window.__listening = true;
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
  window.webkitSpeechRecognition = R;
  window.SpeechRecognition = R;

  const synth = {
    getVoices: () => [{ name: "Microsoft David Desktop", lang: "en-US", localService: true }],
    cancel() {},
    speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 40); },
    onvoiceschanged: null
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true, writable: true,
    value: class { constructor(t) { this.text = t; this.onend = null; this.onerror = null; } }
  });

  // Audio never really decodes here, so stand in for the element.
  window.Audio = class {
    constructor(src) {
      this.src = src;
      this.onended = null; this.onerror = null; this.onpause = null;
      setTimeout(() => { window.__played.push(src); this.onended?.(); }, 30);
    }
    play() { return Promise.resolve(); }
    pause() {}
  };
  window.URL.createObjectURL = (b) => `blob:fake-${window.__ttsCalls.length}-${b.size}`;

  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, init) => {
    if (typeof url === "string" && url.includes("/v1/audio/speech")) {
      const body = JSON.parse(init.body);
      window.__ttsCalls.push({ auth: init.headers.Authorization, voice: body.voice, model: body.model, input: body.input, instructions: body.instructions });
      if (mode === "unauthorized") return new Response("nope", { status: 401 });
      if (mode === "offline") throw new TypeError("Failed to fetch");
      return new Response(new Blob([new Uint8Array(64)], { type: "audio/mpeg" }), { status: 200 });
    }
    return realFetch(url, init);
  };
};

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome-stable",
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"]
});

const open = async (mode, key, voice) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(harness, mode);
  if (key !== undefined) {
    await page.evaluateOnNewDocument(
      (k, v) => {
        if (k) window.localStorage.setItem("axon.tts.key", k);
        else window.localStorage.removeItem("axon.tts.key");
        if (v) window.localStorage.setItem("axon.tts.voice", v);
        else window.localStorage.removeItem("axon.tts.voice");
      },
      key, voice ?? ""
    );
  }
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
  return page;
};

/* 1. No key: the browser voice does the talking and nothing is billed. */
{
  const page = await open("ok");
  await page.click(".shopper-nav-pill");
  await wait(1200);
  const s = await page.evaluate(() => ({ spoken: window.__spoken.length, calls: window.__ttsCalls.length }));
  check("without a key the browser voice speaks", s.spoken > 0, `${s.spoken} lines`);
  check("and nothing is sent to OpenAI", s.calls === 0, `${s.calls} calls`);
  await page.close();
}

/* 2. With a key: OpenAI speaks instead, with the personality prompt. */
{
  const page = await open("ok", "sk-test-123", "sage");
  await page.click(".shopper-nav-pill");
  await wait(1500);
  const s = await page.evaluate(() => ({
    spoken: window.__spoken.length,
    played: window.__played.length,
    call: window.__ttsCalls[0] ?? null
  }));
  check("the neural voice is used", s.played > 0, `${s.played} clips played`);
  check("the browser voice stays quiet", s.spoken === 0, `${s.spoken} browser lines`);
  check("the key is sent as a bearer token", s.call?.auth === "Bearer sk-test-123", String(s.call?.auth));
  check("the chosen voice is honoured", s.call?.voice === "sage", String(s.call?.voice));
  check("it asks for the steerable model", s.call?.model === "gpt-4o-mini-tts", String(s.call?.model));
  check(
    "it is told to sound like a person, not a robot",
    /personal shopper/i.test(s.call?.instructions ?? "") && /never robotic/i.test(s.call?.instructions ?? ""),
    (s.call?.instructions ?? "").slice(0, 60)
  );
  await page.close();
}

/* 3. Repeated lines come from cache rather than being billed twice. */
{
  const page = await open("ok", "sk-test-123");
  await page.click(".shopper-nav-pill");
  await wait(1400);
  const before = await page.evaluate(() => window.__ttsCalls.length);
  await page.click(".reset-demo");
  await wait(400);
  await page.click(".shopper-nav-pill");
  await wait(1400);
  const after = await page.evaluate(() => window.__ttsCalls.length);
  check("the same line is not billed twice", after === before, `${before} then ${after} calls`);
  await page.close();
}

/* 4. A rejected key must not leave the demo mute. */
{
  const page = await open("unauthorized", "sk-wrong");
  await page.click(".shopper-nav-pill");
  await wait(1600);
  const s = await page.evaluate(() => ({ spoken: window.__spoken.length, played: window.__played.length }));
  check("a rejected key falls back to the browser voice", s.spoken > 0, `${s.spoken} browser lines`);
  check("and no broken audio is played", s.played === 0, `${s.played} clips`);
  const diag = await page.evaluate(async () => {
    document.querySelector(".demo-diag-toggle").click();
    await new Promise((r) => setTimeout(r, 250));
    return document.querySelector(".demo-diag-body")?.textContent ?? "";
  });
  check("the panel says the key was rejected", /401/.test(diag), diag.slice(0, 100));
  await page.close();
}

/* 5. Network failure must not leave the demo mute either. */
{
  const page = await open("offline", "sk-test-123");
  await page.click(".shopper-nav-pill");
  await wait(1600);
  const spoken = await page.evaluate(() => window.__spoken.length);
  check("a network failure falls back to the browser voice", spoken > 0, `${spoken} browser lines`);
  await page.close();
}

/* 6. The whole shopping loop still completes on the neural voice. */
{
  const page = await open("ok", "sk-test-123");
  const cart = () => page.$eval(".db-cart", (el) => el.innerText.replace(/\s+/g, " ").trim());
  await page.evaluate(() => { window.__script = ["I need milk", "whole milk", "put it in my cart"]; });
  await page.click(".shopper-nav-pill");
  for (let i = 0; i < 45; i += 1) {
    await wait(400);
    if ((await page.evaluate(() => window.__script.length)) === 0) break;
  }
  await wait(3500);
  check("the spoken loop still reaches 1 item $4.44", (await cart()) === "1 item $4.44", await cart());
  check("every line went through the neural voice", (await page.evaluate(() => window.__spoken.length)) === 0);
  await page.close();
}

/* 7. Entering a key in the panel switches voices without a reload. */
{
  const page = await open("ok", "");   // start with no key stored
  await page.click(".demo-diag-toggle");
  await page.waitForSelector("#tts-key");
  await page.type("#tts-key", "sk-typed-key");
  await page.select(".demo-diag-voice select", "marin");
  await page.click(".demo-diag-voice button");
  await wait(1200);
  const s = await page.evaluate(() => ({
    call: window.__ttsCalls[window.__ttsCalls.length - 1] ?? null,
    stored: window.localStorage.getItem("axon.tts.key")
  }));
  check("saving the key plays a sample", s.call !== null, s.call ? "sample spoken" : "no call");
  check("with the voice just chosen", s.call?.voice === "marin", String(s.call?.voice));
  check("and the key is kept on this machine only", s.stored === "sk-typed-key", String(s.stored));
  await page.close();
}

/* 8. Served by the Express app: the server speaks, with nothing configured. */
const SERVER_URL = process.argv[3];
if (SERVER_URL) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    window.__spoken = [];
    window.__played = [];
    window.__proxyCalls = [];
    window.localStorage.removeItem("axon.tts.key");

    const synth = {
      getVoices: () => [{ name: "Microsoft David Desktop", lang: "en-US", localService: true }],
      cancel() {},
      speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 40); },
      onvoiceschanged: null
    };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true, writable: true,
      value: class { constructor(t) { this.text = t; this.onend = null; this.onerror = null; } }
    });

    // The stub audio is not decodable, so stand in for the element.
    window.Audio = class {
      constructor(src) {
        this.src = src;
        this.onended = null; this.onerror = null; this.onpause = null;
        setTimeout(() => { window.__played.push(src); this.onended?.(); }, 30);
      }
      play() { return Promise.resolve(); }
      pause() {}
    };

    const realFetch = window.fetch.bind(window);
    window.fetch = async (url, init) => {
      if (typeof url === "string" && url.includes("/api/tts")) {
        window.__proxyCalls.push(JSON.parse(init.body));
      }
      return realFetch(url, init);
    };
  });
  await page.goto(SERVER_URL, { waitUntil: "networkidle0", timeout: 60000 });
  await page.click(".shopper-nav-pill");
  await wait(2000);

  const s = await page.evaluate(() => ({
    proxy: window.__proxyCalls,
    played: window.__played.length,
    spoken: window.__spoken.length,
    stored: window.localStorage.getItem("axon.tts.key")
  }));
  check("the page asks its own server to speak", s.proxy.length > 0, `${s.proxy.length} calls`);
  check("with no key stored in the browser", !s.stored, String(s.stored));
  check("the returned audio is played", s.played > 0, `${s.played} clips`);
  check("the browser voice is not used", s.spoken === 0, `${s.spoken} browser lines`);
  check("the greeting is what gets spoken", /AI shopper/i.test(s.proxy[0]?.text ?? ""), (s.proxy[0]?.text ?? "").slice(0, 50));

  const diag = await page.evaluate(async () => {
    document.querySelector(".demo-diag-toggle").click();
    await new Promise((r) => setTimeout(r, 250));
    return document.querySelector(".demo-diag-body")?.textContent ?? "";
  });
  check("the panel says the server is doing the talking", /via this server/i.test(diag), diag.slice(0, 130));
  await page.close();
}

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
