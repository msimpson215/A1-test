const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const publicDir = path.join(__dirname, '..', 'public');

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'microphone=(self)');
  next();
});

// Session behavior only. The opening "Hello" is triggered once in public/voice/index.html.
const SESSION_INSTRUCTIONS = `You help with A1 Professional Asphalt and Sealing in the St. Louis area.
Answer in 1-3 sentences after the user speaks. Say Sealing, never Ceiling.
No prices — say: "For pricing, call (618) 929-3301."
Off-topic: "I can only help with A1 asphalt and sealing services."`;

const sessionConfig = JSON.stringify({
  type: 'realtime',
  model: 'gpt-realtime-1.5',
  output_modalities: ['audio'],
  instructions: SESSION_INSTRUCTIONS,
  audio: {
    input: {
      turn_detection: {
        type: 'server_vad',
        silence_duration_ms: 2000,
        prefix_padding_ms: 300,
        create_response: false,
        interrupt_response: false
      }
    },
    output: {
      voice: 'coral'
    }
  }
});

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

async function createRealtimeSession(sdp, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return proxyVoxtalk3Session(sdp, res);
  }

  const fd = new FormData();
  fd.set('sdp', sdp);
  fd.set('session', sessionConfig);

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
    await createRealtimeSession(req.body, res);
  } catch (error) {
    console.error('Session error:', error);
    res.status(500).json({ error: 'API Failure' });
  }
});

app.post('/voxtalk3/session', express.text({ type: ['application/sdp', 'text/plain'] }), async (req, res) => {
  try {
    await createRealtimeSession(req.body, res);
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
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use(express.static(publicDir));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  const voiceMode = process.env.OPENAI_API_KEY ? 'direct-openai' : `proxy:${VOXTALK3_BACKEND}`;
  console.log(`A1 site + voice running on port ${PORT} (${voiceMode})`);
});
