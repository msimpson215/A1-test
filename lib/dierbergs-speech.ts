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

// Chrome's default pick is usually the flat eSpeak-style voice. These are the
// natural-sounding voices shipped with Chrome, macOS and Windows, best first.
const PREFERRED_VOICES = [
  "Google US English",
  "Microsoft Aria Online (Natural) - English (United States)",
  "Microsoft Jenny Online (Natural) - English (United States)",
  "Microsoft Michelle Online (Natural) - English (United States)",
  "Samantha",
  "Ava (Premium)",
  "Ava",
  "Allison",
  "Susan",
  "Microsoft Zira - English (United States)"
];

let cachedVoice: SpeechSynthesisVoice | null = null;

function scoreVoice(v: SpeechSynthesisVoice): number {
  const index = PREFERRED_VOICES.indexOf(v.name);
  if (index !== -1) return 1000 - index;
  if (!v.lang.toLowerCase().startsWith("en")) return -1000;
  let score = 0;
  // Network-backed voices are the neural ones; local voices are the robotic ones.
  if (!v.localService) score += 60;
  if (/natural|neural|premium|enhanced/i.test(v.name)) score += 40;
  if (/google/i.test(v.name)) score += 30;
  if (/en[-_]us/i.test(v.lang)) score += 20;
  if (/espeak|compact|robot/i.test(v.name)) score -= 200;
  return score;
}

export function bestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const ranked = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a));
  cachedVoice = ranked[0] ?? null;
  return cachedVoice;
}

// getVoices() is empty until Chrome loads the list asynchronously.
export function primeVoices(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  bestVoice();
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    bestVoice();
  };
}

export function cancelSpeech(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

// Never rejects and never hangs: a failed voice must not stall the conversation.
export function speak(text: string): Promise<void> {
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
    utter.rate = 0.98;
    utter.pitch = 1.02;
    utter.volume = 1;

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(guard);
      resolve();
    };

    // Chrome drops onend when an utterance is cancelled mid-flight, which would
    // otherwise leave the conversation loop waiting forever.
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

  rec.onresult = (event: SpeechRecognitionEvent) => {
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
    cb.onError?.(event.error || "unknown");
  };

  rec.onend = () => {
    if (!delivered) cb.onEnd?.();
  };

  try {
    rec.start();
  } catch {
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
