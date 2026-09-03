const express = require('express');
const path = require('path');
require('dotenv').config();
const demoBooks = require('./demo-books');
const payrollDemo = require('./payroll-demo');
const joeKnowledge = require('./joe-knowledge');
const lookup = require('./lookup');

const app = express();
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'microphone=(self)');
  next();
});

// Session behavior only. The opening line is spoken once from the page.
const SESSION_INSTRUCTIONS = `You help with A1 Professional Asphalt and Sealing in the St. Louis area.
Answer in 1-3 sentences after the user speaks. Say Sealing, never Ceiling.
No prices — say: "For pricing, call (618) 929-3301."
Off-topic: "I can only help with A1 asphalt and sealing services."`;

const JOE_DESK_INSTRUCTIONS = `You are Joe's butler, partner, and full assistant, powered by Axon AI. Ask Jeeves energy. Anything he wants: business, reviews, maps, food, weather, news, music, jokes, the symphony, how long to get ready, Chinese near his zip, accounting firms in Metro East, or he just needs to talk. He can cry or whine. Stay with him.
Home base: Lebanon, Illinois 62254, Metro East / St. Louis. Joe Schanz owns A1 Professional Asphalt & Sealing LLC. Listing: Lebanon, IL 62254. Site a1asphaltpro.com. Phones (618) 929-3301, (314) 949-5660, (314) 356-1142. Founded 2014. Sealcoating, crack filling, striping, paving, concrete, bollards. Say Sealing, never Ceiling. Never say you do not have the A1 listing. Never tell him to look elsewhere for his own company.
Use lookup for live facts: reviews, ratings, hours, maps, closest places, restaurants, firms, news, weather, who is playing, current listings. Default zip 62254 unless he gives another. Then recommend: here is what people say, and this one looks even better if that is true. Never say you cannot give reviews. Never say you have no maps. Never say look it up yourself.
The desk already speaks one opening greeting. Never greet again. Never say Good morning, Good afternoon, Good evening, or Hey Joe after that opening.
Never start over unless he says new chat, start over, hang up, or goodbye.
Keep normal answers to a few sentences. Songs, stories, and a hard day can run longer. He can talk over you. Stop and listen.
If he says go to QuickBooks, show the books, profit and loss, payroll, roster, or a chart, say only that it is on the left. Do not read the report. Do not invent live QuickBooks numbers. Sample company only until live books are connected.
If he says close it, get rid of it, hide it, put it away, go full screen, or go back to full screen, say it is gone. Never say you cannot close it. Never tell him to tap X.
If he says new chat or start over, say "Starting a new chat" and stop.
Do not mention ChatGPT, tools, or lookup by name.`;

const LOOKUP_TOOL = {
  type: 'function',
  name: 'lookup',
  description: 'Look up live facts for Joe: business listings, maps, reviews, ratings, hours, restaurants, Chinese food near a zip, accounting firms, Domino’s, news, weather, symphony times, anything on the web. Also use this for A1 Professional Asphalt in Lebanon Illinois. Always use this instead of saying you cannot help.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to look up, including place names, city, and zip if he gave one' }
    },
    required: ['query']
  }
};

function realtimeSessionConfig(desk) {
  const session = {
    type: 'realtime',
    model: 'gpt-realtime-1.5',
    output_modalities: ['audio'],
    instructions: desk ? JOE_DESK_INSTRUCTIONS : SESSION_INSTRUCTIONS,
    audio: {
      input: desk
        ? { transcription: { model: 'gpt-4o-mini-transcribe' } }
        : {
            transcription: { model: 'gpt-4o-mini-transcribe' },
            turn_detection: {
              type: 'server_vad',
              silence_duration_ms: 2000,
              prefix_padding_ms: 300,
              create_response: true,
              interrupt_response: false
            }
          },
      output: {
        voice: 'coral'
      }
    }
  };
  if (desk) {
    session.tools = [LOOKUP_TOOL];
    session.tool_choice = 'auto';
  }
  return JSON.stringify(session);
}

const VOXTALK3_BACKEND = (process.env.VOXTALK3_BACKEND || 'https://a1-asphalt-voxtalk-3.onrender.com').replace(/\/$/, '');

