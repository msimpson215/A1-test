const express = require('express');
const path = require('path');
require('dotenv').config();
const demoBooks = require('./demo-books');
const payrollDemo = require('./payroll-demo');
const joeKnowledge = require('./joe-knowledge');
const lookup = require('./lookup');
const qbo = require('./qbo');

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
Use lookup for live facts: reviews, ratings, hours, maps, closest places, restaurants, firms, news, weather, who is playing, current listings. Default zip 62254 unless he gives another. Say a short "one sec" then look it up — do not sit silent. Then recommend: here is what people say, and this one looks even better if that is true. Never say you cannot give reviews. Never say you have no maps. Never say look it up yourself.
The desk already speaks one opening greeting. Never greet again. Never say Good morning, Good afternoon, Good evening, or Hey Joe after that opening.
Never start over unless he says new chat, start over, hang up, or goodbye.
Keep normal answers to a few sentences. Songs, stories, and a hard day can run longer. He can talk over you. Stop and listen.
If he asks how to connect QuickBooks: Marty texts a Connect link. Joe opens it on the phone, logs into QuickBooks, taps Allow for Axon for Asphalt. He never types his password into this orb. After Allow, go to QuickBooks is his books. Do not say URI, OAuth, API key, or client secret.
If he says go to QuickBooks, show the books, profit and loss, payroll, roster, or a chart, say only that it is on the left. Do not read the whole report. If he has not tapped Allow yet, say Marty will text the Connect link.
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

function deskRealtimeModel() {
  return process.env.JOE_REALTIME_MODEL || 'gpt-realtime-2.1';
}

function shopperRealtimeModel() {
  return process.env.SHOPPER_REALTIME_MODEL || 'gpt-realtime-2.1';
}

// The shopper's instructions, catalogue and tools arrive over the data channel
// once it opens, because the catalogue lives with the demo. All this has to
// do is open the line on the best model with a voice worth listening to.
function shopperSessionConfig() {
  return JSON.stringify({
    type: 'realtime',
    model: shopperRealtimeModel(),
    output_modalities: ['audio'],
    audio: {
      input: {
        transcription: { model: 'gpt-4o-mini-transcribe' },
        turn_detection: {
          type: 'semantic_vad',
          create_response: true,
          // A shopper changing their mind mid-sentence has to be able to cut
          // the assistant off, the way they would a person.
          interrupt_response: true
        }
      },
      output: { voice: 'coral' }
    }
  });
}

function realtimeSessionConfig(desk) {
  const session = {
    type: 'realtime',
    model: desk ? deskRealtimeModel() : 'gpt-realtime-1.5',
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

async function createRealtimeSession(sdp, res, desk, shopper) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (shopper) return res.status(503).json({ error: 'no key configured' });
    return proxyVoxtalk3Session(sdp, res);
  }

  const fd = new FormData();
  fd.set('sdp', sdp);
  fd.set('session', shopper ? shopperSessionConfig() : realtimeSessionConfig(desk));

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
    await createRealtimeSession(req.body, res, req.query.desk === '1', req.query.shopper === '1');
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

app.get(['/joe-connect', '/joe/connect'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(publicDir, 'joe-connect.html'));
});

app.get('/api/qbo/connect', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!qbo.keysReady()) {
    return res.type('html').send(qbo.htmlPage(
      'Not yet',
      'The two Intuit codes are not in Render, or they still say pending. Put the real codes in, save, then open this link again.'
    ));
  }
  res.redirect(qbo.authorizeUrl());
});

app.get('/api/qbo/callback', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const saved = await qbo.saveFromCallback(req.query);
    const name = saved.company ? ' Connected to ' + saved.company + '.' : ' Joe tapped Allow.';
    res.type('html').send(qbo.htmlPage(
      'QuickBooks is connected',
      name + ' He can say go to QuickBooks on the desk. He does not log in again on the orb.'
    ));
  } catch (error) {
    res.status(400).type('html').send(qbo.htmlPage(
      'Allow did not finish',
      String(error.message || error) + ' Open the Connect link again. On Intuit Keys, the return address must be exactly ' + qbo.redirectUri()
    ));
  }
});

