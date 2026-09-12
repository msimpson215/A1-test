"use client";

import { useEffect, useState } from "react";
import { speak, voiceReport } from "@/lib/dierbergs-speech";
import {
  NEURAL_VOICES,
  getNeuralVoice,
  getVoiceKey,
  neuralLastError,
  neuralUsage,
  setNeuralVoice,
  setVoiceKey,
  type NeuralVoice
} from "@/lib/dierbergs-neural-voice";

type Props = {
  build: string;
  state: string;
  lastHeard: string;
  lastError: string;
  engine?: string;
};

// A readout rather than a feature: this demo is driven on machines we cannot
// attach a debugger to, and one screenshot of this panel says which build is
// loaded, which browser, and what the voice actually did.
export default function DemoDiagnostics({ build, state, lastHeard, lastError, engine }: Props) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<ReturnType<typeof voiceReport> | null>(null);
  const [key, setKey] = useState("");
  const [voice, setVoice] = useState<NeuralVoice>(NEURAL_VOICES[0]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setKey(getVoiceKey());
    setVoice(getNeuralVoice());
  }, []);

  useEffect(() => {
    const tick = () => setReport(voiceReport());
    tick();
    const id = window.setInterval(tick, 1500);
    return () => window.clearInterval(id);
  }, []);

  function save() {
    setVoiceKey(key);
    setNeuralVoice(voice);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
    void speak("Hello. I'm your Dierbergs personal shopper, and this is how I sound.");
  }

  return (
    <div className="demo-diag">
      <button type="button" className="demo-diag-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "hide status" : "status"}
      </button>
      {open && report ? (
        <div className="demo-diag-body">
          <dl className="demo-diag-list">
            <div><dt>build</dt><dd>{build}</dd></div>
            <div>
              <dt>voice line</dt>
              <dd>
                {engine === "realtime"
                  ? "Realtime GPT — live audio"
                  : engine === "browser"
                    ? "browser voice (Realtime GPT is not connected)"
                    : "off"}
              </dd>
            </div>
            <div><dt>browser</dt><dd>{report.browser}</dd></div>
            <div><dt>voice in</dt><dd>{report.recognition ? "available" : "not supported"}</dd></div>
            <div>
              <dt>voice out</dt>
              <dd>
                {report.neuralSource
                  ? `OpenAI ${getNeuralVoice()} — via ${report.neuralSource}`
                  : `${report.voice} — browser (${report.voiceCount} installed)`}
              </dd>
            </div>
            {report.neuralSource ? (
              <div><dt>spoken</dt><dd>{neuralUsage().toLocaleString()} chars this session</dd></div>
            ) : (
              <div><dt>also had</dt><dd>{report.runnersUp.join(", ") || "nothing else"}</dd></div>
            )}
            <div><dt>state</dt><dd>{state}</dd></div>
            <div><dt>last heard</dt><dd>{lastHeard || "—"}</dd></div>
            <div><dt>last error</dt><dd>{lastError || neuralLastError() || "—"}</dd></div>
          </dl>

          <div className="demo-diag-voice">
            <label htmlFor="tts-key">Optional: your own OpenAI key</label>
            <input
              id="tts-key"
              type="password"
              value={key}
              placeholder="sk-..."
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setKey(e.target.value)}
            />
            <div className="demo-diag-voice-row">
              <select value={voice} onChange={(e) => setVoice(e.target.value as NeuralVoice)}>
                {NEURAL_VOICES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <button type="button" onClick={save}>{saved ? "Saved" : "Save & test"}</button>
            </div>
            <p className="demo-diag-note">
              Only needed where no speech server is reachable. Stays in this browser,
              never committed. Leave empty and the server&rsquo;s own key is used.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
