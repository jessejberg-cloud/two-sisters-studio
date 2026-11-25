// A pretend Netlify for the robot-phone tests (tests/e2e). Nothing here reaches the real site, real storage or real Google.
//   - The real front door (netlify/edge-functions/gate.js) and the real functions (netlify/functions/*.mjs) run here.
//   - Netlify Blobs is swapped for in-memory stores (useTestStores), so every run starts empty.
//   - Google sign-in and Google Drive are fakes: the server's calls go to fakeGoogle() below. The phone's own uploads
//     go to the one-time addresses the site hands out, which here point back to this server (/__fake-google/upload),
//     and Google's sign-in page is skipped (straight back to the site's callback). Nothing in the browser is rerouted,
//     so every browser engine (Safari's too) behaves as it would on the real site.
//   - Pages and files come from dist/ (run `node tools/build.cjs` first), with netlify.toml's headers and studio fallback.
// Start: node tests/e2e/server.mjs [port]   (Playwright starts it by itself, see playwright.config.mjs)
// Test-only addresses: GET /__test/drive (what the fake Drive holds), POST /__test/reset (empty everything),
// POST /__test/signal?on=0|1 (no signal: every other request is cut off, the way a phone in a dead zone sees it).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.argv[2] || process.env.E2E_PORT || 5199);

import { TEST } from './values.mjs';
Object.assign(process.env, {
  TSS_SECRET: 'e2e-'.repeat(12), FAMILY_PASSWORD: TEST.family, FRIENDS_PASSWORD: TEST.friends,
  PARENT_PIN: TEST.pin, GOOGLE_CLIENT_SECRET: 'fake', CONTEXT: 'deploy-preview',
});

const { useTestStores } = await import(pathToFileURL(path.join(ROOT, 'netlify/lib/store.mjs')));
let stores = {};
useTestStores(stores);

