# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Static marketing website for A1 Professional Asphalt & Sealing LLC, served by a Node.js/Express server. Single dependency: `express`. No database, no build step, no test suite, no linter configured.

### Starting the dev server

The `npm start` script (`node server.js`) does **not** work from the repo root because the entry point lives at `server/server.js`. Use this instead:

```bash
node server/server.js
```

The server serves `public/` as static files on port `10000` (override with `PORT` env var). All 25 HTML pages are in `public/`.

### No lint / test / build

This repo has no linter, no automated tests, and no build pipeline. Validation is limited to starting the server and confirming pages load (e.g., `curl -s -o /dev/null -w "%{http_code}" http://localhost:10000/`).

### External services

The site embeds an external AI chatbot iframe hosted on Render (`a1-asphalt-voxtalk-3.onrender.com`). This is not part of this repo and may be unavailable — it does not block local development.
