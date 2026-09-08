import { forSpeaking } from "./dierbergs-pronounce";
/**
 * Optional neural speech for the demo.
 *
 * Browser speech synthesis is capped by whatever voices the machine happens to
 * have, which on most Windows machines means something that sounds like 2004.
 * When a key is present this routes speech through OpenAI's TTS instead and
 * falls back to the browser voice on any failure, so the demo never goes mute.
 *
 * The key lives in localStorage on the machine running the demo. It is never
 * committed, never bundled, and never sent anywhere but OpenAI.
 */

const KEY_STORAGE = "axon.tts.key";
const VOICE_STORAGE = "axon.tts.voice";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/audio/speech";
const MODEL = "gpt-4o-mini-tts";

// Preferred path: this server speaks for us using the key it already holds, so
// nothing has to be configured in the browser. Set NEXT_PUBLIC_TTS_ENDPOINT at
// build time to point a statically hosted copy at that server.
const PROXY_ENDPOINT = process.env.NEXT_PUBLIC_TTS_ENDPOINT || "/api/tts";

// Probed once. Null until we know, then true or false for the session.
let proxyWorks: boolean | null = null;

export function proxyInUse(): boolean {
  return proxyWorks === true;
}

/** Voices with the right character for a friendly store assistant, best first. */
export const NEURAL_VOICES = ["coral", "sage", "marin", "nova", "shimmer", "alloy", "ballad", "cedar"] as const;
export type NeuralVoice = (typeof NEURAL_VOICES)[number];

const PERSONALITY =
  "You are a warm, upbeat personal shopper at a friendly neighbourhood grocery store. " +
  "Speak naturally and conversationally, at an easy pace, like a real person helping someone " +
  "in the aisle. Sound genuinely pleased to help. Never robotic, never salesy, never rushed.";

export function getVoiceKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setVoiceKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = key.trim();
    if (trimmed) window.localStorage.setItem(KEY_STORAGE, trimmed);
    else window.localStorage.removeItem(KEY_STORAGE);
    cache.clear();
  } catch {
    /* storage disabled */
  }
}

export function getNeuralVoice(): NeuralVoice {
  if (typeof window === "undefined") return NEURAL_VOICES[0];
  try {
    const saved = window.localStorage.getItem(VOICE_STORAGE) as NeuralVoice | null;
    return saved && NEURAL_VOICES.includes(saved) ? saved : NEURAL_VOICES[0];
  } catch {
    return NEURAL_VOICES[0];
  }
}

export function setNeuralVoice(voice: NeuralVoice): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VOICE_STORAGE, voice);
    cache.clear();
  } catch {
    /* storage disabled */
  }
}

/**
 * True when neural speech is worth attempting: either this server can speak,
 * or a key was pasted in. Unknown counts as worth attempting exactly once.
 */
export function neuralAvailable(): boolean {
  return proxyWorks !== false || getVoiceKey().length > 0;
}

/** Characters billed this session, so the running cost stays visible. */
let charsSynthesised = 0;
export function neuralUsage(): number {
  return charsSynthesised;
}

let lastError = "";
export function neuralLastError(): string {
  return lastError;
}

// Lines repeat constantly in a demo — the greeting alone is spoken on every
// run — so audio is reused rather than re-billed.
const cache = new Map<string, string>();

/** Ask this server to speak. Returns null when it cannot, so we can fall back. */
async function viaProxy(text: string, voice: NeuralVoice): Promise<Blob | null> {
  if (proxyWorks === false) return null;
  try {
    const res = await fetch(PROXY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice })
    });
    if (!res.ok) {
      // 404 means no such endpoint, 503 means the server has no key. Either
      // way there is no point asking again on every line.
      proxyWorks = false;
      lastError = res.status === 503 ? "server has no OpenAI key" : `speech server ${res.status}`;
      return null;
    }
    proxyWorks = true;
    lastError = "";
    return await res.blob();
  } catch {
    proxyWorks = false;
    lastError = "no speech server reachable";
    return null;
  }
}

/** Fall back to calling OpenAI straight from the browser with a pasted key. */
async function viaBrowserKey(text: string, voice: NeuralVoice): Promise<Blob | null> {
  const key = getVoiceKey();
  if (!key) return null;
  try {
    const res = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        voice,
        input: text,
        instructions: PERSONALITY,
        response_format: "mp3",
        speed: 1.0
      })
    });
    if (!res.ok) {
      lastError = res.status === 401 ? "key rejected (401)" : `http ${res.status}`;
      return null;
    }
    lastError = "";
    return await res.blob();
  } catch (err) {
    lastError = err instanceof Error ? err.message : "request failed";
    return null;
  }
}

async function synthesise(text: string): Promise<string | null> {
  const voice = getNeuralVoice();
  const cacheKey = `${voice}::${text}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const blob = (await viaProxy(text, voice)) ?? (await viaBrowserKey(text, voice));
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  charsSynthesised += text.length;
  cache.set(cacheKey, url);
  return url;
}

/** Fetch audio ahead of time so the first line of a demo is not a dead pause. */
export async function prefetchNeural(lines: string[]): Promise<void> {
  if (!neuralAvailable()) return;
  // Warm the same text playback will ask for, or the cache never gets a hit.
  await Promise.all(lines.map((line) => synthesise(forSpeaking(line)).catch(() => null)));
}

let current: HTMLAudioElement | null = null;

export function stopNeural(): void {
  const audio = current;
  current = null;
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    /* already stopped */
  }
}

/**
 * Speak through the neural voice.
 * Resolves true when it actually spoke, false when the caller should fall back.
 */
export async function speakNeural(text: string): Promise<boolean> {
  const url = await synthesise(text);
  if (!url) return false;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let started = false;
    let stall = 0;
    let guard = 0;

    const done = (spoke: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(stall);
      window.clearTimeout(guard);
      if (current === audio) current = null;
      resolve(spoke);
    };

    const audio = new Audio(url);
    current = audio;

    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    // A paused element means the caller cancelled; that still counts as spoken
    // so the fallback voice does not start up over the top of it.
    audio.onpause = () => done(true);

    // Nothing here can be trusted to fire. A device with no audio output, a
    // blocked autoplay policy or a decode stall will all sit silent forever,
    // and a speech call that never resolves freezes the whole conversation.
    audio.onplaying = () => {
      started = true;
      window.clearTimeout(stall);
    };

    stall = window.setTimeout(() => {
      if (started || audio.currentTime > 0) return;
      lastError = "audio never started playing";
      try {
        audio.pause();
      } catch {
        /* nothing to stop */
      }
      done(false);
    }, 1800);

    const estimate = 2000 + text.length * 80;
    const arm = (ms: number) => {
      window.clearTimeout(guard);
      guard = window.setTimeout(() => done(true), ms);
    };
    arm(estimate);
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) arm(audio.duration * 1000 + 900);
    };

    const playing = audio.play();
    if (playing && typeof playing.catch === "function") {
      playing.catch(() => {
        lastError = "browser blocked audio playback";
        done(false);
      });
    }
  });
}
