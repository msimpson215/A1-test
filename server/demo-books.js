/**
 * Show-only QuickBooks-shaped books. Not Intuit. Not Joe’s live company.
 * Show key: axon-demo-qb
 */

const SHOW_KEY = 'axon-demo-qb'

const DEMO_PNL_MAY = {
  income: [
    { name: 'Asphalt paving', amount: 186400 },
    { name: 'Sealcoating', amount: 62400 },
    { name: 'Concrete / bollards', amount: 21800 },
    { name: 'Striping & misc', amount: 9600 }
  ],
  expenses: [
    { name: 'Payroll & labor', amount: 98400 },
    { name: 'Materials (asphalt, PMM, aggregate)', amount: 71200 },
    { name: 'Equipment fuel & maintenance', amount: 18400 },
    { name: 'Insurance & bonding', amount: 8200 },
    { name: 'Office & overhead', amount: 6400 },
    { name: 'Marketing', amount: 2100 }
  ]
}

function sum(rows) {
  return rows.reduce((t, r) => t + r.amount, 0)
}

function money(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(n || 0)
}

function status() {
  return {
    mode: 'demo',
    connected: false,
    company: 'A1 Demo Books (SAMPLE — not live)',
    env: 'demo',
    hint: 'DEMO BOOKS only. Show key axon-demo-qb. Not Joe’s live company. Intuit OAuth later — never his password.',
    showKey: SHOW_KEY
  }
}

function demoProfitAndLoss(start, end, label) {
  const month = Number(String(start).slice(5, 7)) || 5
  const factor = 0.72 + ((month % 12) / 12) * 0.55
  const scale = (rows) => rows.map(r => ({ name: r.name, amount: Math.round(r.amount * factor) }))
  const income = scale(DEMO_PNL_MAY.income)
  const expenses = scale(DEMO_PNL_MAY.expenses)
  const totalIncome = sum(income)
  const totalExpenses = sum(expenses)
  return {
    source: 'demo',
    demo: true,
    report: 'ProfitAndLoss',
    period: { start, end, label: label || `${start} → ${end}` },
    income,
    expenses,
    totals: { income: totalIncome, expenses: totalExpenses, netIncome: totalIncome - totalExpenses }
  }
}

function demoPayrollSeries(years = 5) {
  const endYear = new Date().getFullYear()
  const startYear = endYear - (years - 1)
  const points = []
  const base = 980000
  for (let y = startYear; y <= endYear; y++) {
    const age = y - startYear
    const total = Math.round(base * (1 + age * 0.055) * (1 + Math.sin(age * 1.2) * 0.03))
    points.push({ x: String(y), y: total, headcount: 18 + age * 2 })
  }
  return {
    source: 'demo',
    demo: true,
    report: 'PayrollTrend',
    period: { start: `${startYear}-01-01`, end: `${endYear}-12-31`, years },
    series: points,
    summary: {
      first: points[0].y,
      last: points[points.length - 1].y,
      changePct: Number((((points[points.length - 1].y - points[0].y) / points[0].y) * 100).toFixed(1))
    }
  }
}

function parseRelativeMay(now = new Date()) {
  const year = now.getFullYear() - 1
  return { start: `${year}-05-01`, end: `${year}-05-31`, label: `May ${year}` }
}

function parseYearSpan(question, fallback = 5) {
  const m = question.match(/past\s+(\d+)\s+years?/i) || question.match(/last\s+(\d+)\s+years?/i)
  if (m) return Math.min(10, Math.max(2, Number(m[1])))
  if (/five years|5 years/i.test(question)) return 5
  return fallback
}

