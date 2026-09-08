/**
 * Serves the local demo with the deployed server's OpenAI key behind it.
 *
 * The Realtime line and the typed understanding both need a key, and the key
 * only lives on Render. Rather than copy it down, this puts the local build
 * and the deployed endpoints on one origin: page requests go to the Next dev
 * server, /session and /api/* go to Render. That is enough to talk to the real
 * model with code that has not been deployed yet.
 *
 *   node scripts/proxy-to-render.mjs            # listens on 3200
 */
import http from "node:http";

const LOCAL = process.env.LOCAL_ORIGIN || "http://localhost:3100";
const REMOTE = process.env.REMOTE_ORIGIN || "https://a1-test-fyjq.onrender.com";
const PORT = Number(process.env.PORT || 3200);

const server = http.createServer(async (req, res) => {
  const toRemote = req.url.startsWith("/session") || req.url.startsWith("/api/");
  const target = `${toRemote ? REMOTE : LOCAL}${req.url}`;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers["accept-encoding"];

  try {
    const upstream = await fetch(target, { method: req.method, headers, body });
    res.writeHead(
      upstream.status,
      Object.fromEntries(
        [...upstream.headers].filter(([k]) => !["content-encoding", "content-length"].includes(k))
      )
    );
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    res.writeHead(502).end(`proxy failed: ${error.message}`);
  }
});

server.listen(PORT, () => console.log(`proxy on http://localhost:${PORT} -> ${LOCAL} + ${REMOTE}`));
