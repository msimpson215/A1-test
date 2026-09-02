/**
 * Demo payroll company — show-only books, not a live Gusto/ADP feed.
 *
 * Purpose: walk a prospect through “this could be you” without touching
 * anyone’s real payroll. Nothing here is Joe’s live company.
 *
 * A show key (axon-demo-payroll) lights up the UI. Real payroll APIs
 * (Gusto, ADP) are OAuth later — never a password pasted into Cursor.
 */

const SHOW_KEY = 'axon-demo-payroll'

const CREWS = [
  { name: 'Paving crew', people: 11, lastGross: 18420 },
  { name: 'Sealcoat / striping', people: 6, lastGross: 9720 },
  { name: 'Office & estimators', people: 5, lastGross: 14040 }
]

const EMPLOYEES = [
  { name: 'Marcus Hale', role: 'Foreman — paving', crew: 'Paving crew', ytd: 68400 },
  { name: 'Elena Ruiz', role: 'Operator', crew: 'Paving crew', ytd: 51220 },
  { name: 'Dave Pittman', role: 'Laborer', crew: 'Paving crew', ytd: 41880 },
  { name: 'Keisha Ward', role: 'Sealcoat lead', crew: 'Sealcoat / striping', ytd: 54810 },
  { name: 'Tom Nguyen', role: 'Striping tech', crew: 'Sealcoat / striping', ytd: 44120 },
  { name: 'Andrea Cole', role: 'Office manager', crew: 'Office & estimators', ytd: 61200 },
  { name: 'Sam Ortiz', role: 'Estimator', crew: 'Office & estimators', ytd: 58940 }
]

function money(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(n || 0)
}

function status() {
  return {
    payrollMode: 'demo',
    payrollCompany: 'Midwest Payroll Partners (DEMO)',
    payrollConnected: false,
    payrollHint:
      'Demo payroll — not Gusto, not ADP, not Joe’s live run. Show key axon-demo-payroll. Real payroll later is OAuth, same idea as QuickBooks.',
    showKey: SHOW_KEY
  }
}

function snapshot() {
  const lastGross = CREWS.reduce((t, c) => t + c.lastGross, 0)
  const headcount = CREWS.reduce((t, c) => t + c.people, 0)
  return {
    source: 'demo',
    demo: true,
    stamp: 'DEMO PAYROLL — not live. This is a sample company so you can see the product without touching anyone’s books.',
    company: 'Midwest Payroll Partners (DEMO)',
    paySchedule: 'Weekly — Fridays',
    lastRun: {
      date: '2026-08-29',
      label: 'Friday, Aug 29, 2026',
      gross: lastGross,
      net: Math.round(lastGross * 0.72),
      taxes: Math.round(lastGross * 0.21),
      headcount
    },
    nextRun: { date: '2026-09-05', label: 'Friday, Sep 5, 2026' },
    ytdGross: 1184200,
    crews: CREWS,
    sampleRoster: EMPLOYEES
  }
}

function detectIntent(question) {
  const q = String(question || '').trim()
  if (!q) return { type: 'empty' }
  const payrollCo =
    /payroll company|gusto|adp|paychex|who.?s on (the )?payroll|roster|last (payroll )?run|next payroll|paycheck|by crew|headcount/i.test(q)
  const payroll = /payroll|wages|salary|salaries|labor cost/i.test(q)
  if (payrollCo || (payroll && /who|roster|run|crew|employee|staff/i.test(q))) {
    return { type: 'payroll_company' }
  }
  return { type: 'other' }
}

function ask(question) {
  const snap = snapshot()
  const intent = detectIntent(question)
  if (intent.type !== 'payroll_company') {
    return null
  }
  const last = snap.lastRun
  const answer = [
    snap.stamp,
    `${snap.company}. Last run ${last.label}: gross ${money(last.gross)}, net ${money(last.net)}, ${last.headcount} people paid.`,
    `Next run ${snap.nextRun.label}. YTD gross ${money(snap.ytdGross)}.`,
    `Biggest crew last week: ${snap.crews[0].name} (${snap.crews[0].people} people, ${money(snap.crews[0].lastGross)}).`
  ].join(' ')

  return {
    ok: true,
    mode: 'demo',
    intent: 'payroll_company',
    demo: true,
    warning: snap.stamp,
    answer,
    report: snap,
    chart: {
      type: 'bar',
      title: 'Last payroll by crew — DEMO',
      points: snap.crews.map(c => ({
        x: c.name.split(' ')[0],
        y: c.lastGross,
        color: '#3b82f6'
      }))
    }
  }
}

function voiceContextSnippet() {
  const s = snapshot()
  return `
PAYROLL COMPANY MODE: DEMO ONLY — ${s.company}
${s.stamp}
Last run ${s.lastRun.label}: gross ${money(s.lastRun.gross)}, net ${money(s.lastRun.net)}, ${s.lastRun.headcount} people.
Next run ${s.nextRun.label}. YTD ${money(s.ytdGross)}.
Crews: ${s.crews.map(c => `${c.name} ${c.people} people ${money(c.lastGross)} last run`).join('; ')}.
If asked for live Gusto/ADP, say this is a demo so nobody’s real payroll is on the line. Connect later via that company’s OAuth — not a password.
`.trim()
}

module.exports = {
  SHOW_KEY,
  status,
  snapshot,
  detectIntent,
  ask,
  voiceContextSnippet
}
