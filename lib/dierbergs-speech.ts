export type SpeechHandle = {
  recognition: SpeechRecognition | null;
};

function RecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function speechRecognitionAvailable(): boolean {
  return RecognitionCtor() !== null;
}

export function browserName(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "unknown";
}

// Edge exposes the Web Speech API but its recognition service routinely never
// answers, so the microphone sits open and nothing ever comes back.
export function voiceIsReliable(): boolean {
  return browserName() === "Chrome";
}

export function voiceReport() {
  const voices = typeof window !== "undefined" && window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  return {
    browser: browserName(),
    recognition: speechRecognitionAvailable(),
    voice: bestVoice()?.name ?? "browser default",
    voiceCount: voices.length,
    runnersUp: voiceCandidates(3).slice(1)
  };
}

// Voice quality is the single biggest tell that this is a demo rather than a
// product, and the browser gives us no quality signal — only names. These are
// the names worth having, best first, across Chrome, Edge, macOS and Windows.
const PREFERRED_VOICES = [
  // Edge's networked neural voices are the closest thing a browser has to
  // modern assistant speech, and they cost nothing.
  "Microsoft Ava Online (Natural) - English (United States)",
  "Microsoft Emma Online (Natural) - English (United States)",
  "Microsoft Aria Online (Natural) - English (United States)",
  "Microsoft Jenny Online (Natural) - English (United States)",
  "Microsoft Andrew Online (Natural) - English (United States)",
  "Microsoft Brian Online (Natural) - English (United States)",
  "Microsoft Michelle Online (Natural) - English (United States)",
  // Chrome's own networked voice: dated, but far better than any local SAPI one.
  "Google US English",
  // macOS.
  "Samantha (Enhanced)",
  "Ava (Premium)",
  "Zoe (Premium)",
  "Allison (Enhanced)",
  "Samantha",
  "Ava",
  "Allison"
];

/** True for the flat, clipped voices that make this sound like 2004. */
function isRobotic(name: string): boolean {
  return /espeak|compact|desktop|festival|pico|robot|david|mark|zira|hazel|sapi/i.test(name);
}

function scoreVoice(v: SpeechSynthesisVoice): number {
  const lang = v.lang.toLowerCase();
  if (!lang.startsWith("en")) return -1000;

  const exact = PREFERRED_VOICES.indexOf(v.name);
  if (exact !== -1) return 10000 - exact;

  let score = 0;
  // Networked neural voices are the human-sounding ones. Everything local and
  // unbranded is a synthesiser from a previous era.
  if (/online \(natural\)|neural/i.test(v.name)) score += 600;
  if (/\b(natural|premium|enhanced)\b/i.test(v.name)) score += 250;
  if (!v.localService) score += 200;
  if (/google/i.test(v.name)) score += 150;
  if (/siri/i.test(v.name)) score += 150;
  if (lang.startsWith("en-us")) score += 40;
  if (isRobotic(v.name)) score -= 900;
  return score;
}

/** What else was on offer, so a bad-sounding demo machine can be diagnosed. */
export function voiceCandidates(limit = 3): string[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return [...window.speechSynthesis.getVoices()]
    .sort((a, b) => scoreVoice(b) - scoreVoice(a))
    .slice(0, limit)
    .map((v) => v.name);
}

export function bestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  // Re-ranked every time rather than cached: browsers populate the list
  // progressively, and an early pick strands us on whatever loaded first.
  return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
}

// getVoices() is empty until the browser loads the list asynchronously, and
// speaking before then falls back to the default robotic voice.
function voicesReady(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return resolve();
    if (window.speechSynthesis.getVoices().length) return resolve();

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, 1000);
    window.speechSynthesis.onvoiceschanged = finish;
  });
}

export function primeVoices(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  void voicesReady();
}

// Resolving the in-flight utterance here matters: browsers routinely skip
// onend for a cancelled utterance, and anything awaiting speak() would
// otherwise stay blocked for seconds after the shopper interrupts.
let finishActiveUtterance: (() => void) | null = null;

// Bumped on cancel so an utterance still waiting on the voice list is dropped
// rather than starting to talk after the shopper has moved on.
let speechEpoch = 0;

