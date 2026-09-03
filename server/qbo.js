const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN_FILE = process.env.QBO_TOKEN_FILE || path.join(__dirname, 'data', 'qbo-tokens.json');
const pendingStates = new Map();

function redirectUri() {
  return (process.env.INTUIT_REDIRECT_URI || 'https://a1-test-fyjq.onrender.com/api/qbo/callback').replace(/\/$/, '');
}

function clientId() {
  return String(process.env.INTUIT_CLIENT_ID || '').trim();
}

function clientSecret() {
  return String(process.env.INTUIT_CLIENT_SECRET || '').trim();
}

function keysReady() {
  const id = clientId();
  const secret = clientSecret();
  if (!id || !secret) return false;
  if (/^pending$/i.test(id) || /^pending$/i.test(secret)) return false;
  return true;
}

function useSandbox() {
  return process.env.INTUIT_PRODUCTION !== '1';
}

function apiHost() {
  return useSandbox()
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

function basicAuth() {
  return Buffer.from(clientId() + ':' + clientSecret()).toString('base64');
}

function readTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeTokens(data) {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
}

function isConnected() {
  const t = readTokens();
  return Boolean(t && t.refresh_token && t.realmId);
}

function authorizeUrl() {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now() + 15 * 60 * 1000);
  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: redirectUri(),
    state
  });
  return 'https://appcenter.intuit.com/connect/oauth2?' + params.toString();
}

function htmlPage(title, body) {
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:system-ui;background:#071a4e;color:#eaf4ff;padding:1.5rem;line-height:1.45">
<h1 style="font-size:1.3rem">${title}</h1>
<p>${body}</p>
<p><a href="/joe-desk" style="color:#93c5fd">Back to Joe’s desk</a></p>
</body>`;
}

async function exchangeCode(code, state) {
  const exp = pendingStates.get(state);
  pendingStates.delete(state);
  if (!exp || Date.now() > exp) {
    throw new Error('That Allow tap expired. Open the Connect link again.');
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri()
  });
  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + basicAuth(),
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Intuit did not finish Allow.');
  }
  return data;
}

async function refresh(tokens) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token
  });
  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + basicAuth(),
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Could not refresh QuickBooks.');
  }
  const next = {
    ...tokens,
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    savedAt: new Date().toISOString()
  };
  writeTokens(next);
  return next;
}

async function qboGet(tokens, pathname) {
  let t = tokens;
  const url = apiHost() + pathname;
  const headers = () => ({
    Authorization: 'Bearer ' + t.access_token,
    Accept: 'application/json'
  });
  let response = await fetch(url, { headers: headers() });
  if (response.status === 401) {
    t = await refresh(t);
    response = await fetch(url, { headers: headers() });
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error((data.Fault && data.Fault.Error && data.Fault.Error[0] && data.Fault.Error[0].Message) || 'QuickBooks request failed.');
  }
  return data;
}

function moneyNum(v) {
  const n = parseFloat(String(v || '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function walkPnl(node, section, into) {
  if (!node) return;
  const rows = node.Row ? (Array.isArray(node.Row) ? node.Row : [node.Row]) : [];
  for (const row of rows) {
    let next = section;
    const headerName = row.Header && row.Header.ColData && row.Header.ColData[0] && row.Header.ColData[0].value;
    const group = String(row.group || headerName || '');
    if (/^income$/i.test(group) || /total income/i.test(group)) next = 'income';
    if (/expense/i.test(group) || /cogs|cost of/i.test(group)) next = 'expenses';
    if (row.type === 'Data' && Array.isArray(row.ColData) && row.ColData.length >= 2) {
      const name = row.ColData[0] && row.ColData[0].value;
      const amount = moneyNum(row.ColData[row.ColData.length - 1] && row.ColData[row.ColData.length - 1].value);
      if (name && next && !/^total /i.test(name)) into[next].push({ name, amount });
    }
    if (row.Rows) walkPnl(row.Rows, next, into);
  }
}

function parsePnl(json, label) {
  const into = { income: [], expenses: [] };
  walkPnl(json.Rows || {}, '', into);
  const totals = {
    income: into.income.reduce((s, r) => s + r.amount, 0),
    expenses: into.expenses.reduce((s, r) => s + r.amount, 0)
  };
  totals.netIncome = totals.income - totals.expenses;
  return {
    source: 'qbo',
    live: true,
    demo: false,
    report: 'ProfitAndLoss',
    period: { label: label || (json.Header && json.Header.Time) || 'This year' },
    income: into.income,
    expenses: into.expenses,
    totals
  };
}

async function companyName(tokens) {
  try {
    const data = await qboGet(tokens, `/v3/company/${tokens.realmId}/companyinfo/${tokens.realmId}`);
    return (data.CompanyInfo && data.CompanyInfo.CompanyName) || 'QuickBooks company';
  } catch (e) {
    return 'QuickBooks company';
  }
}

async function saveFromCallback(query) {
  const code = String(query.code || '');
  const state = String(query.state || '');
  const realmId = String(query.realmId || query.realmID || '');
  if (!code || !state || !realmId) {
    throw new Error('Intuit did not send the Allow details. Open the Connect link again.');
  }
  const tokens = await exchangeCode(code, state);
  const saved = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    realmId,
    savedAt: new Date().toISOString()
  };
  writeTokens(saved);
  saved.company = await companyName(saved);
  writeTokens(saved);
  return saved;
}

async function profitAndLoss(label) {
  let tokens = readTokens();
  if (!tokens) throw new Error('Joe has not tapped Allow yet.');
  const year = new Date().getFullYear();
  const start = `${year}-01-01`;
  const end = new Date().toISOString().slice(0, 10);
  const qs = new URLSearchParams({ start_date: start, end_date: end, accounting_method: 'Accrual' });
  const data = await qboGet(tokens, `/v3/company/${tokens.realmId}/reports/ProfitAndLoss?${qs.toString()}`);
  const report = parsePnl(data, label || `Jan 1 – ${end}`);
  report.company = tokens.company || await companyName(readTokens() || tokens);
  return report;
}

function status() {
  const connected = isConnected();
  const tokens = readTokens() || {};
  return {
    qboKeys: keysReady(),
    qboConnected: connected,
    qboCompany: connected ? (tokens.company || 'QuickBooks') : null,
    qboSandbox: useSandbox()
  };
}

module.exports = {
  keysReady,
  isConnected,
  authorizeUrl,
  htmlPage,
  saveFromCallback,
  profitAndLoss,
  status,
  redirectUri
};