// --- Dierbergs shopper: neural speech -------------------------------------
// The demo is a static page, so it has no way to hold a key. It posts text
// here and this server speaks it with the key Render already provides, which
// keeps the key server-side where it belongs.
const TTS_VOICE = process.env.TTS_VOICE || 'coral';
const TTS_PERSONALITY =
  'You are a warm, upbeat personal shopper at a friendly neighbourhood grocery store. ' +
  'Speak naturally and conversationally, at an easy pace, like a real person helping someone ' +
  'in the aisle. Sound genuinely pleased to help. Never robotic, never salesy, never rushed.';

app.options('/api/tts', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
});

app.post('/api/tts', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'no key configured' });

  const text = String((req.body && req.body.text) || '').slice(0, 1200);
  if (!text.trim()) return res.status(400).json({ error: 'no text' });

  try {
    const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: (req.body && req.body.voice) || TTS_VOICE,
        input: text,
        instructions: TTS_PERSONALITY,
        response_format: 'mp3',
        speed: 1.0
      })
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('TTS error:', upstream.status, detail.slice(0, 200));
      return res.status(upstream.status).json({ error: 'tts failed' });
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    // The same handful of lines repeat all demo long.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(audio);
  } catch (error) {
    console.error('TTS request failed:', error);
    res.status(502).json({ error: 'tts unreachable' });
  }
});

// --- Dierbergs shopper: understanding -------------------------------------
// The shopper's words go to a real model, not a pattern list. A parser can be
// taught that "milks" is "milk", and then "cheeses", and then "not the 18" —
// and it will still be wrong on the next thing a person says. This is the
// difference between a demo that survives a stranger and one that does not.

// Picked from what the key can actually reach rather than hard-coded, so this
// keeps working as the account's models change. Newest family first; audio,
// embedding and reasoning-only variants are not chat models.
const CHAT_FAMILIES = [/^gpt-5[.-]/, /^gpt-5$/, /^gpt-4\.1/, /^gpt-4o/];
const NOT_CHAT = /(audio|realtime|tts|transcribe|embedding|moderation|image|dall-e|whisper|search|instruct)/;

let chatModelPromise = null;

async function pickChatModel(apiKey) {
  if (process.env.SHOPPER_MODEL) return process.env.SHOPPER_MODEL;
  if (chatModelPromise) return chatModelPromise;

  chatModelPromise = (async () => {
    try {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      if (!r.ok) throw new Error(`models ${r.status}`);
      const ids = (await r.json()).data.map((m) => m.id).filter((id) => !NOT_CHAT.test(id));
      for (const family of CHAT_FAMILIES) {
        // Within a family the plain name beats the dated snapshots and the
        // cut-down minis, which is what "the best one available" means here.
        const hits = ids.filter((id) => family.test(id)).sort((a, b) => a.length - b.length);
        const full = hits.find((id) => !/mini|nano/.test(id)) || hits[0];
        if (full) return full;
      }
      return 'gpt-4o';
    } catch (error) {
      console.error('Model list failed, falling back:', error.message);
      chatModelPromise = null;
      return 'gpt-4o';
    }
  })();
  return chatModelPromise;
}

