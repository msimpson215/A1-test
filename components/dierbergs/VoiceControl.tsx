"use client";

type Props = {
  available: boolean;
  listening: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

export default function VoiceControl({ available, listening, disabled, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`axon-mic${listening ? " is-listening" : ""}`}
      onClick={onToggle}
      disabled={disabled || !available}
      title={
        available
          ? listening
            ? "Stop talking to your shopper"
            : "Talk to your shopper"
          : "Voice needs desktop Chrome"
      }
      aria-label={listening ? "Stop listening" : "Speak"}
      aria-pressed={listening}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M6 11a6 6 0 0012 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 17v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