export function cancelSpeech(): void {
  speechEpoch += 1;
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* nothing to cancel */
  }
  const finish = finishActiveUtterance;
  finishActiveUtterance = null;
  finish?.();
}

export function describeSpeechError(kind: string): { line: string; hint: string } {
  switch (kind) {
    case "not-allowed":
    case "service-not-allowed":
      return {
        line: "Your browser is blocking the microphone.",
        hint: "Allow mic access for this site, then press the microphone again — or just type below."
      };
    case "no-speech":
      return { line: "I didn't hear anything.", hint: "Press the microphone and try again, or type below." };
    case "audio-capture":
      return { line: "I can't reach a microphone.", hint: "Check the input device, or type below." };
    case "network":
    case "language-not-supported":
    case "service-unavailable":
      return {
        line: "Voice recognition didn't connect in this browser.",
        hint: "Microsoft Edge often blocks it. Type below, or open the demo in Chrome for voice."
      };
    case "no-answer":
      return {
        line: "The microphone opened but your browser never sent anything back.",
        hint: "That is usually Microsoft Edge. Type below, or open the demo in Chrome for voice."
      };
    case "aborted":
      return { line: "Voice stopped.", hint: "Press the microphone to start again, or type below." };
    default:
      return {
        line: "Voice isn't working in this browser.",
        hint: "Type below, or open the demo in Chrome for voice."
      };
  }
}

// Never rejects and never hangs: a failed voice must not stall the conversation.
export async function speak(text: string): Promise<void> {
  const startedAt = speechEpoch;
  await voicesReady();
  if (speechEpoch !== startedAt) return;

  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* nothing to cancel */
    }

    const utter = new SpeechSynthesisUtterance(text);
    const voice = bestVoice();
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    }
    const natural = !!voice && (/online \(natural\)|neural|premium|enhanced/i.test(voice.name) || !voice.localService);
    console.info("[Your Shopper] speaking with", voice?.name ?? "browser default", natural ? "(natural)" : "(basic)");
    // Neural voices already phrase well and sound stilted if slowed. The older
    // ones run hot and clipped, so easing off the pace buys some warmth.
    utter.rate = natural ? 1.0 : 0.92;
    utter.pitch = natural ? 1.0 : 1.04;
    utter.volume = 1;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(guard);
      if (finishActiveUtterance === finish) finishActiveUtterance = null;
      resolve();
    };
    finishActiveUtterance = finish;

    // Last resort for browsers that drop onend entirely on some voices.
    const guard = window.setTimeout(finish, 1200 + text.length * 90);

    utter.onend = finish;
    utter.onerror = finish;
    try {
      window.speechSynthesis.speak(utter);
    } catch {
      finish();
    }
  });
}

export type ListenCallbacks = {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (kind: string) => void;
  onEnd?: () => void;
};

export function startListening(cb: ListenCallbacks): SpeechRecognition | null {
  const Ctor = RecognitionCtor();
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let delivered = false;
  let heardSomething = false;

  // Some browsers open the microphone and then never call back at all: no
  // result, no error, no end. Without this the orb listens forever.
  const watchdog = window.setTimeout(() => {
    if (delivered || heardSomething) return;
    try {
      rec.abort();
    } catch {
      /* already gone */
    }
    cb.onError?.("no-answer");
  }, 9000);

  const clearWatchdog = () => window.clearTimeout(watchdog);

  rec.onresult = (event: SpeechRecognitionEvent) => {
    heardSomething = true;
    clearWatchdog();
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result[0]?.transcript?.trim() || "";
      if (!text) continue;
      if (result.isFinal) {
        delivered = true;
        cb.onFinal(text);
        return;
      }
      interim += text;
    }
    if (interim) cb.onInterim?.(interim);
  };

  rec.onerror = (event: SpeechRecognitionErrorEvent) => {
    clearWatchdog();
    cb.onError?.(event.error || "unknown");
  };

  rec.onend = () => {
    clearWatchdog();
    if (!delivered) cb.onEnd?.();
  };

  try {
    rec.start();
  } catch {
    clearWatchdog();
    cb.onError?.("start-failed");
    return null;
  }
  return rec;
}

export function stopListening(rec: SpeechRecognition | null) {
  try {
    rec?.abort();
  } catch {
    /* already stopped */
  }
}