async function proxyVoxtalk3Session(sdp, res) {
  const response = await fetch(`${VOXTALK3_BACKEND}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: sdp
  });

  const body = await response.text();
  if (!response.ok) {
    console.error('VoxTalk3 proxy error:', response.status, body);
    return res.status(response.status).type('application/json').send(body);
  }

  res.type('application/sdp').send(body);
}

async function createRealtimeSession(sdp, res, desk) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return proxyVoxtalk3Session(sdp, res);
  }

  const fd = new FormData();
  fd.set('sdp', sdp);
  fd.set('session', realtimeSessionConfig(desk));

  const response = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: fd
  });

  const body = await response.text();
  if (!response.ok) {
    console.error('Realtime call error:', response.status, body);
    return res.status(response.status).type('application/json').send(body);
  }

  res.type('application/sdp').send(body);
}

app.post('/session', express.text({ type: ['application/sdp', 'text/plain'] }), async (req, res) => {
  try {
    await createRealtimeSession(req.body, res, req.query.desk === '1');
  } catch (error) {
    console.error('Session error:', error);
    res.status(500).json({ error: 'API Failure' });
  }
});

app.post('/voxtalk3/session', express.text({ type: ['application/sdp', 'text/plain'] }), async (req, res) => {
  try {
    await createRealtimeSession(req.body, res, false);
  } catch (error) {
    console.error('VoxTalk3 session error:', error);
    res.status(500).json({ error: 'API Failure' });
  }
});

const voxtalk3Page = path.join(publicDir, 'voxtalk3', 'index.html');
const voicePage = path.join(publicDir, 'voice', 'index.html');

function sendOrbPage(res, file) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(file);
}

app.get(['/voxtalk3', '/voxtalk3/'], (req, res) => {
  sendOrbPage(res, voxtalk3Page);
});

app.get(['/voice', '/voice/'], (req, res) => {
  sendOrbPage(res, voicePage);
});

app.get('/', (req, res) => {
  if (process.env.VOXTALK3_ROOT === '1') {
    return sendOrbPage(res, voxtalk3Page);
  }
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get(['/joe-desk', '/joe/books'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(publicDir, 'joe-desk.html'));
});

app.get('/api/brain/status', (req, res) => {
  res.json({
    ok: true,
    ...demoBooks.status(),
    ...payrollDemo.status(),
    openai: Boolean(process.env.OPENAI_API_KEY),
    memory: { count: 0, latestAt: null },
    knowledge: { a1: true, home: 'Lebanon, IL 62254' },
    lookup: true,
    docs: [],
    demoKeys: {
      quickbooks: demoBooks.SHOW_KEY,
      payroll: payrollDemo.SHOW_KEY
    }
  });
});

app.post('/api/brain/chat', async (req, res) => {
  const question = String(req.body?.question || req.body?.q || '').trim();
  if (!question) {
    return res.status(400).json({ ok: false, answer: 'Type a question first.' });
  }
  try {
    const pay = payrollDemo.ask(question);
    if (pay) return res.json(pay);
    const books = await demoBooks.ask(question);
    if (books && books.intent && books.intent !== 'chat') return res.json(books);
    const found = await lookup.ask(question);
    return res.json({
      ok: true,
      intent: 'chat',
      answer: found.text,
      lookup: found.ok
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      answer: 'The demo desk hit a snag. Try again.',
      error: error.message
    });
  }
});

app.post('/api/brain/teach', (req, res) => {
  res.json({ ok: false, error: 'Teaching docs live on the Axon host. This desk is the show copy.' });
});

app.post('/api/brain/memory/remember', (req, res) => {
  res.json({ ok: true, stored: false, note: 'Memory banks live on the Axon host. This desk is the show copy.' });
});

app.post('/api/brain/lookup', async (req, res) => {
  const query = String(req.body?.query || req.body?.q || '').trim();
  const zip = String(req.body?.zip || '').trim();
  if (!query) {
    return res.status(400).json({ ok: false, text: 'No query.' });
  }
  try {
    const found = await lookup.ask(query, zip);
    res.json(found);
  } catch (error) {
    res.json({
      ok: false,
      text: joeKnowledge.PACK + ' Lookup hit a snag. Help him anyway. Never tell him to look it up himself.'
    });
  }
});

// Never let phones/proxies reuse a stale HTML page or voice assets.
// HTML always fresh -> it references ?v= asset URLs -> old JS/CSS can't linger.
app.use((req, res, next) => {
  if (/\.html?$/i.test(req.path) ||
      /vox-bridge\.js|vox-overlay\.css/.test(req.path) ||
      /\/voice\/?$/.test(req.path)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.static(publicDir, {
  setHeaders: function (res, filePath) {
    if (/\.html?$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  const voiceMode = process.env.OPENAI_API_KEY ? 'direct-openai' : `proxy:${VOXTALK3_BACKEND}`;
  console.log(`A1 site + voice running on port ${PORT} (${voiceMode})`);
});
