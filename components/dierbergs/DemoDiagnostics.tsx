"use client";

import { useEffect, useState } from "react";
import { packshotSource } from "@/lib/dierbergs-packshot";
import { speak, voiceReport } from "@/lib/dierbergs-speech";
import { money, spendReport } from "@/lib/dierbergs-spend";
import { budgetNow } from "@/lib/dierbergs-budget";
import { liftFrom } from "@/lib/dierbergs-lift";
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
  /** What is in the cart, which is what buys the spoken minutes. */
  cartCents?: number;
  /** What went in because Axon offered it, rather than being asked for. */
  suggested?: { items: number; cents: number };
};

// A readout rather than a feature: this demo is driven on machines we cannot
// attach a debugger to, and one screenshot of this panel says which build is
// loaded, which browser, and what the voice actually did.
export default function DemoDiagnostics({
  build,
  state,
  lastHeard,
  lastError,
  engine,
  cartCents = 0,
  suggested = { items: 0, cents: 0 }
}: Props) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<ReturnType<typeof voiceReport> | null>(null);
  const [spend, setSpend] = useState(spendReport());
  const [budget, setBudget] = useState(budgetNow(0));
  const lift = liftFrom(suggested.cents, suggested.items, spend.dollars);
  const [key, setKey] = useState("");
  const [voice, setVoice] = useState<NeuralVoice>(NEURAL_VOICES[0]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setKey(getVoiceKey());
    setVoice(getNeuralVoice());
  }, []);

  useEffect(() => {
    const tick = () => {
      setReport(voiceReport());
      setSpend(spendReport());
      setBudget(budgetNow(cartCents));
    };
    tick();
    const id = window.setInterval(tick, 1500);
    return () => window.clearInterval(id);
  }, [cartCents]);

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
                  ? "Axon — live audio"
                  : engine === "browser"
                    ? "browser voice (Axon is not connected)"
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
            {/* Where the pictures come from, since that is the first question
                a retailer asks about a catalogue this size. */}
            <div><dt>packshots</dt><dd>{packshotSource()}</dd></div>
            {/* What the conversation cost, from the usage the API reports on
                every turn. The only question a store asks twice. */}
            {spend.turns > 0 ? (
              <>
                <div>
                  <dt>this talk</dt>
                  <dd>
                    {spend.total.toLocaleString()} tokens over {spend.turns}{" "}
                    {spend.turns === 1 ? "turn" : "turns"}
                  </dd>
                </div>
                <div>
                  <dt>of which voice</dt>
                  <dd>
                    {(spend.tokens.audioIn + spend.tokens.audioOut).toLocaleString()} audio,{" "}
                    {(spend.tokens.textIn + spend.tokens.cachedIn + spend.tokens.textOut).toLocaleString()} words
                  </dd>
                </div>
                <div>
                  <dt>cost so far</dt>
                  <dd>
                    {money(spend.dollars)} — {money(spend.dollars / spend.turns)} a turn
                  </dd>
                </div>
                {/* What the basket has earned in spoken minutes, and what is
                    left of it before the conversation moves to typing. */}
                <div>
                  <dt>voice allowance</dt>
                  <dd>
                    {money(budget.left)} left of {money(budget.allowance)}
                    {budget.verdict === "spent" ? " — spent" : budget.verdict === "warn" ? " — running low" : ""}
                  </dd>
                </div>
                {/* The other side of the ledger: what the talking put in the
                    basket that a search box would not have. */}
                <div>
                  <dt>Axon suggested</dt>
                  <dd>
                    {suggested.items > 0
                      ? `${suggested.items} ${suggested.items === 1 ? "item" : "items"}, $${(
                          suggested.cents / 100
                        ).toFixed(2)} — ${money(lift.profit)} margin against ${money(lift.spent)} spent`
                      : "nothing yet"}
                  </dd>
                </div>
              </>
            ) : null}
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
