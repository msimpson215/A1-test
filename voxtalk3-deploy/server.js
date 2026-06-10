import express from 'express'
import dotenv from 'dotenv'

dotenv.config()

const app = express()

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'microphone=(self)')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  next()
})

app.use(express.static('public'))

// One greeting only (triggered from the browser). Never duplicate hello in instructions.
const INSTRUCTIONS = `You are an AI team member for A1 Professional Asphalt and Concrete serving the St. Louis area.
IMPORTANT: Wait until the user finishes speaking before you respond.
Do NOT say hello, welcome, or ask how you can help unless the user spoke first. Your opening greeting is handled separately.
SCOPE (only these topics):
- Asphalt paving, patching, repairs
- Crack sealing
- Sealcoating
- Parking lot striping
- Concrete work
- Bollards (yellow safety posts), signage posts, parking lot safety items
- General parking lot/driveway maintenance
- St. Louis area context
STRICT RULES:
1) Do NOT explain what asphalt is made of unless the user specifically asks.
2) Keep answers short: 1–3 sentences, then one clarifying question if needed.
3) Do NOT give prices or estimates. Say: "For pricing or an estimate, please call (618) 929-3301."
4) Off-topic: "I can only help with A1 asphalt and concrete services."
5) If asked who you are: "I'm an AI team member for A1 Professional Asphalt and Concrete."
STYLE: Warm, cheerful, upbeat, professional. No filler words. No repeated greetings.`

const sessionConfig = JSON.stringify({
  type: 'realtime',
  model: 'gpt-realtime-1.5',
  output_modalities: ['audio'],
  instructions: 'You are the A1 Asphalt AI assistant. Wait for the user to speak first. Do NOT greet or say hello until they talk. Then answer in 1-3 sentences. Say Sealing not Ceiling. No prices — say call (618) 929-3301.',
  audio: {
    input: {
      noise_reduction: { type: 'far_field' },
      turn_detection: null
    },
    output: {
      voice: 'coral'
    }
  }
})

app.post('/session', express.text({ type: ['application/sdp', 'text/plain'] }), async (req, res) => {
  try {
    const fd = new FormData()
    fd.set('sdp', req.body)
    fd.set('session', sessionConfig)

    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: fd
    })

    const body = await response.text()
    if (!response.ok) {
      console.error('Realtime call error:', response.status, body)
      return res.status(response.status).type('application/json').send(body)
    }

    res.type('application/sdp').send(body)
  } catch (error) {
    console.error('Session error:', error)
    res.status(500).json({ error: 'API Failure' })
  }
})

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`)
})
