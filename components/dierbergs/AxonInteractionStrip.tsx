"use client";

import { useRef } from "react";
import VoiceControl from "./VoiceControl";

type Props = {
  prompt: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: (text: string) => void;
  onListeningChange: (listening: boolean) => void;
  disabled?: boolean;
};

export default function AxonInteractionStrip({
  prompt,
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
        <button className="axon-strip-send" type="submit" disabled={disabled}>
          Find
        </button>
      </form>
    </div>
  );
}
