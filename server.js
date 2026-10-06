// Paycheck Payoff Planner server.
// Serves the static site in ./public and forwards email signups to a Kit (ConvertKit) form.
// No dependencies: needs Node 18+ for the built-in fetch.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 3000;
const KIT_FORM_ID = process.env.KIT_FORM_ID || '10012089';
const KIT_FORM_URL = `https://app.kit.com/forms/${KIT_FORM_ID}/subscriptions`;
// Typing this into the email box opens the results without subscribing. Leave DEV_CODE empty to turn it off.
const DEV_CODE = (process.env.DEV_CODE ?? 'ABCD').trim().toUpperCase();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 10_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleSubscribe(req, res) {
  let email = '';
  try {
    email = String(JSON.parse(await readBody(req)).email || '').trim();
  } catch {
    return sendJson(res, 400, { error: 'Enter a valid email address, like name@example.com.' });
  }

  if (DEV_CODE && email.toUpperCase() === DEV_CODE) return sendJson(res, 200, { ok: true, dev: true });
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return sendJson(res, 400, { error: 'Enter a valid email address, like name@example.com.' });
  }

  try {
    const kit = await fetch(KIT_FORM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ email_address: email }),
      signal: AbortSignal.timeout(8000)
    });
    if (kit.ok) return sendJson(res, 200, { ok: true });
    const detail = await kit.text().catch(() => '');
    console.error(`Kit rejected signup (${kit.status}): ${detail.slice(0, 300)}`);
    // Kit says the address itself is bad
    if (kit.status === 422 || kit.status === 400) {
      return sendJson(res, 400, { error: 'That email address was not accepted. Check it and try again.' });
    }
    return sendJson(res, 502, { error: 'Could not reach the email list.' });
  } catch (err) {
    console.error('Kit request failed:', err.message);
    return sendJson(res, 502, { error: 'Could not reach the email list.' });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/subscribe')) {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
      return await handleSubscribe(req, res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end('Method not allowed');
      return;
    }
    await serveStatic(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500).end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`Paycheck Payoff Planner running at http://localhost:${PORT}`);
});
