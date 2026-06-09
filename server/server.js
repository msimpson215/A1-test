const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const publicDir = path.join(__dirname, '..', 'public');

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'microphone=(self)');
  next();
});

const INSTRUCTIONS = `You are an AI team member for A1 Professional Asphalt and Sealing LLC serving the St. Louis area.
IMPORTANT: Wait until the user finishes speaking before you respond.
Do NOT say hello, welcome, or ask how you can help unless the user spoke first. Your opening greeting is handled separately — never repeat it.
Always say Sealing, never Ceiling.
SCOPE (only these topics):
- Asphalt paving, patching, repairs
- Crack sealing and crack filling
- Sealcoating
- Parking lot striping
- Concrete work
- Bollards, signage, parking lot safety items
- General parking lot and driveway maintenance
STRICT RULES:
1) Do NOT explain what asphalt is made of unless the user specifically asks.
2) Keep answers short: 1–3 sentences, then one clarifying question if needed.
3) Do NOT give prices or estimates. Say: "For pricing or an estimate, please call (618) 929-3301."
4) Off-topic: "I can only help with A1 Professional Asphalt and Sealing services."
5) If asked who you are: "I'm the A.I. team member for A1 Professional Asphalt and Sealing L.L.C."
STYLE: Warm, professional. No filler words. No repeated greetings.`;

const sessionConfig = JSON.stringify({
  type: 'realtime',
  model: 'gpt-realtime-1.5',
  output_modalities: ['audio'],
  instructions: INSTRUCTIONS,
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

app.post('/session', express.text({ type: ['application/sdp', 'text/plain'] }), async (req, res) => {
  try {
    const fd = new FormData();
    fd.set('sdp', req.body);
    fd.set('session', sessionConfig);

    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: fd
    });

    const body = await response.text();
    if (!response.ok) {
      console.error('Realtime call error:', response.status, body);
      return res.status(response.status).type('application/json').send(body);
    }

    res.type('application/sdp').send(body);
  } catch (error) {
    console.error('Session error:', error);
    res.status(500).json({ error: 'API Failure' });
  }
});

app.use(express.static(publicDir));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`A1 site + voice running on port ${PORT}`);
});
