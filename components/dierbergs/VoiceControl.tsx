"use client";

import { useRef } from "react";
import { speechRecognitionAvailable, startListening, stopListening } from "@/lib/dierbergs-speech";

type Props = {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
};

export default function VoiceControl({ disabled, onTranscript, onListeningChange }: Props) {
  const recRef = useRef<SpeechRecognition | null>(null);
  const available = speechRecognitionAvailable();

  function toggle() {
    if (disabled || !available) return;
    if (recRef.current) {
      stopListening(recRef.current);
      recRef.current = null;
      onListeningChange(false);
      return;
    }
    onListeningChange(true);
    recRef.current = startListening(
      (text) => {
        recRef.current = null;
        onListeningChange(false);
        onTranscript(text);
      },
      () => {
        recRef.current = null;
        onListeningChange(false);
      }
    );
  }

  return (
    <button
      type="button"
      className="axon-mic"
      onClick={toggle}
      disabled={disabled || !available}
      title={available ? "Speak your grocery request" : "Voice is available in Chrome"}
      aria-label="Speak"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M6 11a6 6 0 0012 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 17v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