// ---------- fake Google ----------
const drive = { files: [], n: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (/^https:\/\/([a-z0-9-]+\.)?(googleapis|google)\.com\//.test(u)) return fakeGoogle(u, opts);
  if (u.startsWith(`http://localhost:${PORT}`) || u.startsWith(`http://127.0.0.1:${PORT}`)) return realFetch(url, opts);
  // Anything else would be a real network call from the server: refuse it loudly so a test fails instead.
  console.error('[e2e server] blocked outside call:', u);
  return new Response('blocked by the e2e server', { status: 599 });
};
async function fakeGoogle(u, opts) {
  const method = (opts.method || 'GET').toUpperCase();
  if (u.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'fake-access', expires_in: 3600, refresh_token: 'fake-refresh', scope: 'https://www.googleapis.com/auth/drive.file' });
  if (u.includes('/oauth2/') && u.includes('userinfo')) return Response.json({ email: 'test@example.com' });
  if (u.includes('/drive/v3/about')) return Response.json({ storageQuota: { limit: '16106127360', usage: '1000' }, user: { emailAddress: 'test@example.com' } });
  if (u.includes('uploadType=resumable')) {
    const id = 'R' + (++drive.n);
    drive.files.push({ id, kind: 'resumable', meta: safeJson(opts.body) });
    return new Response(null, { headers: { location: `http://localhost:${PORT}/__fake-google/upload?upload_id=${id}` } });
  }
  if (u.includes('uploadType=multipart')) {
    const id = u.match(/files\/([A-Za-z0-9_-]+)\?/)?.[1] || 'M' + (++drive.n);
    drive.files.push({ id, kind: 'multipart', method });
    return Response.json({ id });
  }
  if (u.includes('/drive/v3/files?') && method === 'GET') {
    // Answers the "name = 'x' and 'parent' in parents" folder search the site makes.
    const q = new URL(u).searchParams.get('q') || '';
    const name = q.match(/name = '((?:[^'\\]|\\.)*)'/)?.[1]?.replace(/\\(.)/g, '$1');
    const parent = q.match(/'([^']+)' in parents/)?.[1];
    return Response.json({ files: drive.files.filter((f) => f.kind === 'folder' && (!name || f.name === name) && (!parent || f.parent === parent)).map((f) => ({ id: f.id, name: f.name })) });
  }
  if (u.includes('/drive/v3/files?') && method === 'POST') {
    const meta = safeJson(opts.body) || {};
    const id = 'F' + (++drive.n);
    drive.files.push({ id, kind: meta.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file', name: meta.name, parent: meta.parents?.[0] });
    return Response.json({ id, name: meta.name });
  }
  if (u.includes('/drive/v3/files/')) return Response.json({ id: u.split('/files/')[1].split('?')[0] });
  return Response.json({});
}
// "Two Sisters Studio/Leora/2026-2027/fall/<file>" for every file the site asked Drive to make.
function drivePaths() {
  const byId = Object.fromEntries(drive.files.map((f) => [f.id, f]));
  const where = (id) => { const f = byId[id]; return !f || id === 'root' ? [] : [...where(f.parent), f.name]; };
  return drive.files.filter((f) => f.kind === 'resumable').map((f) => [...where(f.meta?.parents?.[0]), f.meta?.name].join('/'));
}
function safeJson(b) { try { return typeof b === 'string' ? JSON.parse(b) : null; } catch { return null; } }

// ---------- the real code ----------
const { default: gate, config: gateConfig } = await import(pathToFileURL(path.join(ROOT, 'netlify/edge-functions/gate.js')));
const fnDir = path.join(ROOT, 'netlify/functions');
const routes = [];
for (const f of fs.readdirSync(fnDir).filter((f) => f.endsWith('.mjs'))) {
  const mod = await import(pathToFileURL(path.join(fnDir, f)));
  const paths = [mod.config?.path].flat().filter(Boolean);
  for (const p of paths) routes.push({ re: globRe(p), fn: mod.default, name: f });
}
const gateSkip = (gateConfig.excludedPath || []).map(globRe);
function globRe(p) { return new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'); }

async function connectDrive() {
  const { saveGoogle } = await import(pathToFileURL(path.join(ROOT, 'netlify/lib/drive.mjs')));
  await saveGoogle(ctx(), 'fake-refresh', {});
}
await connectDrive();

// netlify.toml headers (the "/*" block and friends), applied like Netlify does.
const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
const headerRules = [...toml.matchAll(/\[\[headers\]\]\s*for\s*=\s*"([^"]+)"\s*\[headers\.values\]([\s\S]*?)(?=\n\[\[|\n#|$)/g)]
  .map(([, f, body]) => ({ re: globRe(f), values: [...body.matchAll(/^\s*([A-Za-z-]+)\s*=\s*"([^"]*)"/gm)].map((m) => [m[1], m[2]]) }));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.txt': 'text/plain', '.zip': 'application/zip', '.mjs': 'text/javascript', '.pdf': 'application/pdf' };

function staticFile(pathname) {
  let p = decodeURIComponent(pathname);
  const tries = p.endsWith('/') ? [p + 'index.html'] : [p, p + '/index.html', p + '.html'];
  for (const t of tries) {
    const full = path.join(DIST, t);
    if (full.startsWith(DIST) && fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}
function serveFile(full, status = 200) {
  return new Response(fs.readFileSync(full), { status, headers: { 'content-type': TYPES[path.extname(full)] || 'application/octet-stream' } });
}

function ctx(req, ip = '127.0.0.1') {
  return {
    ip, deploy: { context: 'deploy-preview' }, geo: {}, params: {},
    cookies: { get: () => undefined, set: () => {}, delete: () => {} },
    waitUntil: () => {},
    next: () => origin(req),
    rewrite: (to) => origin(new Request(new URL(to, req.url), req)),
  };
}

// What Netlify does after the front door: functions first, then real files, then the studio fallback page.
async function origin(req) {
  const url = new URL(req.url);
  const route = routes.find((r) => r.re.test(url.pathname));
  if (route) return route.fn(req, ctx(req));
  const file = staticFile(url.pathname);
  if (file) return serveFile(file);
  return serveFile(path.join(DIST, 'studio/index.html'));
}

async function handle(req) {
  const url = new URL(req.url);
  if (url.pathname === '/__test/drive') return Response.json({ ...drive, paths: drivePaths() });
  if (url.pathname === '/__test/reset' && req.method === 'POST') {
    for (const k of Object.keys(stores)) delete stores[k];
    drive.files = []; drive.n = 0; signal = true;
    await connectDrive();
    return Response.json({ ok: true });
  }
  if (url.pathname === '/__fake-google/upload') {   // the phone sending an original to "Drive"
    const id = url.searchParams.get('upload_id');
    const bytes = req.body ? (await req.arrayBuffer()).byteLength : 0;
    const f = drive.files.find((x) => x.id === id);
    if (f) f.bytes = (f.bytes || 0) + bytes;
    return Response.json({ id }, { headers: { 'access-control-allow-origin': '*' } });
  }
  let res = gateSkip.some((re) => re.test(url.pathname)) ? await origin(req) : await gate(req, ctx(req));
  // Google's sign-in page, skipped: the site sent the phone to accounts.google.com; send it straight back with a code.
  const to = res.headers.get('location') || '';
  if (to.startsWith('https://accounts.google.com/')) {
    const g = new URL(to), back = new URL(g.searchParams.get('redirect_uri'));
    back.search = new URLSearchParams({ code: 'fake-code', state: g.searchParams.get('state') }).toString();
    const h = new Headers(res.headers); h.set('location', back.toString());
    res = new Response(null, { status: res.status, headers: h });
  }
  res = new Response(res.body, res);
  for (const rule of headerRules) if (rule.re.test(url.pathname)) for (const [k, v] of rule.values) if (!res.headers.has(k)) res.headers.set(k, v);
  return res;
}

let signal = true;
http.createServer(async (nreq, nres) => {
  if (nreq.url.startsWith('/__test/signal')) { signal = !nreq.url.includes('on=0'); nres.end('ok'); return; }
  if (!signal && !nreq.url.startsWith('/__test/')) { nreq.socket.destroy(); return; }
  try {
    const url = `http://localhost:${PORT}${nreq.url}`;
    const hasBody = !['GET', 'HEAD'].includes(nreq.method);
    const req = new Request(url, { method: nreq.method, headers: nreq.headers, body: hasBody ? nreq : undefined, duplex: 'half', redirect: 'manual' });
    const res = await handle(req);
    const headers = {};
    res.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v; });
    // Browsers keep "Secure" cookies on http://localhost in Chromium, not always in WebKit: drop the flag here only.
    const cookies = res.headers.getSetCookie().map((c) => c.replace(/;\s*Secure/i, ''));
    if (cookies.length) headers['set-cookie'] = cookies;
    nres.writeHead(res.status, headers);
    if (res.body && nreq.method !== 'HEAD') for await (const chunk of res.body) nres.write(chunk);
    nres.end();
  } catch (e) {
    console.error('[e2e server]', nreq.method, nreq.url, e);
    nres.writeHead(500, { 'content-type': 'text/plain' }); nres.end('e2e server error: ' + e.message);
  }
}).listen(PORT, () => console.log(`e2e server on http://localhost:${PORT}`));
