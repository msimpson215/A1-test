"use client";

import { useRef } from "react";
import VoiceControl from "./VoiceControl";

type Props = {
  prompt: string;
  hint?: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
  disabled?: boolean;
};

export default function AxonInteractionStrip({
  prompt,
  hint,
  query,
  onQueryChange,
  onSubmit,
  onListeningChange,
  disabled
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="axon-strip">
      <div className="axon-strip-copy">
        <p className="axon-strip-prompt">{prompt}</p>
        {hint ? <p className="axon-strip-hint">{hint}</p> : null}
      </div>
      <form
        className="axon-strip-form"
        onSubmit={(e) => {
          e.preventDefault();
          const text = query.trim();
          if (!text) return;
          onSubmit(text);
        }}
      >
        <div className="axon-strip-field">
          <input
            ref={inputRef}
            className="axon-strip-input"
            value={query}
            disabled={disabled}
            placeholder="What can I find for you?"
            onChange={(e) => onQueryChange(e.target.value)}
          />
          <VoiceControl
            disabled={disabled}
            onTranscript={(text) => {
              onQueryChange(text);
              onSubmit(text);
            }}
            onListeningChange={onListeningChange}
          />
        </div>
        <button className="axon-strip-send" type="submit" disabled={disabled} aria-label="Send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h12M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </form>
    </div>
  );
}
