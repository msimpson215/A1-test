"use client";

import { useEffect, useState } from "react";
import { voiceReport } from "@/lib/dierbergs-speech";

type Props = {
  build: string;
  state: string;
  lastHeard: string;
  lastError: string;
};

// A readout rather than a feature: this demo is driven on machines we cannot
// attach a debugger to, and one screenshot of this line says which build is
// loaded, which browser, and what the voice actually did.
export default function DemoDiagnostics({ build, state, lastHeard, lastError }: Props) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<ReturnType<typeof voiceReport> | null>(null);

  useEffect(() => {
    const tick = () => setReport(voiceReport());
    tick();
    const id = window.setInterval(tick, 1500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="demo-diag">
      <button type="button" className="demo-diag-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "hide status" : "status"}
      </button>
      {open && report ? (
        <dl className="demo-diag-body">
          <div><dt>build</dt><dd>{build}</dd></div>
          <div><dt>browser</dt><dd>{report.browser}</dd></div>
          <div><dt>voice in</dt><dd>{report.recognition ? "available" : "not supported"}</dd></div>
          <div><dt>voice out</dt><dd>{report.voice} ({report.voiceCount} installed)</dd></div>
          <div><dt>state</dt><dd>{state}</dd></div>
          <div><dt>last heard</dt><dd>{lastHeard || "—"}</dd></div>
          <div><dt>last error</dt><dd>{lastError || "—"}</dd></div>
        </dl>
      ) : null}
    </div>
  );
}
