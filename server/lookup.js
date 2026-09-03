const knowledge = require('./joe-knowledge');

const SEARCH_MODELS = ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-5-mini'];

function outputText(data) {
  if (!data) return '';
  if (data.output_text) return String(data.output_text).trim();
  const parts = [];
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) {
      if (c.text) parts.push(c.text);
    }
  }
  return parts.join('\n').trim();
}

async function webSearch(query, zip) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return '';
  const homeZip = String(zip || '62254').replace(/\D/g, '').slice(0, 5) || '62254';
  const input = [
    'Today is ' + new Date().toISOString().slice(0, 10) + '.',
    'Joe is in Lebanon, Illinois, zip ' + homeZip + ', Metro East / St. Louis area unless the question says otherwise.',
    'Look this up. Return short spoken-friendly notes: names, ratings, review gist, addresses, hours, distance or town, and a pick if he asked what is best or closest.',
    'Question: ' + query
  ].join(' ');

  let lastErr = '';
  for (const model of SEARCH_MODELS) {
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          tools: [{
            type: 'web_search',
            search_context_size: 'low',
            user_location: {
              type: 'approximate',
              country: 'US',
              region: 'Illinois',
              city: 'Lebanon'
            }
          }],
          tool_choice: 'auto',
          input
        })
      });
      const data = await response.json();
      if (!response.ok) {
        lastErr = model + ' ' + response.status + ' ' + JSON.stringify(data).slice(0, 300);
        continue;
      }
      const text = outputText(data);
      if (text) return text;
    } catch (err) {
      lastErr = String(err && err.message || err);
    }
  }
  if (lastErr) console.error('lookup web search failed:', lastErr);
  return '';
}

async function placesFallback(query) {
  const q = String(query || '').trim();
  if (!q) return '';
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q=' + encodeURIComponent(q);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'A1-Joe-Desk/1.0 (https://a1asphaltpro.com)',
        Accept: 'application/json'
      }
    });
    if (!response.ok) return '';
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return '';
    return rows.map(function (row, i) {
      return (i + 1) + '. ' + (row.display_name || row.name || 'place');
    }).join('\n');
  } catch (err) {
    return '';
  }
}

async function ask(query, zip) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, text: 'No query.' };
  const parts = [];
  if (knowledge.looksLikeHome(q)) parts.push(knowledge.PACK);
  const web = await webSearch(q, zip);
  if (web) parts.push(web);
  if (!parts.length) {
    const places = await placesFallback(q + (zip ? ' ' + zip : ' Lebanon Illinois 62254'));
    if (places) parts.push(places);
  }
  if (!parts.length) {
    return {
      ok: false,
      text: 'No live web result. Joe’s home zip is 62254, Lebanon, Illinois, Metro East / St. Louis. Still answer helpfully from what you know. Never refuse reviews or maps. Never tell him to look it up himself.'
    };
  }
  return { ok: true, text: parts.join('\n\n').slice(0, 4500) };
}

module.exports = { ask };