const SHOPPER_BRIEF = `You are the AI shopper built into the Dierbergs grocery website.
A customer is talking to you the way they would talk to a person in the aisle.

You are given the aisles this store has stocked and everything currently on the
customer's screen and in their cart. Decide what should happen next.

Rules:
- Only ever choose products from the list you are given, by their exact id.
- "show" puts products on the shelf. "add" puts ONE product in the cart.
- Never put more than four products on the shelf. If an aisle holds more,
  show the four a shopper would expect to see first.
- Only "add" when one product is clearly the one they mean. If more than one
  still fits, "show" exactly those and ask which — never more than they need
  to choose between.
- Use "chat" only when they are not asking about groceries at all. If they
  named a grocery, something goes on the shelf.
- Never add something they did not ask for.
- A bare "the cheese" means the cheese they asked for earlier in the trip, if
  there is exactly one of those. Otherwise ask which.
- If they rule something out ("not the 18 count"), respect that.
- If they ask for an aisle you do not stock, say so plainly and name a couple
  you do have. Do not pretend.
- "say" is spoken aloud: one or two short sentences, warm, no lists, no
  markdown, no prices unless they matter to the answer.
- "hint" is a short line of on-screen help. It is not spoken.

Following the conversation:
- "That one", "the second one", "the cheaper one", "the big one" and "no, the
  other one" all refer to what is on the shelf right now, in the order given.
- "The wheat one" or "the sharp one" means whichever product on the shelf has
  that kind or attribute. Narrow to it instead of starting the aisle over.
- "No, I meant sourdough" replaces what they asked for. It does not add to it.
- They should never have to say a full product name twice.

What you know and what you do not:
- Each product carries its kind, brand, form, size, price and diet badges.
  Compare on those freely: cheapest, largest, which brands, which forms.
- "diet" is only what Dierbergs marks on the product. Call something organic,
  gluten free, keto or lactose free only if it is listed there. If it is not
  listed, say the store does not flag it — not that it is not.
- You have no ratings, no reviews and no nutrition figures. If asked which is
  best rated or healthiest, say you do not have ratings, then offer to compare
  on price, size, brand or kind.
- Never invent a product, a price or a claim.`;

const SHOPPER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'aisle', 'products', 'say', 'hint'],
  properties: {
    action: { type: 'string', enum: ['show', 'add', 'chat'] },
    aisle: { type: ['string', 'null'], description: 'id of the aisle being shown, or null' },
    products: {
      type: 'array',
      description: 'product ids to put on the shelf, or the single one to add',
      items: { type: 'string' }
    },
    say: { type: 'string' },
    hint: { type: 'string' }
  }
};

app.options('/api/understand', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
});

app.post('/api/understand', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'no key configured' });

  const said = String((req.body && req.body.said) || '').slice(0, 400);
  if (!said.trim()) return res.status(400).json({ error: 'nothing said' });

  const { aisles = [], showing = [], cart = [], history = [] } = req.body || {};

  try {
    const model = await pickChatModel(apiKey);
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SHOPPER_BRIEF },
          {
            role: 'system',
            content:
              `Aisles and products:\n${JSON.stringify(aisles)}\n\n` +
              `Currently on the shelf: ${JSON.stringify(showing)}\n` +
              `Already in the cart: ${JSON.stringify(cart)}\n` +
              `Asked for earlier in this trip: ${JSON.stringify(req.body.asked || [])}`
          },
          ...history.slice(-6),
          { role: 'user', content: said }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'shopper_turn', strict: true, schema: SHOPPER_SCHEMA }
        }
      })
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('Understand error:', upstream.status, detail.slice(0, 300));
      return res.status(upstream.status).json({ error: 'understand failed' });
    }

    const body = await upstream.json();
    const turn = JSON.parse(body.choices[0].message.content);
    res.json({ ...turn, model });
  } catch (error) {
    console.error('Understand request failed:', error);
    res.status(502).json({ error: 'understand unreachable' });
  }
});

// Which models the key can actually reach. Asked often enough — "are we on
// the best one" — that guessing from a hard-coded name is not good enough.
app.get('/api/models', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'no key configured' });
  try {
    const r = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!r.ok) return res.status(r.status).json({ error: 'model list failed' });
    const ids = (await r.json()).data.map((m) => m.id).sort();
    res.json({
      inUse: { voice: shopperRealtimeModel(), text: await pickChatModel(apiKey) },
      realtime: ids.filter((id) => id.includes('realtime')),
      chat: ids.filter((id) => /^gpt-[45]/.test(id) && !NOT_CHAT.test(id))
    });
  } catch (error) {
    console.error('Model list failed:', error);
    res.status(502).json({ error: 'unreachable' });
  }
});

app.get('/api/brain/status', (req, res) => {
  res.json({
    ok: true,
    ...demoBooks.status(),
    ...payrollDemo.status(),
    openai: Boolean(process.env.OPENAI_API_KEY),
    realtime: deskRealtimeModel(),
    shopperRealtime: shopperRealtimeModel(),
    ...qbo.status(),
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
    const qboOn = qbo.isConnected();
    if (!qboOn) {
      const pay = payrollDemo.ask(question);
      if (pay) return res.json(pay);
    }
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
