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

export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    window.speechSynthesis.speak(utter);
  });
}

export function startListening(
  onFinal: (transcript: string) => void,
  onError?: () => void
): SpeechRecognition | null {
  const Ctor = RecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (event: SpeechRecognitionEvent) => {
    const text = event.results[0]?.[0]?.transcript?.trim() || "";
    if (text) onFinal(text);
  };
  rec.onerror = () => onError?.();
  rec.start();
  return rec;
}

export function stopListening(rec: SpeechRecognition | null) {
  try {
    rec?.stop();
  } catch {
    /* already stopped */
  }
}
