# Deploy VoxTalk voice fix (2 files)

Live site is still on old build `20260603-691-restore`. These files fix the stop/start/stop voice loop.

## Copy into `msimpson215/a1-asphalt-voxtalk-3`

| This file | Paste into repo path |
|-----------|----------------------|
| `index.html` | `public/index.html` |
| `server.js` | `server/server.js` |

## Steps on GitHub

1. Open https://github.com/msimpson215/a1-asphalt-voxtalk-3
2. Edit `public/index.html` — replace entire file with `voxtalk-handoff/index.html`
3. Edit `server/server.js` — replace entire file with `voxtalk-handoff/server.js`
4. Commit to `main`
5. Wait for Render to redeploy (~2 min)
6. Hard refresh A1 site (Ctrl+Shift+R)

## Verify deploy worked

```bash
curl -s https://a1-asphalt-voxtalk-3.onrender.com/ | grep voxtalk-build
```

Should show: `20260608-v2-wait-audio-stop`

## What this fixes

- Mic stays off during greeting; VAD only turns on after greeting audio **finishes playing**
- `interrupt_response: false` stops the chop/restart loop
- VAD disabled entirely until greeting is done
- Stable embed orb, hidden redundant UI in iframe mode
