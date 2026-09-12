"use client";

import type { RefObject } from "react";
import AxonOrb, { type OrbMood } from "./AxonOrb";
import VoiceControl from "./VoiceControl";

type Props = {
  prompt: string;
  hint?: string;
  mood: OrbMood;
  query: string;
  listening: boolean;
  voiceAvailable: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onSubmit: (text: string) => void;
  onToggleListen: () => void;
  disabled?: boolean;
  /** A live voice line is open to the model. */
  live?: boolean;
  /** Which voice is actually answering, so nobody has to guess. */
  engine?: "off" | "realtime" | "browser";
};

export default function AxonInteractionStrip({
  prompt,
  hint,
  mood,
  query,
  listening,
  voiceAvailable,
  inputRef,
  onQueryChange,
  onSubmit,
  onToggleListen,
  disabled,
  live,
  engine
}: Props) {
  return (
    <div
      className="axon-strip"
      data-busy={disabled ? "true" : "false"}
      data-mood={mood}
      data-live={live ? "true" : "false"}
    >
      <div className="axon-strip-orb">
        <AxonOrb size={30} mood={mood} />
      </div>

      {/* Which voice is talking, always on screen. Hearing the flat browser
          voice and having to guess whether the live model ever connected is
          how this demo gets mistaken for a broken one. */}
      {engine && engine !== "off" ? (
        <span className={`axon-engine is-${engine}`}>
          {engine === "realtime" ? "Axon" : "Browser voice"}
        </span>
      ) : null}

      <div className="axon-strip-copy">
        <p className="axon-strip-prompt">{prompt}</p>
        {hint ? (
          <p className={`axon-strip-hint${/^Browser voice/.test(hint) ? " is-engine" : ""}`}>{hint}</p>
        ) : null}
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
        <div className={`axon-strip-field${listening ? " is-listening" : ""}`}>
          <input
            ref={inputRef}
            className="axon-strip-input"
            value={query}
            disabled={disabled}
            placeholder={listening ? "Listening…" : "What can I find for you?"}
            onChange={(e) => onQueryChange(e.target.value)}
          />
          <VoiceControl
            available={voiceAvailable}
            listening={listening}
            disabled={disabled}
            onToggle={onToggleListen}
          />
        </div>
        <button className="axon-strip-send" type="submit" disabled={disabled} aria-label="Send">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h12M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </form>
    </div>
  );
}