function detectIntent(question) {
  const q = String(question || '').trim()
  if (!q) return { type: 'empty' }
  const wantsChart = /chart|graph|plot|xy|trend|over the|visualize|show me|pull up|bring up/i.test(q)
  const wantsPayroll = /payroll|wages|salary|salaries|labor cost/i.test(q)
  const wantsPnL = /profit\s*and\s*loss|p\s*&\s*l|\bpnl\b|income statement|net income/i.test(q)
  const openBooks = /go to quickbooks|open quickbooks|show quickbooks|quickbooks|show (my |the )?books|pull up (the )?books|go to (the )?books/i.test(q)
  const mayAgo = /year ago.*may|may.*year ago|last may|may of last year/i.test(q)
  if (wantsPayroll) return { type: 'payroll_chart', years: parseYearSpan(q, 5) }
  if (wantsPnL || mayAgo || openBooks) {
    const period = parseRelativeMay()
    const monthNames = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
    }
    const ym = q.match(/\b(20\d{2})\b/)
    let year = ym ? Number(ym[1]) : null
    let month = null
    for (const [name, num] of Object.entries(monthNames)) {
      if (new RegExp(`\\b${name}\\b`, 'i').test(q)) { month = num; break }
    }
    if (year && month) {
      const mm = String(month).padStart(2, '0')
      const lastDay = new Date(year, month, 0).getDate()
      period.start = `${year}-${mm}-01`
      period.end = `${year}-${mm}-${lastDay}`
      period.label = `${Object.keys(monthNames)[month - 1].replace(/^\w/, c => c.toUpperCase())} ${year}`
    } else if (year) {
      period.start = `${year}-01-01`
      period.end = `${year}-12-31`
      period.label = `Year ${year}`
    }
    return { type: 'pnl', period, chart: wantsChart }
  }
  return { type: 'chat', question: q }
}

function narratePnL(report) {
  const { period, totals, income, expenses } = report
  const topIncome = [...income].sort((a, b) => b.amount - a.amount)[0]
  const topExpense = [...expenses].sort((a, b) => b.amount - a.amount)[0]
  return [
    `DEMO BOOKS — not live QuickBooks. Profit & Loss for ${period.label}:`,
    `Income ${money(totals.income)}, expenses ${money(totals.expenses)}, net ${money(totals.netIncome)}.`,
    topIncome ? `Biggest income line: ${topIncome.name} at ${money(topIncome.amount)}.` : '',
    topExpense ? `Biggest expense: ${topExpense.name} at ${money(topExpense.amount)}.` : ''
  ].filter(Boolean).join(' ')
}

function narratePayroll(report) {
  const { series, summary, period } = report
  const first = series[0]
  const last = series[series.length - 1]
  return `DEMO BOOKS — not live QuickBooks. Payroll over ${period.years} years (${first?.x}–${last?.x}): ${money(summary.first)} → ${money(summary.last)} (${summary.changePct >= 0 ? '+' : ''}${summary.changePct}%).`
}

async function ask(question) {
  const intent = detectIntent(question)
  const qbo = require('./qbo')
  if (qbo.isConnected() && (intent.type === 'pnl' || intent.type === 'payroll_chart')) {
    const report = await qbo.profitAndLoss(intent.period && intent.period.label)
    return {
      ok: true,
      live: true,
      demo: false,
      intent: 'pnl',
      answer: 'It is on the left.',
      report
    }
  }
  const st = status()
  if (intent.type === 'empty') {
    return { ok: false, mode: st.mode, answer: 'Try: “P&L for May last year,” or “Chart payroll over five years.”' }
  }
  if (intent.type === 'pnl') {
    const report = demoProfitAndLoss(intent.period.start, intent.period.end, intent.period.label)
    return {
      ok: true,
      mode: 'demo',
      demo: true,
      intent: 'pnl',
      warning: 'DEMO BOOKS — not live QuickBooks.',
      answer: narratePnL(report),
      report,
      chart: {
        type: 'waterfall',
        title: `P&L — ${report.period.label} (DEMO)`,
        points: [
          { x: 'Income', y: report.totals.income, color: '#3b82f6' },
          { x: 'Expenses', y: -report.totals.expenses, color: '#E85D04' },
          { x: 'Net', y: report.totals.netIncome, color: report.totals.netIncome >= 0 ? '#22c55e' : '#ef4444' }
        ]
      }
    }
  }
  if (intent.type === 'payroll_chart') {
    const report = demoPayrollSeries(intent.years)
    return {
      ok: true,
      mode: 'demo',
      demo: true,
      intent: 'payroll_chart',
      warning: 'DEMO BOOKS — not live QuickBooks.',
      answer: narratePayroll(report),
      report,
      chart: {
        type: 'line',
        title: `Payroll — past ${report.period.years} years (DEMO)`,
        series: [{ name: 'Payroll', color: '#3b82f6', points: report.series }]
      }
    }
  }
  return {
    ok: true,
    mode: 'demo',
    intent: 'chat',
    answer: 'This desk is on DEMO books. Ask for a May P&L, a five-year payroll chart, or who is on the demo payroll roster. Live QuickBooks later is a one-time Intuit connect — not a password.'
  }
}

module.exports = { SHOW_KEY, status, detectIntent, ask }
